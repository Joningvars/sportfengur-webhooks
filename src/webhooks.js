import {
  WEBHOOK_SECRET,
  WEBHOOK_SECRET_REQUIRED,
  SPORTFENGUR_LOCALE,
  DEDUPE_TTL_MS,
  DEBUG_LOGS,
} from './config.js';
import { apiGetWithRetry } from './sportfengur.js';
// writing to a single output file; keep sheet names for competitions
import {
  appendWebhookRow,
  updateStartingListSheet,
  updateResultsScores,
  writeDataSheet,
  removeSheet,
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

const COMPETITION_NAME_BY_ID = {
  1: 'Forkeppni',
  2: 'A-úrslit',
  3: 'B-úrslit',
  4: '1. sprettur',
  5: '2. sprettur',
  6: '3. sprettur',
  7: '4. sprettur',
  8: '5. sprettur',
  9: '6. sprettur',
  10: 'Sérstök forkeppni',
  11: 'Milliriðill',
  12: 'C úrslit',
};

function logWebhook(message, ...args) {
  const ts = new Date().toTimeString().split(' ')[0];
  console.log(`[${ts}] ${message}`, ...args);
}

function formatWebhookInfo(eventName, payload) {
  return `tegund=${eventName} eventId=${payload.eventId ?? ''} classId=${
    payload.classId ?? ''
  } competitionId=${payload.competitionId ?? ''} published=${
    payload.published ?? ''
  }`;
}
function getCompetitionName(competitionId) {
  const id = Number(competitionId);
  if (!Number.isFinite(id)) return null;
  return COMPETITION_NAME_BY_ID[id] || null;
}

function getCompetitionSheetName(competitionId) {
  const name = getCompetitionName(competitionId);
  const id = Number(competitionId);
  if (name) {
    return name;
  }
  const base = `Keppni ${id}`;
  return base.length > 31 ? base.slice(0, 31) : base;
}

function sanitizeFileName(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/[áàâä]/gi, 'a')
    .replace(/[éèêë]/gi, 'e')
    .replace(/[íìîï]/gi, 'i')
    .replace(/[óòôö]/gi, 'o')
    .replace(/[úùûü]/gi, 'u')
    .replace(/[ýÿ]/gi, 'y')
    .replace(/[ð]/gi, 'd')
    .replace(/[þ]/gi, 'th')
    .replace(/[æ]/gi, 'ae')
    .replace(/[ö]/gi, 'o')
    .trim();
}

function getCompetitionFilePath(competitionId) {
  return sanitizeFileName(getCompetitionSheetName(competitionId));
}

const dedupeCache = new Map();
const startingListCache = new Map();
const competitionIdByClassId = new Map();
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

async function resolveCompetitionId(payload) {
  if (payload.competitionId != null) {
    competitionIdByClassId.set(payload.classId, payload.competitionId);
    return payload.competitionId;
  }
  if (payload.classId != null && competitionIdByClassId.has(payload.classId)) {
    return competitionIdByClassId.get(payload.classId);
  }
  if (payload.eventId == null || payload.classId == null) {
    return null;
  }
  const data = await apiGetWithRetry(
    `/${SPORTFENGUR_LOCALE}/event/tests/${payload.eventId}`,
  );
  const tests = Array.isArray(data?.res) ? data.res : [];
  const match = tests.find(
    (item) => Number(item.flokkar_numer) === Number(payload.classId),
  );
  if (match?.keppni_numer != null) {
    competitionIdByClassId.set(payload.classId, match.keppni_numer);
    return match.keppni_numer;
  }
  return null;
}

