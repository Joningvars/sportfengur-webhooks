import fs from 'fs/promises';
import path from 'path';
import { EXCEL_OUTPUT_PATH, DEBUG_LOGS } from './config.js';

let writeQueue = Promise.resolve();

function enqueueWrite(task) {
  writeQueue = writeQueue.then(task).catch((error) => {
    console.error('CSV write failed:', error);
  });
  return writeQueue;
}

function sanitizeSheetName(name) {
  return name
    .toString()
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

function outputBasePath(outputPath = EXCEL_OUTPUT_PATH) {
  const resolved = path.resolve(outputPath);
  const ext = path.extname(resolved).toLowerCase();
  if (ext === '.csv') {
    return resolved.slice(0, -4);
  }
  return resolved;
}

function getSheetPath(sheetName, outputPath = EXCEL_OUTPUT_PATH) {
  return `${outputBasePath(outputPath)}__${sanitizeSheetName(sheetName)}.csv`;
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function csvEscape(value) {
  const stringValue = value == null ? '' : String(value);
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === ',') {
      values.push(current);
      current = '';
    } else if (ch === '"') {
      inQuotes = true;
    } else {
      current += ch;
    }
  }

  values.push(current);
  return values;
}

async function readCsvTable(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
    if (lines.length === 0) {
      return { headers: [], rows: [] };
    }

    const headers = parseCsvLine(lines[0]);
    const rows = lines.slice(1).map((line) => {
      const values = parseCsvLine(line);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ?? '';
      });
      return row;
    });

    return { headers, rows };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { headers: [], rows: [] };
    }
    throw error;
  }
}

