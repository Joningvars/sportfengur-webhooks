import ExcelJS from 'exceljs';
import fs from 'fs/promises';
import path from 'path';
import { EXCEL_PATH } from './config.js';
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
    await workbook.xlsx.readFile(EXCEL_PATH);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    const dir = path.dirname(EXCEL_PATH);
    await fs.mkdir(dir, { recursive: true });
  }

  return workbook;
}

async function writeWorkbookAtomic(workbook) {
  const tempPath = `${EXCEL_PATH}.tmp`;
  const buffer = await workbook.xlsx.writeBuffer();
  await fs.writeFile(tempPath, buffer);
  try {
    await fs.rename(tempPath, EXCEL_PATH);
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EEXIST') {
      await fs.unlink(EXCEL_PATH).catch(() => {});
      await fs.rename(tempPath, EXCEL_PATH);
    } else {
      throw error;
    }
  }
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

      const cells = {
        'Nr.': trackNumber,
        Holl: item.holl ?? '',
        Hönd: item.hond ?? '',
        Knapi: item.knapi_fulltnafn ?? '',
        LiturRas: item.rodun_litur ?? '',
        'Félag knapa': item.adildarfelag_knapa ?? '',
        Hestur: item.hross_nafn ?? '',
        Litur: item.hross_litur ?? '',
        Aldur: '',
        'Félag eiganda': item.adildarfelag_eiganda ?? '',
        Lið: '',
        NafnBIG: horseFullName,
        E1: '',
        E2: '',
        E3: '',
        E4: '',
        E5: '',
        E6: '',
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
          if (ownerCol) row.getCell(ownerCol).value = horseInfo.eigandi ?? '';
          if (fatherCol) row.getCell(fatherCol).value = horseInfo.fadir_nafn ?? '';
          if (motherCol) row.getCell(motherCol).value = horseInfo.modir_nafn ?? '';
        }
      }
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
