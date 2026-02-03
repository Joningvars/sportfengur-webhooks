import express from 'express';
import dotenv from 'dotenv';
import ExcelJS from 'exceljs';
import fs from 'fs/promises';
import path from 'path';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const WEBHOOK_SECRET = process.env.SPORTFENGUR_WEBHOOK_SECRET || '';
const WEBHOOK_SECRET_REQUIRED = process.env.WEBHOOK_SECRET_REQUIRED === 'true';
const EXCEL_PATH = process.env.EXCEL_PATH || './raslistar.xlsx';
const SPORTFENGUR_BASE_URL =
  process.env.SPORTFENGUR_BASE_URL || 'https://sportfengur.com/api/v1';
const SPORTFENGUR_LOCALE = process.env.SPORTFENGUR_LOCALE || 'is';
const SPORTFENGUR_USERNAME = process.env.EIDFAXI_USERNAME || '';
const SPORTFENGUR_PASSWORD = process.env.EIDFAXI_PASSWORD || '';

const EVENT_DEFINITIONS = {
  event_einkunn_saeti: ['eventId', 'classId', 'competitionId'],
  event_mot_skra: ['eventId'],
  event_keppendalisti_breyta: ['eventId'],
  event_motadagskra_breytist: ['eventId'],
  event_raslisti_birtur: ['eventId', 'classId', 'published'],
  event_naesti_sprettur: ['eventId', 'classId', 'competitionId'],
  event_keppnisgreinar: ['eventId'],
};

let excelWriteQueue = Promise.resolve();
let authToken = '';
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

async function appendWebhookRow(eventName, payload) {
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
    await workbook.xlsx.writeFile(EXCEL_PATH);
  });
}

async function login() {
  if (!SPORTFENGUR_USERNAME || !SPORTFENGUR_PASSWORD) {
    throw new Error(
      'Missing SportFengur credentials (EIDFAXI_USERNAME / EIDFAXI_PASSWORD).',
    );
  }

  const response = await fetch(`${SPORTFENGUR_BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: SPORTFENGUR_USERNAME,
      password: SPORTFENGUR_PASSWORD,
    }),
  });

  if (!response.ok) {
    throw new Error(`Login failed (${response.status})`);
  }

  const data = await response.json();
  if (!data.token) {
    throw new Error('Login failed (no token)');
  }

  authToken = data.token;
  authTokenFetchedAt = Date.now();
  return authToken;
}

async function getAuthToken() {
  if (authToken) {
    return authToken;
  }
  return login();
}

async function apiGet(path) {
  const token = await getAuthToken();
  const response = await fetch(`${SPORTFENGUR_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`SportFengur GET ${path} failed (${response.status})`);
  }

  return response.json();
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
  const data = await apiGet(`/horseinfo/${horseId}`);
  const info = Array.isArray(data?.res) ? data.res[0] : null;
  horseInfoCache.set(horseId, info);
  return info;
}

async function updateStartingListSheet(startingList) {
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
          if (fatherCol)
            row.getCell(fatherCol).value = horseInfo.fadir_nafn ?? '';
          if (motherCol)
            row.getCell(motherCol).value = horseInfo.modir_nafn ?? '';
        }
      }
    }

    await workbook.xlsx.writeFile(EXCEL_PATH);
  });
}

async function writeDataSheet(sheetName, headers, rows) {
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

    await workbook.xlsx.writeFile(EXCEL_PATH);
  });
}

async function handleEventRaslisti(payload) {
  const { classId, competitionId } = payload;
  const data = await apiGet(
    `/${SPORTFENGUR_LOCALE}/startinglist/${classId}/${competitionId}`,
  );
  const startingList = Array.isArray(data?.raslisti) ? data.raslisti : [];
  await updateStartingListSheet(startingList);
}

async function handleEventKeppendalistiBreyta(payload) {
  const data = await apiGet(
    `/${SPORTFENGUR_LOCALE}/participants/${payload.eventId}`,
  );
  const rows = (data?.res || []).map((item) => ({
    timestamp: new Date().toISOString(),
    eventId: payload.eventId,
    keppandi_numer: item.keppandi_numer ?? '',
    knapi_nafn: item.knapi_nafn ?? '',
    hross_nafn: item.hross_nafn ?? '',
    hross_fulltnafn: item.hross_fulltnafn ?? '',
    faedingarnumer: item.faedingarnumer ?? '',
    knapi_adildarfelag: item.knapi_adildarfelag ?? '',
    eigandi_adildarfelag: item.eigandi_adildarfelag ?? '',
    litur: item.litur ?? '',
    varaknapi_nafn: item.varaknapi_nafn ?? '',
    varapar: item.varapar ?? '',
    keppnisgreinar: JSON.stringify(item.keppnisgreinar ?? []),
  }));
  await writeDataSheet(
    'keppendalisti',
    [
      'timestamp',
      'eventId',
      'keppandi_numer',
      'knapi_nafn',
      'hross_nafn',
      'hross_fulltnafn',
      'faedingarnumer',
      'knapi_adildarfelag',
      'eigandi_adildarfelag',
      'litur',
      'varaknapi_nafn',
      'varapar',
      'keppnisgreinar',
    ],
    rows,
  );
}