async function handleEventRaslisti(payload) {
  const classId = payload.classId;
  const competitionId = await resolveCompetitionId(payload);
  if (competitionId == null) {
    throw new Error('Missing competitionId for startinglist.');
  }
  const colorYellow = '\x1b[33m';
  const colorGreen = '\x1b[32m';
  const colorReset = '\x1b[0m';
  const competitionName = getCompetitionName(competitionId);
  const sheetName = getCompetitionSheetName(competitionId);
  const legacySheetName = getCompetitionName(competitionId)
    ? `${getCompetitionName(competitionId)} (${competitionId})`
    : null;
  const outputPath = null;
  const start = Date.now();
  logWebhook(
    `[ráslisti] Sæki keppni ${
      competitionName ? `${competitionName} ` : ''
    }(flokkur ${classId}, keppni ${competitionId})`,
  );
  const data = await apiGetWithRetry(
    `/${SPORTFENGUR_LOCALE}/startinglist/${classId}/${competitionId}`,
  );
  const startingList = Array.isArray(data?.raslisti) ? data.raslisti : [];
  logWebhook(`[ráslisti] Fjöldi í ráslista: ${startingList.length}`);
  logWebhook(
    `${colorYellow}Það er verið að skrifa í excel file'inn. Haldið í hestana!${colorReset}`,
  );
  await updateStartingListSheet(
    startingList,
    sheetName,
    legacySheetName ? [legacySheetName] : [],
    outputPath,
  );
  logWebhook(`${colorGreen}Búið að skrifa${colorReset}`);
  logWebhook(`[ráslisti] Skrifun lokið á ${Date.now() - start}ms`);
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
  const classId = payload.classId;
  const competitionId = await resolveCompetitionId(payload);
  if (competitionId == null) {
    throw new Error('Missing competitionId for results.');
  }
  const colorYellow = '\x1b[33m';
  const colorGreen = '\x1b[32m';
  const colorReset = '\x1b[0m';
  const competitionName = getCompetitionName(competitionId);
  const sheetName = getCompetitionSheetName(competitionId);
  const legacySheetName = getCompetitionName(competitionId)
    ? `${getCompetitionName(competitionId)} (${competitionId})`
    : null;
  const outputPath = null;
  const start = Date.now();
  logWebhook(
    `[einkunnir] Sæki keppni ${
      competitionName ? `${competitionName} ` : ''
    }(flokkur ${classId}, keppni ${competitionId})`,
  );
  const data = await apiGetWithRetry(
    `/${SPORTFENGUR_LOCALE}/test/results/${classId}/${competitionId}`,
  );
  if (DEBUG_LOGS) {
    logWebhook('[einkunnir] response', data);
  }
  logWebhook(
    `${colorYellow}Það er verið að skrifa í excel file'inn. Haldið í hestana!${colorReset}`,
  );
  await updateResultsScores(
    data?.einkunnir || [],
    sheetName,
    legacySheetName ? [legacySheetName] : [],
    outputPath,
  );
  logWebhook(`${colorGreen}Búið að skrifa${colorReset}`);
  logWebhook(`[einkunnir] Skrifun lokið á ${Date.now() - start}ms`);
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

  const colorCyan = '\x1b[36m';
  const colorReset = '\x1b[0m';
  logWebhook(
    `${colorCyan}[vefkrókur] móttekið${colorReset} ${formatWebhookInfo(
      eventName,
      payload,
    )}`,
  );
  res.send('Skeyti móttekið');

  lastWebhookAt = new Date().toISOString();
  const key = dedupeKey(eventName, payload);
  pruneDedupeCache();
  if (dedupeCache.has(key)) {
    logWebhook(`[vefkrókur] tvíritun hunsuð ${key}`);
    return;
  }
  dedupeCache.set(key, Date.now());

  try {
    const start = Date.now();
    logWebhook(`[vefkrókur] vinnsla hafin: ${eventName}`);
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
    logWebhook(`[vefkrókur] lokið: ${eventName} á ${Date.now() - start}ms`);
  } catch (error) {
    lastError = `${new Date().toISOString()} ${eventName} ${error.message}`;
    logWebhook(`Vefkrókur ${eventName} mistókst:`, error);
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
    logWebhook('[vefkrókur] prófun', req.body);
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

export function registerCacheRoutes(app) {
  app.post('/cache/raslisti/clear', (req, res) => {
    startingListCache.clear();
    res.send('Cache hreinsað');
  });
}

export function registerRootRoute(app) {
  app.get('/', (req, res) => {
    res.redirect('/docs');
  });
}
