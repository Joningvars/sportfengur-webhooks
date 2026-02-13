import ExcelJS from 'exceljs';
import fs from 'fs/promises';
import path from 'path';
import { EXCEL_OUTPUT_PATH, DEBUG_LOGS } from './config.js';

let excelWriteQueue = Promise.resolve();

function enqueueExcelWrite(task) {
  excelWriteQueue = excelWriteQueue.then(task).catch((error) => {
    console.error('Excel write failed:', error);
  });
  return excelWriteQueue;
}

function outputBasePath(outputPath = EXCEL_OUTPUT_PATH) {
  const resolved = path.resolve(outputPath);
  const ext = path.extname(resolved).toLowerCase();
  if (ext === '.csv') return resolved.slice(0, -4);
  return resolved;
}

function getCombinedCsvPath(outputPath = EXCEL_OUTPUT_PATH) {
  return `${outputBasePath(outputPath)}.csv`;
}

function csvEscape(value) {
  const stringValue = value == null ? '' : String(value);
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

async function writeCsvAtomic(filePath, lines) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, lines.join('\n'), 'utf8');
  await fs.rename(tmpPath, filePath);
}

function getHeaderInfo(worksheet) {
  let bestRow = 1;
  let bestCount = 0;
  for (let i = 1; i <= Math.min(10, worksheet.rowCount || 10); i += 1) {
    const row = worksheet.getRow(i);
    let count = 0;
    row.eachCell((cell) => {
      if (
        cell.value !== null &&
        cell.value !== undefined &&
        cell.value !== ''
      ) {
        count += 1;
      }
    });
    if (count > bestCount) {
      bestCount = count;
      bestRow = i;
    }
  }
  const headerRow = worksheet.getRow(bestRow);
  const cols = [];
  headerRow.eachCell((cell, col) => {
    if (cell.value) {
      cols.push({
        col,
        header: cell.value.toString().trim(),
      });
    }
  });
  return { headerRow: bestRow, cols };
}

async function exportWorkbookSheetsToCsv(
  workbook,
  outputPath = EXCEL_OUTPUT_PATH,
) {
  const combinedRows = [];
  const mergedHeaders = new Set(['Sheet']);

  for (const worksheet of workbook.worksheets) {
    const { headerRow, cols } = getHeaderInfo(worksheet);
    if (cols.length === 0) continue;
    cols.forEach(({ header }) => mergedHeaders.add(header));

    for (
      let rowNum = headerRow + 1;
      rowNum <= worksheet.rowCount;
      rowNum += 1
    ) {
      const row = worksheet.getRow(rowNum);
      const values = Object.fromEntries(
        cols.map(({ col, header }) => {
          const value = row.getCell(col).value;
          if (value == null) return [header, ''];
          if (typeof value === 'object' && value.text != null) {
            return [header, value.text];
          }
          return [header, value];
        }),
      );
      const hasAny = Object.values(values).some((v) => v !== '' && v != null);
      if (!hasAny) continue;
      combinedRows.push({
        Sheet: worksheet.name,
        ...values,
      });
    }
  }

  const headers = Array.from(mergedHeaders);
  const lines = [];
  lines.push(headers.map(csvEscape).join(','));
  for (const row of combinedRows) {
    lines.push(headers.map((header) => csvEscape(row[header] ?? '')).join(','));
  }
  await writeCsvAtomic(getCombinedCsvPath(outputPath), lines);

  // Clean up legacy per-sheet snapshots.
  const base = outputBasePath(outputPath);
  const dir = path.dirname(base);
  const prefix = `${path.basename(base)}__`;
  const files = await fs.readdir(dir).catch(() => []);
  await Promise.all(
    files
      .filter((name) => name.startsWith(prefix) && name.endsWith('.csv'))
      .map((name) => fs.unlink(path.join(dir, name)).catch(() => {})),
  );
}

async function ensureWorkbook(options = {}) {
  const { outputPath = EXCEL_OUTPUT_PATH, includeWebhooks = true } = options;
  const workbook = new ExcelJS.Workbook();
  try {
    await fs.access(outputPath);
    await workbook.xlsx.readFile(outputPath);
  } catch (error) {
    const notFound =
      error.code === 'ENOENT' ||
      (typeof error.message === 'string' &&
        error.message.includes('File not found'));
    if (!notFound) throw error;
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    if (includeWebhooks) {
      const webhooks = workbook.addWorksheet('Webhooks');
      webhooks.columns = [
        { header: 'timestamp', key: 'timestamp', width: 24 },
        { header: 'event', key: 'event', width: 28 },
        { header: 'eventId', key: 'eventId', width: 14 },
        { header: 'classId', key: 'classId', width: 14 },
        { header: 'competitionId', key: 'competitionId', width: 16 },
        { header: 'published', key: 'published', width: 12 },
        { header: 'payload', key: 'payload', width: 80 },
      ];
    }
    await writeWorkbookAtomic(workbook, { log: false, outputPath });
  }
  return workbook;
}

