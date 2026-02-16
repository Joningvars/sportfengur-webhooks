/**
 * Data normalization functions for vMix integration
 * Transforms vendor API responses into stable vMix-friendly schemas
 */

/**
 * Calculate age from faedingarnumer (birth ID)
 */
function calculateAldur(faedingarnumer) {
  if (!faedingarnumer || typeof faedingarnumer !== 'string') return '';
  const match = faedingarnumer.match(/(\d{4})/);
  if (!match) return '';
  const year = Number(match[1]);
  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    year > new Date().getFullYear()
  ) {
    return '';
  }
  return new Date().getFullYear() - year;
}

/**
 * Format score to 2 decimal places without rounding and return as string
 * Handles both comma and dot decimal separators
 */
function roundScore(value) {
  if (value === null || value === undefined || value === '') return '';

  // Convert comma decimal separator to dot
  let strValue = String(value).replace(',', '.');

  const num = Number(strValue);
  if (!Number.isFinite(num)) return '';

  // Truncate to 2 decimal places without rounding
  const truncated = Math.floor(num * 100) / 100;

  // Format and remove trailing zeros
  return truncated.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Sanitize gait type name for use as JSON key
 * @param {string} gaitType - Raw gait type from API
 * @returns {string} Sanitized key
 */
function sanitizeGaitKey(gaitType) {
  return String(gaitType)
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[áàâä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòôö]/g, 'o')
    .replace(/[úùûü]/g, 'u')
    .replace(/[ýÿ]/g, 'y')
    .replace(/[ð]/g, 'd')
    .replace(/[þ]/g, 'th')
    .replace(/[æ]/g, 'ae');
}

/**
 * Extract gait-specific scores from judge data
 * Returns object with individual judge scores for each gait type as nested objects
 * @param {array} judges - Array of judge objects with sundurlidun_einkunna
 * @returns {object} Object with adal and dynamic gait type objects
 */
function extractGaitScores(judges) {
  const gaitScores = {
    adal: {},
  };

  if (!Array.isArray(judges) || judges.length === 0) {
    return gaitScores;
  }

  // Extract main judge scores (adal) - E1 through E5
  judges.slice(0, 5).forEach((judge, index) => {
    const mainScore = judge?.domari_adaleinkunn;
    if (mainScore !== null && mainScore !== undefined) {
      gaitScores.adal[`E${index + 1}`] = roundScore(mainScore);
    }
  });

  // Ensure all E1-E5 exist in adal (fill with empty strings if missing)
  for (let i = 1; i <= 5; i++) {
    if (!gaitScores.adal[`E${i}`]) {
      gaitScores.adal[`E${i}`] = '';
    }
  }

  // Add E6 (average) to adal
  const adalScores = Object.values(gaitScores.adal).filter((s) => s !== '');
  if (adalScores.length > 0) {
    const sum = adalScores.reduce((a, b) => a + Number(b), 0);
    const avg = sum / adalScores.length;
    gaitScores.adal.E6 = roundScore(avg);
  } else {
    gaitScores.adal.E6 = '';
  }

  // Process each judge for gait-specific scores
  const gaitMaps = {};
  const gaitTitles = {}; // Store original gait type names

  judges.slice(0, 5).forEach((judge, judgeIndex) => {
    const breakdown = judge?.sundurlidun_einkunna;
    if (!Array.isArray(breakdown)) return;

    for (const item of breakdown) {
      const gaitType = item?.gangtegund;
      const score = item?.einkunn;

      if (!gaitType || score === null || score === undefined) continue;

      // Use the full gait type name as key (sanitized for JSON keys)
      const gaitKey = sanitizeGaitKey(gaitType);

      if (!gaitMaps[gaitKey]) {
        gaitMaps[gaitKey] = new Map();
        gaitTitles[gaitKey] = gaitType; // Store original title
      }
      gaitMaps[gaitKey].set(judgeIndex, roundScore(score));
    }
  });

  // Convert maps to objects and add E6 (average)
  Object.keys(gaitMaps).forEach((gaitKey) => {
    const map = gaitMaps[gaitKey];
    const scores = [];
    gaitScores[gaitKey] = {
      _title: gaitTitles[gaitKey], // Store original title with underscore prefix
    };

    // Add E1-E5
    for (let i = 0; i < 5; i++) {
      if (map.has(i)) {
        gaitScores[gaitKey][`E${i + 1}`] = map.get(i);
        scores.push(Number(map.get(i)));
      } else {
        gaitScores[gaitKey][`E${i + 1}`] = '';
      }
    }

    // Add E6 (average)
    if (scores.length > 0) {
      const sum = scores.reduce((a, b) => a + b, 0);
      const avg = sum / scores.length;
      gaitScores[gaitKey].E6 = roundScore(avg);
    } else {
      gaitScores[gaitKey].E6 = '';
      // Remove this gait type if it has no scores
      delete gaitScores[gaitKey];
    }
  });

  return gaitScores;
}

