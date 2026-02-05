import ExcelJS from 'exceljs';
import fs from 'fs/promises';
import path from 'path';
import { EXCEL_PATH, EXCEL_OUTPUT_PATH } from './config.js';
import { apiGetWithRetry } from './sportfengur.js';

let excelWriteQueue = Promise.resolve();
const horseInfoCache = new Map();

function enqueueExcelWrite(task) {
  excelWriteQueue = excelWriteQueue.then(task).catch((error) => {
    console.error('Excel write failed:', error);
  });
  return excelWriteQueue;
}

async function ensureWorkbook() {
  const workbook = new ExcelJS.Workbook();
  try {
    const primaryPath =
      EXCEL_OUTPUT_PATH && EXCEL_OUTPUT_PATH !== EXCEL_PATH
        ? EXCEL_OUTPUT_PATH
        : EXCEL_PATH;
    await workbook.xlsx.readFile(primaryPath);
  } catch (error) {
    const notFound =
      error.code === 'ENOENT' ||
      (typeof error.message === 'string' &&
        error.message.includes('File not found'));
    if (!notFound) {
      throw error;
    }
    const inputDir = path.dirname(EXCEL_PATH);
    const outputDir = path.dirname(EXCEL_OUTPUT_PATH);
    await fs.mkdir(inputDir, { recursive: true });
    if (outputDir && outputDir !== inputDir) {
      await fs.mkdir(outputDir, { recursive: true });
    }
    const raslistar = workbook.addWorksheet('raslistar');
    raslistar.addRow([
      'Nr.',
      'Holl',
      'Hönd',
      'Knapi',
      'LiturRas',
      'Félag knapa',
      'Hestur',
      'Litur',
      'Aldur',
      'Félag eiganda',
      'Eigandi',
      'Faðir',
      'Móðir',
      'Lið',
      'NafnBIG',
      'E1',
      'E2',
      'E3',
      'E4',
      'E5',
      'E6',
    ]);
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
    await writeWorkbookAtomic(workbook);
  }

  return workbook;
}

async function writeWorkbookAtomic(workbook) {
  const tempPath = `${EXCEL_OUTPUT_PATH}.tmp`;
  console.log(`[excel] writing ${EXCEL_OUTPUT_PATH}`);
  const buffer = await workbook.xlsx.writeBuffer();
  await fs.writeFile(tempPath, buffer);
  try {
    await fs.rename(tempPath, EXCEL_OUTPUT_PATH);
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EEXIST') {
      await fs.unlink(EXCEL_OUTPUT_PATH).catch(() => {});
      await fs.rename(tempPath, EXCEL_OUTPUT_PATH);
    } else {
      throw error;
    }
  }
  console.log(`[excel] wrote ${EXCEL_OUTPUT_PATH}`);
}

function getHeaderMap(worksheet) {
  const headerRow = worksheet.getRow(1);
  const map = new Map();
  headerRow.eachCell((cell, col) => {
    if (cell.value) {
      map.set(cell.value.toString().trim(), col);
    }
  });
  return map;
}