async function writeWorkbookAtomic(workbook, options = {}) {
  const { log = false, outputPath = EXCEL_OUTPUT_PATH } = options;
  const tmpPath = `${outputPath}.tmp`;
  const yellow = '\x1b[33m';
  const green = '\x1b[32m';
  const reset = '\x1b[0m';
  if (log) {
    console.log(`${yellow}Skrifa í xlsx og csv snapshot...${reset}`);
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const buffer = await workbook.xlsx.writeBuffer();
  await fs.writeFile(tmpPath, buffer);
  await fs.rename(tmpPath, outputPath);
  await exportWorkbookSheetsToCsv(workbook, outputPath);

  if (log) {
    console.log(`${green}Skrifun lokið${reset}`);
  }
}

function getHeaderMapFromRow(worksheet, rowNumber = 1) {
  const map = new Map();
  const row = worksheet.getRow(rowNumber);
  row.eachCell((cell, col) => {
    if (cell.value) map.set(cell.value.toString().trim(), col);
  });
  return map;
}

function ensureHeaders(worksheet, headerMap, headersToEnsure, width = 8) {
  const headerRow = worksheet.getRow(1);
  let lastCol = headerRow.cellCount || headerRow.actualCellCount || 0;
  for (const header of headersToEnsure) {
    if (!headerMap.has(header)) {
      lastCol += 1;
      headerRow.getCell(lastCol).value = header;
      worksheet.getColumn(lastCol).width = width;
      headerMap.set(header, lastCol);
    }
  }
}

function getRowByValue(worksheet, col, value, startRow = 2) {
  if (!value && value !== 0) return null;
  const last = worksheet.rowCount;
  for (let i = startRow; i <= last; i += 1) {
    const cellValue = worksheet.getRow(i).getCell(col).value;
    if (
      cellValue === value ||
      (cellValue != null && cellValue.toString() === value.toString())
    ) {
      return worksheet.getRow(i);
    }
  }
  return null;
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
  await enqueueExcelWrite(async () => {
    const workbook = await ensureWorkbook();
    let worksheet = workbook.getWorksheet('Webhooks');
    if (!worksheet) {
      worksheet = workbook.addWorksheet('Webhooks');
      worksheet.addRow([
        'timestamp',
        'event',
        'eventId',
        'classId',
        'competitionId',
        'published',
        'payload',
      ]);
    }
    const headerMap = getHeaderMapFromRow(worksheet, 1);
    ensureHeaders(worksheet, headerMap, [
      'timestamp',
      'event',
      'eventId',
      'classId',
      'competitionId',
      'published',
      'payload',
    ]);
    const row = worksheet.addRow([]);
    const set = (header, value) => {
      const col = headerMap.get(header);
      if (col) row.getCell(col).value = value;
    };
    set('timestamp', new Date().toISOString());
    set('event', eventName);
    set('eventId', payload.eventId ?? '');
    set('classId', payload.classId ?? '');
    set('competitionId', payload.competitionId ?? '');
    set('published', payload.published ?? '');
    set('payload', JSON.stringify(payload));
    await writeWorkbookAtomic(workbook, { log: false });
  });
}

export async function updateStartingListSheet(
  startingList,
  sheetName = 'raslistar',
  removeSheets = [],
  outputPath = null,
) {
  await enqueueExcelWrite(async () => {
    const workbook = await ensureWorkbook(
      outputPath ? { outputPath, includeWebhooks: false } : undefined,
    );
    for (const name of removeSheets || []) {
      if (!name || name === sheetName) continue;
      const ws = workbook.getWorksheet(name);
      if (ws) workbook.removeWorksheet(ws.id);
    }

    let worksheet = workbook.getWorksheet(sheetName);
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

    if (!worksheet) {
      worksheet = workbook.addWorksheet(sheetName);
      worksheet.addRow(baseHeaders);
    }

    const headers = getHeaderMapFromRow(worksheet, 1);
    ensureHeaders(worksheet, headers, baseHeaders);
    const nrCol = headers.get('Nr.');
    let rowIndex = 2;

    for (const item of startingList) {
      const trackNumber = item.vallarnumer ?? '';
      const row =
        nrCol && getRowByValue(worksheet, nrCol, trackNumber, 2)
          ? getRowByValue(worksheet, nrCol, trackNumber, 2)
          : worksheet.getRow(rowIndex);
      rowIndex += 1;

      const horseFullName = item.hross_fullt_nafn || item.hross_fulltnafn || '';
      const faedingarnumer = item.faedingarnumer ?? '';
      const aldur = calculateAldur(faedingarnumer);
      const riderName =
        item.knapi_fullt_nafn ?? item.knapi_fulltnafn ?? item.knapi_nafn ?? '';
      const riderNameUpper = riderName ? riderName.toUpperCase() : '';

      const cells = {
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

      for (const [header, value] of Object.entries(cells)) {
        const col = headers.get(header);
        if (col) row.getCell(col).value = value;
      }
    }

    await writeWorkbookAtomic(workbook, {
      log: false,
      outputPath: outputPath ?? EXCEL_OUTPUT_PATH,
    });
  });
}

export async function updateResultsScores(
  results,
  sheetName = 'raslistar',
  removeSheets = [],
  outputPath = null,
) {
  await enqueueExcelWrite(async () => {
    const workbook = await ensureWorkbook(
      outputPath ? { outputPath, includeWebhooks: false } : undefined,
    );
    for (const name of removeSheets || []) {
      if (!name || name === sheetName) continue;
      const ws = workbook.getWorksheet(name);
      if (ws) workbook.removeWorksheet(ws.id);
    }

    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) return;

    const headers = getHeaderMapFromRow(worksheet, 1);
    const needsSaeti =
      sheetName.toLowerCase() === 'forkeppni' ||
      sheetName.toLowerCase() === 'a-úrslit' ||
      sheetName.toLowerCase() === 'b-úrslit';
    ensureHeaders(worksheet, headers, [
      ...(needsSaeti ? ['Sæti'] : []),
      'E1',
      'E2',
      'E3',
      'E4',
      'E5',
      'E6',
    ]);

    const nrCol = headers.get('Nr.');
    if (!nrCol) return;
    const isForkeppni = sheetName.toLowerCase() === 'forkeppni';

    for (const result of results) {
      const row = getRowByValue(worksheet, nrCol, result.vallarnumer ?? '', 2);
      if (!row) continue;
      if (needsSaeti && headers.get('Sæti')) {
        row.getCell(headers.get('Sæti')).value =
          result.saeti ?? result.fmt_saeti ?? '';
      }
      const judges = Array.isArray(result.einkunnir_domara)
        ? result.einkunnir_domara
        : [];
      const scores = judges
        .slice(0, 5)
        .map((j) => parseJudgeScore(j?.domari_adaleinkunn));
      row.getCell(headers.get('E1')).value = roundScore(scores[0] ?? null);
      row.getCell(headers.get('E2')).value = roundScore(scores[1] ?? null);
      row.getCell(headers.get('E3')).value = roundScore(scores[2] ?? null);
      row.getCell(headers.get('E4')).value = roundScore(scores[3] ?? null);
      row.getCell(headers.get('E5')).value = roundScore(scores[4] ?? null);
      row.getCell(headers.get('E6')).value = roundScore(
        parseJudgeScore(result.keppandi_medaleinkunn),
      );

      if (!isForkeppni && judges.length) {
        for (let j = 0; j < Math.min(judges.length, 5); j += 1) {
          const details = Array.isArray(judges[j]?.sundurlidun_einkunna)
            ? judges[j].sundurlidun_einkunna
            : [];
          for (const detail of details) {
            const abbr = getGangtegundAbbr(detail?.gangtegund);
            if (!abbr) continue;
            const header = `E${j + 1}_${abbr}`;
            ensureHeaders(worksheet, headers, [header]);
            row.getCell(headers.get(header)).value = roundScore(
              parseJudgeScore(detail?.einkunn),
            );
          }
        }
      }
    }

    await writeWorkbookAtomic(workbook, {
      log: false,
      outputPath: outputPath ?? EXCEL_OUTPUT_PATH,
    });
  });
}

export async function writeDataSheet(sheetName, headers, rows) {
  await enqueueExcelWrite(async () => {
    const workbook = await ensureWorkbook();
    let worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) {
      worksheet = workbook.addWorksheet(sheetName);
      worksheet.addRow(headers);
    }
    const headerMap = getHeaderMapFromRow(worksheet, 1);
    ensureHeaders(worksheet, headerMap, headers);

    for (const rowData of rows) {
      const row = worksheet.addRow([]);
      for (const [header, value] of Object.entries(rowData)) {
        const col = headerMap.get(header);
        if (col) row.getCell(col).value = value;
      }
    }

    await writeWorkbookAtomic(workbook, { log: false });
  });
}

export async function removeSheet(sheetName) {
  await enqueueExcelWrite(async () => {
    const workbook = await ensureWorkbook();
    const ws = workbook.getWorksheet(sheetName);
    if (ws) {
      workbook.removeWorksheet(ws.id);
      await writeWorkbookAtomic(workbook, { log: false });
    }
  });
}

if (DEBUG_LOGS) {
  console.log('[excel] XLSX master + CSV snapshot mode enabled');
}