/**
 * Normalizes current rider data from vendor API response
 * @param {object} apiResponse - Raw vendor API response for current rider
 * @returns {object} Normalized current rider data with all competition fields
 *
 * Validates: Requirements 5.1, 5.5
 */
export function normalizeCurrent(apiResponse) {
  if (!apiResponse || typeof apiResponse !== 'object') {
    return {
      Nr: '',
      Saeti: '',
      Holl: '',
      Hond: '',
      Knapi: '',
      LiturRas: '',
      FelagKnapa: '',
      Hestur: '',
      Litur: '',
      Aldur: '',
      FelagEiganda: '',
      Lid: '',
      NafnBIG: '',
      E1: '',
      E2: '',
      E3: '',
      E4: '',
      E5: '',
      E6: '',
      adal: {
        E1: '',
        E2: '',
        E3: '',
        E4: '',
        E5: '',
        E6: '',
      },
      timestamp: new Date().toISOString(),
    };
  }

  const riderName = String(
    apiResponse.knapi_fullt_nafn ||
      apiResponse.knapi_fulltnafn ||
      apiResponse.knapi_nafn ||
      '',
  );
  const horseName = String(
    apiResponse.hross_fullt_nafn ||
      apiResponse.hross_fulltnafn ||
      apiResponse.hross_nafn ||
      '',
  );

  // Extract judge scores (E1-E5)
  const judges = Array.isArray(apiResponse.einkunnir_domara)
    ? apiResponse.einkunnir_domara
    : [];
  const judgeScores = judges
    .slice(0, 5)
    .map((j) => roundScore(j?.domari_adaleinkunn));

  // Extract gait-specific scores
  const gaitScores = extractGaitScores(judges);

  return {
    Nr: String(apiResponse.vallarnumer || ''),
    Saeti: String(apiResponse.saeti || apiResponse.fmt_saeti || ''),
    Holl: String(apiResponse.holl || ''),
    Hond: String(apiResponse.hond || ''),
    Knapi: riderName,
    LiturRas:
      apiResponse.rodun_litur_numer != null && apiResponse.rodun_litur
        ? `${apiResponse.rodun_litur_numer} - ${apiResponse.rodun_litur}`
        : String(apiResponse.rodun_litur || ''),
    FelagKnapa: String(apiResponse.adildarfelag_knapa || ''),
    Hestur: horseName,
    Litur: String(apiResponse.hross_litur || ''),
    Aldur: String(calculateAldur(apiResponse.faedingarnumer)),
    FelagEiganda: String(apiResponse.adildarfelag_eiganda || ''),
    Lid: '',
    NafnBIG: riderName ? riderName.toUpperCase() : '',
    E1: judgeScores[0] || '',
    E2: judgeScores[1] || '',
    E3: judgeScores[2] || '',
    E4: judgeScores[3] || '',
    E5: judgeScores[4] || '',
    E6: roundScore(apiResponse.keppandi_medaleinkunn),
    ...gaitScores,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Normalizes leaderboard data from vendor API response
 * @param {array} apiResponse - Raw vendor API response array for leaderboard
 * @returns {array} Normalized leaderboard entries with all competition fields
 *
 * Validates: Requirements 5.2, 5.5
 */
export function normalizeLeaderboard(apiResponse) {
  if (!Array.isArray(apiResponse)) {
    return [];
  }

  return apiResponse
    .filter((entry) => entry && entry.keppandi_medaleinkunn != null)
    .map((entry) => {
      const riderName = String(
        entry.knapi_fullt_nafn ||
          entry.knapi_fulltnafn ||
          entry.knapi_nafn ||
          '',
      );
      const horseName = String(
        entry.hross_fullt_nafn ||
          entry.hross_fulltnafn ||
          entry.hross_nafn ||
          '',
      );

      // Extract judge scores (E1-E5)
      const judges = Array.isArray(entry.einkunnir_domara)
        ? entry.einkunnir_domara
        : [];
      const judgeScores = judges
        .slice(0, 5)
        .map((j) => roundScore(j?.domari_adaleinkunn));

      // Extract gait-specific scores
      const gaitScores = extractGaitScores(judges);

      return {
        Nr: String(entry.vallarnumer || ''),
        Saeti: String(entry.saeti || entry.fmt_saeti || ''),
        Holl: String(entry.holl || ''),
        Hond: String(entry.hond || ''),
        Knapi: riderName,
        LiturRas:
          entry.rodun_litur_numer != null && entry.rodun_litur
            ? `${entry.rodun_litur_numer} - ${entry.rodun_litur}`
            : String(entry.rodun_litur || ''),
        FelagKnapa: String(entry.adildarfelag_knapa || ''),
        Hestur: horseName,
        Litur: String(entry.hross_litur || ''),
        Aldur: String(calculateAldur(entry.faedingarnumer)),
        FelagEiganda: String(entry.adildarfelag_eiganda || ''),
        Lid: '',
        NafnBIG: riderName ? riderName.toUpperCase() : '',
        E1: judgeScores[0] || '',
        E2: judgeScores[1] || '',
        E3: judgeScores[2] || '',
        E4: judgeScores[3] || '',
        E5: judgeScores[4] || '',
        E6: roundScore(entry.keppandi_medaleinkunn),
        ...gaitScores,
      };
    })
    .sort((a, b) => {
      const rankA = Number(a.Saeti) || 999;
      const rankB = Number(b.Saeti) || 999;
      return rankA - rankB;
    });
}

/**
 * Converts normalized leaderboard array to CSV string
 * @param {array} leaderboard - Normalized leaderboard array
 * @returns {string} CSV formatted leaderboard with headers
 *
 * Validates: Requirements 5.3, 5.4
 */
export function leaderboardToCsv(leaderboard) {
  const headers =
    'Nr,Saeti,Holl,Hond,Knapi,LiturRas,FelagKnapa,Hestur,Litur,Aldur,FelagEiganda,Lid,NafnBIG,E1,E2,E3,E4,E5,E6,adalE1,adalE2,adalE3,adalE4,adalE5,adalE6,toltE1,toltE2,toltE3,toltE4,toltE5,toltE6,brokkE1,brokkE2,brokkE3,brokkE4,brokkE5,brokkE6,skeðE1,skeðE2,skeðE3,skeðE4,skeðE5,skeðE6,stökkE1,stökkE2,stökkE3,stökkE4,stökkE5,stökkE6,hægtE1,hægtE2,hægtE3,hægtE4,hægtE5,hægtE6';

  if (!Array.isArray(leaderboard) || leaderboard.length === 0) {
    return headers + '\n';
  }

  const rows = leaderboard.map((entry) => {
    const nr = entry.Nr || '';
    const saeti = entry.Saeti || '';
    const holl = entry.Holl || '';
    const hond = entry.Hond || '';
    const knapi = escapeCsvField(entry.Knapi || '');
    const liturRas = escapeCsvField(entry.LiturRas || '');
    const felagKnapa = escapeCsvField(entry.FelagKnapa || '');
    const hestur = escapeCsvField(entry.Hestur || '');
    const litur = escapeCsvField(entry.Litur || '');
    const aldur = entry.Aldur || '';
    const felagEiganda = escapeCsvField(entry.FelagEiganda || '');
    const lid = entry.Lid || '';
    const nafnBIG = escapeCsvField(entry.NafnBIG || '');
    const e1 = entry.E1 || '';
    const e2 = entry.E2 || '';
    const e3 = entry.E3 || '';
    const e4 = entry.E4 || '';
    const e5 = entry.E5 || '';
    const e6 = entry.E6 || '';
    const adalE1 = entry.adalE1 || '';
    const adalE2 = entry.adalE2 || '';
    const adalE3 = entry.adalE3 || '';
    const adalE4 = entry.adalE4 || '';
    const adalE5 = entry.adalE5 || '';
    const adalE6 = entry.adalE6 || '';
    const toltE1 = entry.toltE1 || '';
    const toltE2 = entry.toltE2 || '';
    const toltE3 = entry.toltE3 || '';
    const toltE4 = entry.toltE4 || '';
    const toltE5 = entry.toltE5 || '';
    const toltE6 = entry.toltE6 || '';
    const brokkE1 = entry.brokkE1 || '';
    const brokkE2 = entry.brokkE2 || '';
    const brokkE3 = entry.brokkE3 || '';
    const brokkE4 = entry.brokkE4 || '';
    const brokkE5 = entry.brokkE5 || '';
    const brokkE6 = entry.brokkE6 || '';
    const skeðE1 = entry.skeðE1 || '';
    const skeðE2 = entry.skeðE2 || '';
    const skeðE3 = entry.skeðE3 || '';
    const skeðE4 = entry.skeðE4 || '';
    const skeðE5 = entry.skeðE5 || '';
    const skeðE6 = entry.skeðE6 || '';
    const stökkE1 = entry.stökkE1 || '';
    const stökkE2 = entry.stökkE2 || '';
    const stökkE3 = entry.stökkE3 || '';
    const stökkE4 = entry.stökkE4 || '';
    const stökkE5 = entry.stökkE5 || '';
    const stökkE6 = entry.stökkE6 || '';
    const hægtE1 = entry.hægtE1 || '';
    const hægtE2 = entry.hægtE2 || '';
    const hægtE3 = entry.hægtE3 || '';
    const hægtE4 = entry.hægtE4 || '';
    const hægtE5 = entry.hægtE5 || '';
    const hægtE6 = entry.hægtE6 || '';

    return `${nr},${saeti},${holl},${hond},${knapi},${liturRas},${felagKnapa},${hestur},${litur},${aldur},${felagEiganda},${lid},${nafnBIG},${e1},${e2},${e3},${e4},${e5},${e6},${adalE1},${adalE2},${adalE3},${adalE4},${adalE5},${adalE6},${toltE1},${toltE2},${toltE3},${toltE4},${toltE5},${toltE6},${brokkE1},${brokkE2},${brokkE3},${brokkE4},${brokkE5},${brokkE6},${skeðE1},${skeðE2},${skeðE3},${skeðE4},${skeðE5},${skeðE6},${stökkE1},${stökkE2},${stökkE3},${stökkE4},${stökkE5},${stökkE6},${hægtE1},${hægtE2},${hægtE3},${hægtE4},${hægtE5},${hægtE6}`;
  });

  return headers + '\n' + rows.join('\n') + '\n';
}

/**
 * Escapes a CSV field if it contains special characters
 * @param {string} field - Field value to escape
 * @returns {string} Escaped field value
 */
function escapeCsvField(field) {
  const str = String(field);

  // If field contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}
