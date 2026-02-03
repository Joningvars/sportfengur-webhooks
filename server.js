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
const EXCEL_PATH = process.env.EXCEL_PATH || './data/webhooks.xlsx';

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

  return { workbook, worksheet };
}

async function appendWebhookRow(eventName, payload) {
  await enqueueExcelWrite(async () => {
    const { workbook, worksheet } = await ensureWorkbook();
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
  const missing = required.filter((key) => payload[key] === undefined || payload[key] === null || payload[key] === '');
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