async function handleEventKeppnisgreinar(payload) {
  const data = await apiGet(
    `/${SPORTFENGUR_LOCALE}/event/tests/${payload.eventId}`,
  );
  const rows = (data?.res || []).map((item) => ({
    timestamp: new Date().toISOString(),
    eventId: payload.eventId,
    mot_numer: item.mot_numer ?? '',
    flokkur_nafn: item.flokkur_nafn ?? '',
    flokkar_numer: item.flokkar_numer ?? '',
    keppnisgrein: item.keppnisgrein ?? '',
    keppni: item.keppni ?? '',
    keppni_numer: item.keppni_numer ?? '',
    keppni_rod: item.keppni_rod ?? '',
    rod: item.rod ?? '',
    raslisti_birtur: item.raslisti_birtur ?? '',
  }));
  await writeDataSheet(
    'keppnisgreinar',
    [
      'timestamp',
      'eventId',
      'mot_numer',
      'flokkur_nafn',
      'flokkar_numer',
      'keppnisgrein',
      'keppni',
      'keppni_numer',
      'keppni_rod',
      'rod',
      'raslisti_birtur',
    ],
    rows,
  );
}

async function handleEventEinkunnSaeti(payload) {
  const { classId, competitionId } = payload;
  const data = await apiGet(
    `/${SPORTFENGUR_LOCALE}/test/results/${classId}/${competitionId}`,
  );
  const rows = (data?.einkunnir || []).map((item) => ({
    timestamp: new Date().toISOString(),
    eventId: payload.eventId,
    classId,
    competitionId,
    knapi_nafn: item.knapi_nafn ?? '',
    hross_nafn: item.hross_nafn ?? '',
    hross_fulltnafn: item.hross_fulltnafn ?? '',
    faedingarnumer: item.faedingarnumer ?? '',
    keppandi_numer: item.keppandi_numer ?? '',
    vallarnumer: item.vallarnumer ?? '',
    saeti: item.saeti ?? '',
    keppandi_medaleinkunn: item.keppandi_medaleinkunn ?? '',
    keppandi_einkunn_5_ds: item.keppandi_einkunn_5_ds ?? '',
    einkunnir_domara: JSON.stringify(item.einkunnir_domara ?? []),
  }));
  await writeDataSheet(
    'einkunnir',
    [
      'timestamp',
      'eventId',
      'classId',
      'competitionId',
      'knapi_nafn',
      'hross_nafn',
      'hross_fulltnafn',
      'faedingarnumer',
      'keppandi_numer',
      'vallarnumer',
      'saeti',
      'keppandi_medaleinkunn',
      'keppandi_einkunn_5_ds',
      'einkunnir_domara',
    ],
    rows,
  );
}

function requireWebhookSecret(req, res) {
  if (!WEBHOOK_SECRET_REQUIRED) {
    return true;
  }
  const secretHeader = req.header('x-webhook-secret') || '';
  if (!WEBHOOK_SECRET || secretHeader !== WEBHOOK_SECRET) {
    res.status(401).send('Unauthorized');
    return false;
  }
  return true;
}

function validatePayload(eventName, payload) {
  const required = EVENT_DEFINITIONS[eventName] || [];
  const missing = required.filter(
    (key) =>
      payload[key] === undefined ||
      payload[key] === null ||
      payload[key] === '',
  );
  return missing;
}

app.get('/', (req, res) => {
  res.send('OK');
});

async function handleWebhook(req, res, eventName) {
  if (!requireWebhookSecret(req, res)) {
    return;
  }

  const payload = req.body || {};
  const missing = validatePayload(eventName, payload);
  if (missing.length > 0) {
    res.status(400).send(`Missing required fields: ${missing.join(', ')}`);
    return;
  }

  console.log(`[webhook] ${eventName}`, payload);
  await appendWebhookRow(eventName, payload);

  if (
    eventName === 'event_raslisti_birtur' ||
    eventName === 'event_naesti_sprettur'
  ) {
    await handleEventRaslisti(payload);
  } else if (eventName === 'event_keppendalisti_breyta') {
    await handleEventKeppendalistiBreyta(payload);
  } else if (eventName === 'event_keppnisgreinar') {
    await handleEventKeppnisgreinar(payload);
  } else if (eventName === 'event_einkunn_saeti') {
    await handleEventEinkunnSaeti(payload);
  }

  res.send('Skeyti móttekið');
}

Object.keys(EVENT_DEFINITIONS).forEach((eventName) => {
  app.post(`/${eventName}`, (req, res) => {
    handleWebhook(req, res, eventName).catch((error) => {
      console.error(`Webhook ${eventName} failed:`, error);
      res.status(500).send('Internal Server Error');
    });
  });

  app.post(`/webhooks/${eventName}`, (req, res) => {
    handleWebhook(req, res, eventName).catch((error) => {
      console.error(`Webhook ${eventName} failed:`, error);
      res.status(500).send('Internal Server Error');
    });
  });
});

app.post('/webhooks/test', (req, res) => {
  console.log('[webhook] test', req.body);
  res.send('Skeyti móttekið');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
