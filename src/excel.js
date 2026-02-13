import ExcelJS from 'exceljs';
import fs from 'fs/promises';
import path from 'path';
import { EXCEL_PATH, EXCEL_OUTPUT_PATH, DEBUG_LOGS } from './config.js';

let excelWriteQueue = Promise.resolve();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function enqueueExcelWrite(task) {
  excelWriteQueue = excelWriteQueue.then(task).catch((error) => {
    console.error('Excel write failed:', error);
  });
  return excelWriteQueue;
}

async function ensureWorkbook(options = {}) {
  const {
    inputPath = EXCEL_PATH,
    outputPath = EXCEL_OUTPUT_PATH,
    includeWebhooks = true,
  } = options;
  const workbook = new ExcelJS.Workbook();
  try {
    const preferredOutput =
      outputPath && outputPath !== inputPath ? outputPath : null;
    if (preferredOutput) {
      try {
        await fs.access(preferredOutput);
        await workbook.xlsx.readFile(preferredOutput);
        return workbook;
      } catch {}
    }
    await fs.access(inputPath);
    await workbook.xlsx.readFile(inputPath);
  } catch (error) {
    const notFound =
      error.code === 'ENOENT' ||
      (typeof error.message === 'string' &&
        error.message.includes('File not found'));
    if (!notFound) {
      throw error;
    }
    const inputDir = path.dirname(inputPath);
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(inputDir, { recursive: true });
    if (outputDir && outputDir !== inputDir) {
      await fs.mkdir(outputDir, { recursive: true });
    }
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
  const writeOnce = async () => {
    const tempPath = `${outputPath}.tmp`;
    const buffer = await workbook.xlsx.writeBuffer();
    await fs.writeFile(tempPath, buffer);
    try {
      await fs.rename(tempPath, outputPath);
    } catch (error) {
      if (error.code === 'EPERM' || error.code === 'EEXIST') {
        await fs.unlink(outputPath).catch(() => {});
        await fs.rename(tempPath, outputPath);
      } else {
        throw error;
      }
    }
  };
  const colorYellow = '\x1b[33m';
  const colorGreen = '\x1b[32m';
  const colorReset = '\x1b[0m';
  if (log) {
    console.log(
      `${colorYellow}Það er verið að skrifa í excel file'inn. Haldið í hestana!${colorReset}`,
    );
  }
  await writeOnce();
  await delay(1000);
  await writeOnce();
  if (log) {
    console.log(`${colorGreen}Búið að skrifa${colorReset}`);
  }
}

function getHeaderInfo(worksheet) {
  let bestRow = 1;
  let bestCount = 0;
  for (let i = 1; i <= Math.min(10, worksheet.rowCount || 10); i += 1) {
    const row = worksheet.getRow(i);
    let count = 0;
    row.eachCell((cell) => {
      if (cell.value) count += 1;
    });
    if (count > bestCount) {
      bestCount = count;
      bestRow = i;
    }
  }
  const headerRow = worksheet.getRow(bestRow);
  const map = new Map();
  headerRow.eachCell((cell, col) => {
    if (cell.value) {
      map.set(cell.value.toString().trim(), col);
    }
  });
  return { map, headerRow: bestRow };
}

function getHeaderInfoFromRow(worksheet, rowNumber) {
  const headerRow = worksheet.getRow(rowNumber);
  const map = new Map();
  headerRow.eachCell((cell, col) => {
    if (cell.value) {
      map.set(cell.value.toString().trim(), col);
    }
  });
  return { map, headerRow: rowNumber };
}

const PREFERRED_SHEET_ORDER = ['Forkeppni', 'B-úrslit', 'A-úrslit'];

function reorderWorkbookSheets(workbook) {
  if (!Array.isArray(workbook._worksheets)) return;
  const sheets = workbook.worksheets;
  const byName = new Map(sheets.map((ws) => [ws.name.toLowerCase(), ws]));
  const ordered = [];

  for (const name of PREFERRED_SHEET_ORDER) {
    const ws = byName.get(name.toLowerCase());
    if (ws) ordered.push(ws);
  }

  for (const ws of sheets) {
    if (!ordered.includes(ws) && ws.name !== 'Webhooks') {
      ordered.push(ws);
    }
  }

  const webhooks = workbook.getWorksheet('Webhooks');
  if (webhooks) ordered.push(webhooks);

  workbook._worksheets = [null, ...ordered];
  ordered.forEach((ws, i) => {
    ws.id = i + 1;
  });
}

function removeWorksheetIfExists(workbook, sheetName) {
  const sheet = workbook.getWorksheet(sheetName);
  if (sheet) {
    workbook.removeWorksheet(sheet.id);
  }
}

export async function removeSheet(sheetName) {
  await enqueueExcelWrite(async () => {
    const workbook = await ensureWorkbook();
    removeWorksheetIfExists(workbook, sheetName);
    reorderWorkbookSheets(workbook);
    await writeWorkbookAtomic(workbook, { log: false });
  });
}

function ensureHeaders(worksheet, headerInfo, headersToEnsure, width = 8) {
  const headerRow = worksheet.getRow(headerInfo.headerRow);
  let lastCol = headerRow.cellCount || headerRow.actualCellCount || 0;
  for (const header of headersToEnsure) {
    if (!headerInfo.map.has(header)) {
      lastCol += 1;
      headerRow.getCell(lastCol).value = header;
      worksheet.getColumn(lastCol).width = width;
      headerInfo.map.set(header, lastCol);
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
      worksheet.getColumn(1).width = 24;
      worksheet.getColumn(2).width = 28;
      worksheet.getColumn(3).width = 14;
      worksheet.getColumn(4).width = 14;
      worksheet.getColumn(5).width = 16;
      worksheet.getColumn(6).width = 12;
      worksheet.getColumn(7).width = 80;
    }
    const headerInfo = getHeaderInfo(worksheet);
    ensureHeaders(
      worksheet,
      headerInfo,
      [
        'timestamp',
        'event',
        'eventId',
        'classId',
        'competitionId',
        'published',
        'payload',
      ],
      16,
    );
    const row = worksheet.addRow([]);
    const set = (header, value) => {
      const col = headerInfo.map.get(header);
      if (col) row.getCell(col).value = value;
    };
    set('timestamp', new Date().toISOString());
    set('event', eventName);
    set('eventId', payload.eventId ?? '');
    set('classId', payload.classId ?? '');
    set('competitionId', payload.competitionId ?? '');
    set('published', payload.published ?? '');
    set('payload', JSON.stringify(payload));
    reorderWorkbookSheets(workbook);
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
    if (sheetName !== 'raslistar') {
      removeWorksheetIfExists(workbook, 'raslistar');
    }
    if (Array.isArray(removeSheets)) {
      for (const name of removeSheets) {
        if (name && name !== sheetName) {
          removeWorksheetIfExists(workbook, name);
        }
      }
    }
    let worksheet = workbook.getWorksheet(sheetName);
    const isForkeppni = sheetName.toLowerCase() === 'forkeppni';
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
    const headersForSheet = baseHeaders;
    if (!worksheet) {
      worksheet = workbook.addWorksheet(sheetName);
      worksheet.columns = headersForSheet.map((header) => {
        const widthMap = {
          'Nr.': 6,
          Holl: 6,
          Hönd: 6,
          Knapi: 24,
          LiturRas: 14,
          'Félag knapa': 18,
          Hestur: 28,
          Litur: 20,
          Aldur: 6,
          'Félag eiganda': 18,
          Eigandi: 22,
          Faðir: 28,
          Móðir: 28,
          Lið: 10,
          NafnBIG: 28,
        };
        return { header, key: header, width: widthMap[header] || 8 };
      });
    } else {
      // Preserve existing columns; just ensure header row has required labels.
      const headerRow = worksheet.getRow(1);
      headersForSheet.forEach((header, index) => {
        if (!headerRow.getCell(index + 1).value) {
          headerRow.getCell(index + 1).value = header;
        }
      });
    }
    const headerInfo = getHeaderInfoFromRow(worksheet, 1);
    const headers = headerInfo.map;
    const nrCol = headers.get('Nr.');

    const startRow = headerInfo.headerRow + 1;
    let rowIndex = startRow;
    for (const item of startingList) {
      const trackNumber = item.vallarnumer ?? '';
      const row = nrCol
        ? getRowByValue(worksheet, nrCol, trackNumber, startRow) ||
          worksheet.getRow(rowIndex)
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
        if (col) {
          row.getCell(col).value = value;
        }
      }
    }

    reorderWorkbookSheets(workbook);
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
    if (sheetName !== 'raslistar') {
      removeWorksheetIfExists(workbook, 'raslistar');
    }
    if (Array.isArray(removeSheets)) {
      for (const name of removeSheets) {
        if (name && name !== sheetName) {
          removeWorksheetIfExists(workbook, name);
        }
      }
    }
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) {
      return;
    }
    const headerInfo = getHeaderInfoFromRow(worksheet, 1);
    const headers = headerInfo.map;
    const isForkeppni = sheetName.toLowerCase() === 'forkeppni';
    const needsSaeti =
      sheetName.toLowerCase() === 'forkeppni' ||
      sheetName.toLowerCase() === 'a-úrslit' ||
      sheetName.toLowerCase() === 'b-úrslit';
    ensureHeaders(worksheet, getHeaderInfo(worksheet), [
      ...(needsSaeti ? ['Sæti'] : []),
      'E1',
      'E2',
      'E3',
      'E4',
      'E5',
      'E6',
    ]);
    const nrCol = headers.get('Nr.');
    const saetiCol = needsSaeti ? headers.get('Sæti') : null;
    const e1Col = headers.get('E1');
    const e2Col = headers.get('E2');
    const e3Col = headers.get('E3');
    const e4Col = headers.get('E4');
    const e5Col = headers.get('E5');
    const e6Col = headers.get('E6');
    const breakdownCols = isForkeppni ? null : new Map();
    if (!nrCol || !e1Col || !e2Col || !e3Col || !e4Col || !e5Col || !e6Col) {
      return;
    }

    for (const result of results) {
      const trackNumber = result.vallarnumer ?? '';
      const row = getRowByValue(worksheet, nrCol, trackNumber, 2);
      if (!row) continue;

      if (saetiCol) {
        row.getCell(saetiCol).value = result.saeti ?? result.fmt_saeti ?? '';
      }
      const judges = Array.isArray(result.einkunnir_domara)
        ? result.einkunnir_domara
        : [];
      if (DEBUG_LOGS) {
        console.log('[einkunnir_domara]', trackNumber, judges);
      }
      const scores = judges
        .slice(0, 5)
        .map((j) => parseJudgeScore(j?.domari_adaleinkunn));
      row.getCell(e1Col).value = roundScore(scores[0] ?? null);
      row.getCell(e2Col).value = roundScore(scores[1] ?? null);
      row.getCell(e3Col).value = roundScore(scores[2] ?? null);
      row.getCell(e4Col).value = roundScore(scores[3] ?? null);
      row.getCell(e5Col).value = roundScore(scores[4] ?? null);
      row.getCell(e6Col).value = roundScore(
        parseJudgeScore(result.keppandi_medaleinkunn),
      );

      const keppniName = (result.keppni_nafn ?? result.aframrodun ?? '')
        .toString()
        .toLowerCase()
        .replace(/-/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!isForkeppni && judges.length && breakdownCols) {
        for (let j = 0; j < Math.min(judges.length, 5); j += 1) {
          const details = Array.isArray(judges[j]?.sundurlidun_einkunna)
            ? judges[j].sundurlidun_einkunna
            : [];
          for (const detail of details) {
            const abbr = getGangtegundAbbr(detail?.gangtegund);
            if (!abbr) continue;
            if (!breakdownCols.has(abbr)) {
              const headersToAdd = [];
              for (let i = 1; i <= 5; i += 1) {
                headersToAdd.push(`E${i}_${abbr}`);
              }
              ensureHeaders(worksheet, headerInfo, headersToAdd);
              breakdownCols.set(
                abbr,
                headersToAdd.map((h) => headers.get(h)),
              );
            }
            const cols = breakdownCols.get(abbr);
            const col = cols?.[j];
            if (!col) continue;
            row.getCell(col).value = roundScore(
              parseJudgeScore(detail?.einkunn),
            );
          }
        }
      }
    }

    reorderWorkbookSheets(workbook);
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

    const headerMap = getHeaderInfo(worksheet).map;
    for (const rowData of rows) {
      const row = worksheet.addRow([]);
      for (const [header, value] of Object.entries(rowData)) {
        const col = headerMap.get(header);
        if (col) {
          row.getCell(col).value = value;
        }
      }
    }

    reorderWorkbookSheets(workbook);
    await writeWorkbookAtomic(workbook, { log: false });
  });
}
