import {
  WEBHOOK_SECRET,
  WEBHOOK_SECRET_REQUIRED,
  SPORTFENGUR_LOCALE,
  DEDUPE_TTL_MS,
  DEBUG_LOGS,
} from './config.js';
import { apiGetWithRetry } from './sportfengur.js';
import {
  appendWebhookRow,
  updateStartingListSheet,
  updateResultsScores,
  writeDataSheet,
} from './excel.js';

const EVENT_DEFINITIONS = {
  event_einkunn_saeti: ['eventId', 'classId', 'competitionId'],
  event_mot_skra: ['eventId'],
  event_keppendalisti_breyta: ['eventId'],
  event_motadagskra_breytist: ['eventId'],
  event_raslisti_birtur: ['eventId', 'classId', 'published'],
  event_naesti_sprettur: ['eventId', 'classId', 'competitionId'],
  event_keppnisgreinar: ['eventId'],
};

const dedupeCache = new Map();
const startingListCache = new Map();
let lastWebhookAt = null;
let lastWebhookProcessedAt = null;
let lastError = null;
let currentPayload = null;

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

function normalizePayload(payload) {
  return {
    ...payload,
    eventId: payload.eventId ?? payload.eventid ?? payload.event_id,
    classId: payload.classId ?? payload.classid ?? payload.class_id,
    competitionId:
      payload.competitionId ?? payload.competitionid ?? payload.competition_id,
    published:
      payload.published ?? payload.published_at ?? payload.is_published,
  };
}

function pruneDedupeCache() {
  const now = Date.now();
  for (const [key, ts] of dedupeCache.entries()) {
    if (now - ts > DEDUPE_TTL_MS) {
      dedupeCache.delete(key);
    }
  }
}

function dedupeKey(eventName, payload) {
  return [
    eventName,
    payload.eventId ?? '',
    payload.classId ?? '',
    payload.competitionId ?? '',
    payload.published ?? '',
  ].join('|');
}

async function handleEventRaslisti(payload) {
  const { classId, competitionId } = payload;
  const cacheKey = `${classId}:${competitionId}`;
  if (startingListCache.has(cacheKey)) {
    console.log(`[raslisti] cache hit ${cacheKey}`);
    return;
  }
  const data = await apiGetWithRetry(
    `/${SPORTFENGUR_LOCALE}/startinglist/${classId}/${competitionId}`,
  );
  const startingList = Array.isArray(data?.raslisti) ? data.raslisti : [];
  console.log(
    `[raslisti] ${classId}/${competitionId} count=${startingList.length}`,
  );
  if (DEBUG_LOGS) {
    console.log('[raslisti] response', data);
  }
  await updateStartingListSheet(startingList);
  startingListCache.set(cacheKey, true);
}

async function handleEventKeppendalistiBreyta(payload) {
  const data = await apiGetWithRetry(
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
  const data = await apiGetWithRetry(
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
  const data = await apiGetWithRetry(
    `/${SPORTFENGUR_LOCALE}/test/results/${classId}/${competitionId}`,
  );
  if (DEBUG_LOGS) {
    console.log('[einkunn_saeti] response', data);
  }
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
  await updateResultsScores(data?.einkunnir || []);
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

async function handleWebhook(req, res, eventName) {
  if (!requireWebhookSecret(req, res)) {
    return;
  }

  const payload = normalizePayload(req.body || {});
  const missing = validatePayload(eventName, payload);
  if (missing.length > 0) {
    res.status(400).send(`Missing required fields: ${missing.join(', ')}`);
    return;
  }

  console.log(`[webhook] ${eventName}`, payload);
  res.send('Skeyti móttekið');

  lastWebhookAt = new Date().toISOString();
  const key = dedupeKey(eventName, payload);
  pruneDedupeCache();
  if (dedupeCache.has(key)) {
    console.log(`[webhook] duplicate ignored ${key}`);
    return;
  }
  dedupeCache.set(key, Date.now());

  try {
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

    lastWebhookProcessedAt = new Date().toISOString();
  } catch (error) {
    lastError = `${new Date().toISOString()} ${eventName} ${error.message}`;
    console.error(`Webhook ${eventName} failed:`, error);
  }
}

export function registerWebhookRoutes(app) {
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
}

export function registerHealthRoute(app) {
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      lastWebhookAt,
      lastWebhookProcessedAt,
      lastError,
    });
  });
}

export function registerTestRoute(app) {
  app.post('/webhooks/test', (req, res) => {
    console.log('[webhook] test', req.body);
    res.send('Skeyti móttekið');
  });
}

export function registerCurrentRoutes(app) {
  app.get('/current', (req, res) => {
    res.json(currentPayload ?? {});
  });

  app.post('/current', (req, res) => {
    currentPayload = req.body || {};
    res.send('Skeyti móttekið');
  });
}

export function registerRootRoute(app) {
  app.get('/', (req, res) => {
    res.redirect('/docs');
  });
}