function getRowByValue(worksheet, col, value) {
  if (!value && value !== 0) return null;
  const last = worksheet.rowCount;
  for (let i = 2; i <= last; i += 1) {
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
  if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear()) {
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

async function getHorseInfo(horseId) {
  if (!horseId && horseId !== 0) return null;
  if (horseInfoCache.has(horseId)) {
    return horseInfoCache.get(horseId);
  }
  const data = await apiGetWithRetry(`/horseinfo/${horseId}`);
  const info = Array.isArray(data?.res) ? data.res[0] : null;
  horseInfoCache.set(horseId, info);
  return info;
}


export async function appendWebhookRow(eventName, payload) {
  await enqueueExcelWrite(async () => {
    const workbook = await ensureWorkbook();
    let worksheet = workbook.getWorksheet('Webhooks');
    if (!worksheet) {
      worksheet = workbook.addWorksheet('Webhooks');
      worksheet.columns = [
        { header: 'timestamp', key: 'timestamp', width: 24 },
        { header: 'event', key: 'event', width: 28 },
        { header: 'eventId', key: 'eventId', width: 14 },
        { header: 'classId', key: 'classId', width: 14 },
        { header: 'competitionId', key: 'competitionId', width: 16 },
        { header: 'published', key: 'published', width: 12 },
        { header: 'payload', key: 'payload', width: 80 },
      ];
    }
    worksheet.addRow({
      timestamp: new Date().toISOString(),
      event: eventName,
      eventId: payload.eventId ?? '',
      classId: payload.classId ?? '',
      competitionId: payload.competitionId ?? '',
      published: payload.published ?? '',
      payload: JSON.stringify(payload),
    });
    await writeWorkbookAtomic(workbook);
  });
}

export async function updateStartingListSheet(startingList) {
  await enqueueExcelWrite(async () => {
    const workbook = await ensureWorkbook();
    let worksheet = workbook.getWorksheet('raslistar');
    if (!worksheet) {
      worksheet = workbook.addWorksheet('raslistar');
      worksheet.columns = [
        { header: 'Nr.', key: 'Nr.', width: 6 },
        { header: 'Holl', key: 'Holl', width: 6 },
        { header: 'Hönd', key: 'Hönd', width: 6 },
        { header: 'Knapi', key: 'Knapi', width: 24 },
        { header: 'LiturRas', key: 'LiturRas', width: 14 },
        { header: 'Félag knapa', key: 'Félag knapa', width: 18 },
        { header: 'Hestur', key: 'Hestur', width: 28 },
        { header: 'Litur', key: 'Litur', width: 20 },
        { header: 'Aldur', key: 'Aldur', width: 6 },
        { header: 'Félag eiganda', key: 'Félag eiganda', width: 18 },
        { header: 'Eigandi', key: 'Eigandi', width: 22 },
        { header: 'Faðir', key: 'Faðir', width: 28 },
        { header: 'Móðir', key: 'Móðir', width: 28 },
        { header: 'Lið', key: 'Lið', width: 10 },
        { header: 'NafnBIG', key: 'NafnBIG', width: 28 },
        { header: 'E1', key: 'E1', width: 8 },
        { header: 'E2', key: 'E2', width: 8 },
        { header: 'E3', key: 'E3', width: 8 },
        { header: 'E4', key: 'E4', width: 8 },
        { header: 'E5', key: 'E5', width: 8 },
        { header: 'E6', key: 'E6', width: 8 },
      ];
      worksheet.addRow([
        'Nr.',
        'Holl',
        'Hönd',
        'Knapi',
        'LiturRas',
        'Félag knapa',
        'Hestur',
        'Litur',
        'Aldur',
        'Félag eiganda',
        'Eigandi',
        'Faðir',
        'Móðir',
        'Lið',
        'NafnBIG',
        'E1',
        'E2',
        'E3',
        'E4',
        'E5',
        'E6',
      ]);
    }

    const headers = getHeaderMap(worksheet);
    const nrCol = headers.get('Nr.');

    for (const item of startingList) {
      const trackNumber = item.vallarnumer ?? '';
      let row = nrCol ? getRowByValue(worksheet, nrCol, trackNumber) : null;
      if (!row) {
        row = worksheet.addRow([]);
      }

      const horseFullName = item.hross_fullt_nafn || item.hross_fulltnafn || '';
      const faedingarnumer = item.faedingarnumer ?? '';
      const aldur = calculateAldur(faedingarnumer);
      const riderName =
        item.knapi_fullt_nafn ?? item.knapi_fulltnafn ?? item.knapi_nafn ?? '';
      const riderNameUpper = riderName ? riderName.toUpperCase() : '';

      const cells = {
        'Nr.': trackNumber,
        Holl: item.holl ?? '',
        Hönd: item.hond ?? '',
        Knapi: riderName,
        LiturRas:
          item.rodun_litur_numer != null && item.rodun_litur
            ? `${item.rodun_litur_numer} - ${item.rodun_litur}`
            : item.rodun_litur ?? '',
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

      const ownerCol = headers.get('Eigandi');
      const fatherCol = headers.get('Faðir');
      const motherCol = headers.get('Móðir');
      const needsHorseInfo =
        (ownerCol && !row.getCell(ownerCol).value) ||
        (fatherCol && !row.getCell(fatherCol).value) ||
        (motherCol && !row.getCell(motherCol).value);

      if (needsHorseInfo && item.hross_numer != null) {
        const horseInfo = await getHorseInfo(item.hross_numer);
        if (horseInfo) {
          if (ownerCol && !row.getCell(ownerCol).value)
            row.getCell(ownerCol).value = horseInfo.eigandi ?? '';
          if (fatherCol && !row.getCell(fatherCol).value)
            row.getCell(fatherCol).value = horseInfo.fadir_nafn ?? '';
          if (motherCol && !row.getCell(motherCol).value)
            row.getCell(motherCol).value = horseInfo.modir_nafn ?? '';
        }
      }

    await writeWorkbookAtomic(workbook);
  });
}

export async function updateResultsScores(results) {
  await enqueueExcelWrite(async () => {
    const workbook = await ensureWorkbook();
    const worksheet = workbook.getWorksheet('raslistar');
    if (!worksheet) {
      return;
    }
    const headers = getHeaderMap(worksheet);
    const nrCol = headers.get('Nr.');
    const e1Col = headers.get('E1');
    const e2Col = headers.get('E2');
    const e3Col = headers.get('E3');
    const e4Col = headers.get('E4');
    const e5Col = headers.get('E5');
    const e6Col = headers.get('E6');
    if (!nrCol || !e1Col || !e2Col || !e3Col || !e4Col || !e5Col || !e6Col) {
      return;
    }

    for (const result of results) {
      const trackNumber = result.vallarnumer ?? '';
      const row = getRowByValue(worksheet, nrCol, trackNumber);
      if (!row) continue;

      const judges = Array.isArray(result.einkunnir_domara)
        ? result.einkunnir_domara
        : [];
      console.log('[einkunnir_domara]', trackNumber, judges);
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
    }

    await writeWorkbookAtomic(workbook);
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

    const headerMap = getHeaderMap(worksheet);
    for (const rowData of rows) {
      const row = worksheet.addRow([]);
      for (const [header, value] of Object.entries(rowData)) {
        const col = headerMap.get(header);
        if (col) {
          row.getCell(col).value = value;
        }
      }
    }

    await writeWorkbookAtomic(workbook);
  });
}
