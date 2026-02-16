import {
  WEBHOOK_SECRET,
  WEBHOOK_SECRET_REQUIRED,
  SPORTFENGUR_LOCALE,
  DEDUPE_TTL_MS,
  DEBUG_LOGS,
  EVENT_ID_FILTER,
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
import { scheduleRefresh, setCompetitionContext } from './vmix/refresh.js';
import { log } from './logger.js';

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

function isAllowedEventId(payload) {
  if (EVENT_ID_FILTER == null) {
    return true;
  }
  return Number(payload.eventId) === EVENT_ID_FILTER;
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
  const competitionName = getCompetitionName(competitionId);
  const sheetName = getCompetitionSheetName(competitionId);
  const legacySheetName = getCompetitionName(competitionId)
    ? `${getCompetitionName(competitionId)} (${competitionId})`
    : null;
  const outputPath = null;
  const start = Date.now();

  log.excel.fetching(
    competitionName || `Competition ${competitionId}`,
    classId,
    competitionId,
  );

  const data = await apiGetWithRetry(
    `/${SPORTFENGUR_LOCALE}/startinglist/${classId}/${competitionId}`,
  );
  const startingList = Array.isArray(data?.raslisti) ? data.raslisti : [];

  log.excel.writing();
  await updateStartingListSheet(
    startingList,
    sheetName,
    legacySheetName ? [legacySheetName] : [],
    outputPath,
  );
  log.excel.written();
  log.excel.completed(startingList.length, Date.now() - start);
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
  const competitionName = getCompetitionName(competitionId);
  const sheetName = getCompetitionSheetName(competitionId);
  const legacySheetName = getCompetitionName(competitionId)
    ? `${getCompetitionName(competitionId)} (${competitionId})`
    : null;
  const outputPath = null;
  const start = Date.now();

  log.excel.fetching(
    competitionName || `Competition ${competitionId}`,
    classId,
    competitionId,
  );

  const data = await apiGetWithRetry(
    `/${SPORTFENGUR_LOCALE}/test/results/${classId}/${competitionId}`,
  );

  log.excel.writing();
  await updateResultsScores(
    data?.einkunnir || [],
    sheetName,
    legacySheetName ? [legacySheetName] : [],
    outputPath,
  );
  log.excel.written();
  log.excel.completed((data?.einkunnir || []).length, Date.now() - start);
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

  log.webhook.received(eventName, payload);
  res.send('Skeyti móttekið');

  lastWebhookAt = new Date().toISOString();
  const key = dedupeKey(eventName, payload);
  pruneDedupeCache();
  if (dedupeCache.has(key)) {
    log.webhook.duplicate(key);
    return;
  }
  dedupeCache.set(key, Date.now());

  try {
    const start = Date.now();
    log.webhook.processing(eventName);

    if (!isAllowedEventId(payload)) {
      log.webhook.filtered(payload.eventId ?? 'N/A', EVENT_ID_FILTER);
      return;
    }

    await appendWebhookRow(eventName, payload);

    // Resolve competitionId if needed
    let resolvedCompetitionId = payload.competitionId;

    if (
      eventName === 'event_raslisti_birtur' ||
      eventName === 'event_naesti_sprettur'
    ) {
      await handleEventRaslisti(payload);
      // Resolve competitionId for vMix refresh
      if (!resolvedCompetitionId && payload.classId) {
        resolvedCompetitionId = await resolveCompetitionId(payload);
      }
    } else if (eventName === 'event_keppendalisti_breyta') {
      await handleEventKeppendalistiBreyta(payload);
    } else if (eventName === 'event_keppnisgreinar') {
      await handleEventKeppnisgreinar(payload);
    } else if (eventName === 'event_einkunn_saeti') {
      await handleEventEinkunnSaeti(payload);
      // Resolve competitionId for vMix refresh
      if (!resolvedCompetitionId && payload.classId) {
        resolvedCompetitionId = await resolveCompetitionId(payload);
      }
    }

    // Trigger vMix refresh asynchronously (non-blocking)
    // Set competition context if available
    if (payload.eventId && payload.classId && resolvedCompetitionId) {
      // Force refresh for starting list webhooks, use cache for results webhooks
      const forceRefresh =
        eventName === 'event_raslisti_birtur' ||
        eventName === 'event_naesti_sprettur';

      setCompetitionContext(
        payload.eventId,
        payload.classId,
        resolvedCompetitionId,
        forceRefresh,
      );
      try {
        scheduleRefresh();
        log.vmix.scheduled(
          payload.eventId,
          payload.classId,
          resolvedCompetitionId,
          forceRefresh,
        );
      } catch (error) {
        log.error('vMix refresh scheduling', error);
      }
    } else {
      log.vmix.noContext();
    }

    lastWebhookProcessedAt = new Date().toISOString();
    log.webhook.completed(eventName, Date.now() - start);
  } catch (error) {
    lastError = `${new Date().toISOString()} ${eventName} ${error.message}`;
    log.error(`webhook ${eventName}`, error);
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
    log.webhook.received('test', req.body);
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