async function writeCsvTable(filePath, headers, rows) {
  await ensureParentDir(filePath);
  const tmpPath = `${filePath}.tmp`;
  const headerLine = headers.map(csvEscape).join(',');
  const rowLines = rows.map((row) =>
    headers.map((header) => csvEscape(row[header] ?? '')).join(','),
  );
  const content = [headerLine, ...rowLines].join('\n');
  await fs.writeFile(tmpPath, content, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function mergeHeaders(existingHeaders, incomingHeaders, rows = []) {
  const merged = [...existingHeaders];
  const addHeader = (header) => {
    if (header && !merged.includes(header)) {
      merged.push(header);
    }
  };
  incomingHeaders.forEach(addHeader);
  rows.forEach((row) => Object.keys(row).forEach(addHeader));
  return merged;
}

async function removeCsvSheetIfExists(
  sheetName,
  outputPath = EXCEL_OUTPUT_PATH,
) {
  const filePath = getSheetPath(sheetName, outputPath);
  await fs.unlink(filePath).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

function getYearFromFaedingarnumer(value) {
  if (!value || typeof value !== 'string') return null;
  const match = value.match(/(\d{4})/);
  if (!match) return null;
  const year = Number(match[1]);
  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    year > new Date().getFullYear()
  ) {
    return null;
  }
  return year;
}

function calculateAldur(faedingarnumer) {
  const year = getYearFromFaedingarnumer(faedingarnumer);
  if (!year) return '';
  return new Date().getFullYear() - year;
}

function parseJudgeScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized =
    typeof value === 'string' ? value.replace(',', '.').trim() : value;
  const num = typeof normalized === 'number' ? normalized : Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function roundScore(value) {
  if (value === null) return '';
  return Math.round(value * 100) / 100;
}

function getGangtegundAbbr(value) {
  if (!value) return '';
  const raw = value.toString().trim().toLowerCase();
  if (raw.includes('tölt frjáls hraði')) return 'TFH';
  if (raw.includes('hægt tölt')) return 'HT';
  if (raw.includes('tölt með slakan taum')) return 'TST';
  if (raw.includes('brokk')) return 'BR';
  if (raw.includes('fet')) return 'FE';
  if (raw.includes('stökk')) return 'ST';
  if (raw.includes('greitt')) return 'GR';
  return '';
}

export async function appendWebhookRow(eventName, payload) {
  await enqueueWrite(async () => {
    const filePath = getSheetPath('Webhooks');
    const baseHeaders = [
      'timestamp',
      'event',
      'eventId',
      'classId',
      'competitionId',
      'published',
      'payload',
    ];
    const row = {
      timestamp: new Date().toISOString(),
      event: eventName,
      eventId: payload.eventId ?? '',
      classId: payload.classId ?? '',
      competitionId: payload.competitionId ?? '',
      published: payload.published ?? '',
      payload: JSON.stringify(payload),
    };

    const table = await readCsvTable(filePath);
    const headers = mergeHeaders(table.headers, baseHeaders, [row]);
    table.rows.push(row);
    await writeCsvTable(filePath, headers, table.rows);
  });
}

export async function updateStartingListSheet(
  startingList,
  sheetName = 'raslistar',
  removeSheets = [],
  outputPath = null,
) {
  await enqueueWrite(async () => {
    const targetPath = outputPath ?? EXCEL_OUTPUT_PATH;
    if (Array.isArray(removeSheets)) {
      for (const name of removeSheets) {
        if (name && name !== sheetName) {
          await removeCsvSheetIfExists(name, targetPath);
        }
      }
    }

    const filePath = getSheetPath(sheetName, targetPath);
    const needsSaeti =
      sheetName.toLowerCase() === 'forkeppni' ||
      sheetName.toLowerCase() === 'a-úrslit' ||
      sheetName.toLowerCase() === 'b-úrslit';
    const baseHeaders = [
      'Nr.',
      ...(needsSaeti ? ['Sæti'] : []),
      'Holl',
      'Hönd',
      'Knapi',
      'LiturRas',
      'Félag knapa',
      'Hestur',
      'Litur',
      'Aldur',
      'Félag eiganda',
      'Lið',
      'NafnBIG',
      'E1',
      'E2',
      'E3',
      'E4',
      'E5',
      'E6',
    ];

    const table = await readCsvTable(filePath);
    const headers = mergeHeaders(table.headers, baseHeaders);
    const indexByNr = new Map();
    table.rows.forEach((row, index) => {
      indexByNr.set(String(row['Nr.'] ?? ''), index);
    });

    for (const item of startingList) {
      const trackNumber = item.vallarnumer ?? '';
      const horseFullName = item.hross_fullt_nafn || item.hross_fulltnafn || '';
      const faedingarnumer = item.faedingarnumer ?? '';
      const aldur = calculateAldur(faedingarnumer);
      const riderName =
        item.knapi_fullt_nafn ?? item.knapi_fulltnafn ?? item.knapi_nafn ?? '';
      const riderNameUpper = riderName ? riderName.toUpperCase() : '';

      const rowData = {
        'Nr.': trackNumber,
        ...(needsSaeti ? { Sæti: '' } : {}),
        Holl: item.holl ?? '',
        Hönd: item.hond ?? '',
        Knapi: riderName,
        LiturRas:
          item.rodun_litur_numer != null && item.rodun_litur
            ? `${item.rodun_litur_numer} - ${item.rodun_litur}`
            : (item.rodun_litur ?? ''),
        'Félag knapa': item.adildarfelag_knapa ?? '',
        Hestur: horseFullName,
        Litur: item.hross_litur ?? '',
        Aldur: aldur,
        'Félag eiganda': item.adildarfelag_eiganda ?? '',
        Lið: '',
        NafnBIG: riderNameUpper,
      };

      const key = String(trackNumber);
      if (indexByNr.has(key)) {
        Object.assign(table.rows[indexByNr.get(key)], rowData);
      } else {
        table.rows.push(rowData);
        indexByNr.set(key, table.rows.length - 1);
      }
    }

    await writeCsvTable(filePath, headers, table.rows);
    if (DEBUG_LOGS) {
      console.log(`[csv] Updated ${sheetName} -> ${filePath}`);
    }
  });
}

export async function updateResultsScores(
  results,
  sheetName = 'raslistar',
  removeSheets = [],
  outputPath = null,
) {
  await enqueueWrite(async () => {
    const targetPath = outputPath ?? EXCEL_OUTPUT_PATH;
    if (Array.isArray(removeSheets)) {
      for (const name of removeSheets) {
        if (name && name !== sheetName) {
          await removeCsvSheetIfExists(name, targetPath);
        }
      }
    }

    const filePath = getSheetPath(sheetName, targetPath);
    const table = await readCsvTable(filePath);
    if (table.rows.length === 0 && table.headers.length === 0) {
      return;
    }

    const isForkeppni = sheetName.toLowerCase() === 'forkeppni';
    const needsSaeti =
      sheetName.toLowerCase() === 'forkeppni' ||
      sheetName.toLowerCase() === 'a-úrslit' ||
      sheetName.toLowerCase() === 'b-úrslit';
    let headers = mergeHeaders(table.headers, [
      ...(needsSaeti ? ['Sæti'] : []),
      'E1',
      'E2',
      'E3',
      'E4',
      'E5',
      'E6',
    ]);
    const indexByNr = new Map();
    table.rows.forEach((row, index) => {
      indexByNr.set(String(row['Nr.'] ?? ''), index);
    });

    for (const result of results) {
      const key = String(result.vallarnumer ?? '');
      const rowIndex = indexByNr.get(key);
      if (rowIndex == null) continue;
      const row = table.rows[rowIndex];

      if (needsSaeti) {
        row['Sæti'] = result.saeti ?? result.fmt_saeti ?? '';
      }
      const judges = Array.isArray(result.einkunnir_domara)
        ? result.einkunnir_domara
        : [];
      const scores = judges
        .slice(0, 5)
        .map((j) => parseJudgeScore(j?.domari_adaleinkunn));
      row.E1 = roundScore(scores[0] ?? null);
      row.E2 = roundScore(scores[1] ?? null);
      row.E3 = roundScore(scores[2] ?? null);
      row.E4 = roundScore(scores[3] ?? null);
      row.E5 = roundScore(scores[4] ?? null);
      row.E6 = roundScore(parseJudgeScore(result.keppandi_medaleinkunn));

      if (!isForkeppni && judges.length) {
        for (let j = 0; j < Math.min(judges.length, 5); j += 1) {
          const details = Array.isArray(judges[j]?.sundurlidun_einkunna)
            ? judges[j].sundurlidun_einkunna
            : [];
          for (const detail of details) {
            const abbr = getGangtegundAbbr(detail?.gangtegund);
            if (!abbr) continue;
            const header = `E${j + 1}_${abbr}`;
            headers = mergeHeaders(headers, [header]);
            row[header] = roundScore(parseJudgeScore(detail?.einkunn));
          }
        }
      }
    }

    await writeCsvTable(filePath, headers, table.rows);
  });
}

export async function writeDataSheet(sheetName, headers, rows) {
  await enqueueWrite(async () => {
    const filePath = getSheetPath(sheetName);
    const table = await readCsvTable(filePath);
    const mergedHeaders = mergeHeaders(table.headers, headers, rows);
    table.rows.push(...rows);
    await writeCsvTable(filePath, mergedHeaders, table.rows);
  });
}

export async function removeSheet(sheetName) {
  await enqueueWrite(async () => {
    await removeCsvSheetIfExists(sheetName);
  });
}
