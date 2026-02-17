
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

function roundScore(value) {
  if (value === null || value === undefined || value === '') return '';

  let strValue = String(value).replace(',', '.');

  const num = Number(strValue);
  if (!Number.isFinite(num)) return '';

  const truncated = Math.floor(num * 100) / 100;

  return truncated.toFixed(2).replace(/\.?0+$/, '');
}

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

function extractGaitScores(judges) {
  const gaitScores = {
    adal: {},
  };

  if (!Array.isArray(judges) || judges.length === 0) {
    return gaitScores;
  }

  judges.slice(0, 5).forEach((judge, index) => {
    const mainScore = judge?.domari_adaleinkunn;
    if (mainScore !== null && mainScore !== undefined) {
      gaitScores.adal[`E${index + 1}`] = roundScore(mainScore);
    }
  });

  for (let i = 1; i <= 5; i++) {
    if (!gaitScores.adal[`E${i}`]) {
      gaitScores.adal[`E${i}`] = '';
    }
  }

  const adalScores = Object.values(gaitScores.adal).filter((s) => s !== '');
  if (adalScores.length > 0) {
    const sum = adalScores.reduce((a, b) => a + Number(b), 0);
    const avg = sum / adalScores.length;
    gaitScores.adal.E6 = roundScore(avg);
  } else {
    gaitScores.adal.E6 = '';
  }

  const gaitMaps = {};
  const gaitTitles = {};

  judges.slice(0, 5).forEach((judge, judgeIndex) => {
    const breakdown = judge?.sundurlidun_einkunna;
    if (!Array.isArray(breakdown)) return;

    for (const item of breakdown) {
      const gaitType = item?.gangtegund;
      const score = item?.einkunn;

      if (!gaitType || score === null || score === undefined) continue;

      const gaitKey = sanitizeGaitKey(gaitType);

      if (!gaitMaps[gaitKey]) {
        gaitMaps[gaitKey] = new Map();
        gaitTitles[gaitKey] = gaitType;
      }
      gaitMaps[gaitKey].set(judgeIndex, roundScore(score));
    }
  });

  Object.keys(gaitMaps).forEach((gaitKey) => {
    const map = gaitMaps[gaitKey];
    const scores = [];
    gaitScores[gaitKey] = {
      _title: gaitTitles[gaitKey],
    };

    for (let i = 0; i < 5; i++) {
      if (map.has(i)) {
        gaitScores[gaitKey][`E${i + 1}`] = map.get(i);
        scores.push(Number(map.get(i)));
      } else {
        gaitScores[gaitKey][`E${i + 1}`] = '';
      }
    }

    if (scores.length > 0) {
      const sum = scores.reduce((a, b) => a + b, 0);
      const avg = sum / scores.length;
      gaitScores[gaitKey].E6 = roundScore(avg);
    } else {
      gaitScores[gaitKey].E6 = '';
      delete gaitScores[gaitKey];
    }
  });

  return gaitScores;
}

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

  const judges = Array.isArray(apiResponse.einkunnir_domara)
    ? apiResponse.einkunnir_domara
    : [];
  const judgeScores = judges
    .slice(0, 5)
    .map((j) => roundScore(j?.domari_adaleinkunn));

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

export function normalizeLeaderboard(apiResponse) {
  if (!Array.isArray(apiResponse)) {
    return [];
  }

  return apiResponse
    .filter((entry) => entry != null)
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

      const judges = Array.isArray(entry.einkunnir_domara)
        ? entry.einkunnir_domara
        : [];
      const judgeScores = judges
        .slice(0, 5)
        .map((j) => roundScore(j?.domari_adaleinkunn));

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

export function leaderboardToCsv(leaderboard) {
  const baseHeaders = [
    'Nr',
    'Saeti',
    'Holl',
    'Hond',
    'Knapi',
    'LiturRas',
    'FelagKnapa',
    'Hestur',
    'Litur',
    'Aldur',
    'FelagEiganda',
    'Lid',
    'NafnBIG',
    'E1',
    'E2',
    'E3',
    'E4',
    'E5',
    'E6',
    'adalE1',
    'adalE2',
    'adalE3',
    'adalE4',
    'adalE5',
    'adalE6',
  ];

  if (!Array.isArray(leaderboard) || leaderboard.length === 0) {
    return baseHeaders.join(',') + '\n';
  }

  const excludedKeys = new Set([
    'Nr',
    'Saeti',
    'Holl',
    'Hond',
    'Knapi',
    'LiturRas',
    'FelagKnapa',
    'Hestur',
    'Litur',
    'Aldur',
    'FelagEiganda',
    'Lid',
    'NafnBIG',
    'E1',
    'E2',
    'E3',
    'E4',
    'E5',
    'E6',
    'adal',
    'timestamp',
  ]);

  const gaitKeys = new Set();
  for (const entry of leaderboard) {
    for (const [key, value] of Object.entries(entry || {})) {
      if (excludedKeys.has(key)) continue;
      if (value && typeof value === 'object') {
        gaitKeys.add(key);
      }
    }
  }

  const priority = [
    'tolt_frjals_hradi',
    'haegt_tolt',
    'tolt_med_slakan_taum',
    'brokk',
    'skeid',
    'flugskeid',
    'stokk',
  ];
  const sortedGaitKeys = [...gaitKeys].sort((a, b) => {
    const ai = priority.indexOf(a);
    const bi = priority.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  const gaitHeaders = [];
  for (const key of sortedGaitKeys) {
    gaitHeaders.push(
      `${key}E1`,
      `${key}E2`,
      `${key}E3`,
      `${key}E4`,
      `${key}E5`,
      `${key}E6`,
    );
  }

  const headers = [...baseHeaders, ...gaitHeaders];

  const rows = leaderboard.map((entry) => {
    const baseValues = [
      entry.Nr || '',
      entry.Saeti || '',
      entry.Holl || '',
      entry.Hond || '',
      escapeCsvField(entry.Knapi || ''),
      escapeCsvField(entry.LiturRas || ''),
      escapeCsvField(entry.FelagKnapa || ''),
      escapeCsvField(entry.Hestur || ''),
      escapeCsvField(entry.Litur || ''),
      entry.Aldur || '',
      escapeCsvField(entry.FelagEiganda || ''),
      entry.Lid || '',
      escapeCsvField(entry.NafnBIG || ''),
      entry.E1 || '',
      entry.E2 || '',
      entry.E3 || '',
      entry.E4 || '',
      entry.E5 || '',
      entry.E6 || '',
      entry?.adal?.E1 || '',
      entry?.adal?.E2 || '',
      entry?.adal?.E3 || '',
      entry?.adal?.E4 || '',
      entry?.adal?.E5 || '',
      entry?.adal?.E6 || '',
    ];

    const gaitValues = [];
    for (const key of sortedGaitKeys) {
      gaitValues.push(
        entry?.[key]?.E1 || '',
        entry?.[key]?.E2 || '',
        entry?.[key]?.E3 || '',
        entry?.[key]?.E4 || '',
        entry?.[key]?.E5 || '',
        entry?.[key]?.E6 || '',
      );
    }

    return [...baseValues, ...gaitValues].join(',');
  });

  return headers.join(',') + '\n' + rows.join('\n') + '\n';
}

function escapeCsvField(field) {
  const str = String(field);

  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}
