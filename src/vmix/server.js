import {
  getCurrentState,
  getLeaderboardState,
  getCompetitionMetadata,
  getCompetitionSpecificMetadata,
} from './state.js';
import { leaderboardToCsv } from './normalizer.js';
import { apiGetWithRetry } from '../sportfengur.js';
import { EVENT_ID_FILTER, SPORTFENGUR_LOCALE } from '../config.js';
import { log } from '../logger.js';
import JSZip from 'jszip';

const COMPETITION_TYPE_TO_ID = {
  forkeppni: 1,
  'a-urslit': 2,
  'b-urslit': 3,
};

const COLOR_HEX_BY_RAS_COLOR = {
  '1 - Rauður': '#FF0000',
  '2 - Gulur': '#FFFF00',
  '3 - Grænn': '#008000',
  '4 - Blár': '#0000FF',
  '5 - Hvítur': '#FFFFFF',
};

function getColorHex(color) {
  return COLOR_HEX_BY_RAS_COLOR[String(color || '').trim()] || '';
}

function withUtf8Bom(text) {
  return `\uFEFF${text}`;
}

function extractGangtegundResults(currentState, sort = 'start') {
  const rowsByGait = new Map();
  const excludeKeys = new Set([
    'Nr',
    'Saeti',
    'Holl',
    'Hond',
    'Knapi',
    'LiturRas',
    'FelagKnapa',
    'Hestur',
    'Litur',
    'Aldur',
    'FelagEiganda',
    'Lid',
    'NafnBIG',
    'E1',
    'E2',
    'E3',
    'E4',
    'E5',
    'E6',
    'adal',
    'timestamp',
  ]);

  currentState.forEach((rider) => {
    for (const [key, value] of Object.entries(rider)) {
      if (excludeKeys.has(key) || typeof value !== 'object') continue;
      const scores = {};
      for (const [scoreKey, scoreValue] of Object.entries(value)) {
        if (scoreKey !== '_title') {
          scores[scoreKey] = scoreValue;
        }
      }
      const row = {
        gangtegundKey: key,
        title: value._title || key,
        name: rider.Knapi,
        horse: rider.Hestur,
        color: rider.LiturRas || '',
        colorHex: getColorHex(rider.LiturRas),
        Nr: rider.Nr,
        Saeti: rider.Saeti,
        pos: '',
        ...scores,
      };
      if (!rowsByGait.has(key)) {
        rowsByGait.set(key, []);
      }
      rowsByGait.get(key).push(row);
    }
  });

  const gaitKeys = [...rowsByGait.keys()].sort((a, b) => a.localeCompare(b));
  const output = [];

  for (const gaitKey of gaitKeys) {
    const rows = rowsByGait.get(gaitKey) || [];
    rows.sort((a, b) => {
      const valueA =
        sort === 'rank'
          ? Number(String(a.E6 || '').replace(',', '.'))
          : Number(String(a.Nr || '').replace(',', '.'));
      const valueB =
        sort === 'rank'
          ? Number(String(b.E6 || '').replace(',', '.'))
          : Number(String(b.Nr || '').replace(',', '.'));
      const hasA = Number.isFinite(valueA);
      const hasB = Number.isFinite(valueB);

      if (hasA && hasB && valueA !== valueB) {
        return sort === 'rank' ? valueB - valueA : valueA - valueB;
      }
      if (hasA !== hasB) return hasA ? -1 : 1;

      const nameA = String(a.name || '');
      const nameB = String(b.name || '');
      return nameA.localeCompare(nameB);
    });

    rows.forEach((row, index) => {
      row.pos = String(index + 1);
      delete row.Nr;
      delete row.Saeti;
      output.push(row);
    });
  }

  return output;
}

function sortLeaderboard(entries, sort) {
  const mode = sort === 'rank' ? 'rank' : 'start';
  return [...entries].sort((a, b) => {
    const valueA = Number(mode === 'rank' ? a.Saeti : a.Nr) || 999;
    const valueB = Number(mode === 'rank' ? b.Saeti : b.Nr) || 999;
    return valueA - valueB;
  });
}

function chunkEntries(entries, size) {
  const chunkSize = Number.isInteger(size) && size > 0 ? size : 7;
  const groups = [];
  for (let i = 0; i < entries.length; i += chunkSize) {
    groups.push(entries.slice(i, i + chunkSize));
  }
  return groups;
}

function isRequestedEventAllowed(requestedEventId) {
  if (EVENT_ID_FILTER == null) {
    return true;
  }
  return requestedEventId === EVENT_ID_FILTER;
}

function resolveEventIdRequest(req, res) {
  const requestedEventId = Number(req.params.eventId);
  if (!Number.isInteger(requestedEventId)) {
    res.status(400).json({ error: 'Invalid event ID' });
    return null;
  }
  if (!isRequestedEventAllowed(requestedEventId)) {
    res.status(404).json({ error: 'No data available for this event' });
    return null;
  }
  return requestedEventId;
}

function resolveCompetitionScope(req, res) {
  const requestedEventId = resolveEventIdRequest(req, res);
  if (requestedEventId == null) return null;

  const competitionType = String(req.params.competitionType || '')
    .trim()
    .toLowerCase();
  const competitionId = COMPETITION_TYPE_TO_ID[competitionType];

  if (!competitionId) {
    res.status(404).json({
      error: 'Unknown competition type',
      competitionType,
      supported: Object.keys(COMPETITION_TYPE_TO_ID),
    });
    return null;
  }

  const metadata = getCompetitionSpecificMetadata(competitionId);
  if (metadata.eventId !== null && metadata.eventId !== requestedEventId) {
    res.status(404).json({
      error: 'No data available for this event',
      requestedEventId,
      currentEventId: metadata.eventId,
    });
    return null;
  }

  return { requestedEventId, competitionType, competitionId };
}

function resolveCompetitionRequest(req, res, defaultSort = 'start') {
  const scope = resolveCompetitionScope(req, res);
  if (!scope) return null;
  const { requestedEventId, competitionType, competitionId } = scope;

  const sort = req.query.sort == null ? defaultSort : String(req.query.sort);
  if (sort !== 'start' && sort !== 'rank') {
    res.status(400).json({
      error: 'Invalid sort value',
      supported: ['start', 'rank'],
    });
    return null;
  }

  const leaderboard = getLeaderboardState(competitionId);
  const sorted = sortLeaderboard(leaderboard, sort);
  return { requestedEventId, competitionType, sort, sorted };
}

export function registerVmixRoutes(app) {
  app.get('/event/:eventId/current', (req, res) => {
    const requestedEventId = resolveEventIdRequest(req, res);
    if (requestedEventId == null) return;

    const metadata = getCompetitionMetadata();
    if (metadata.eventId !== null && metadata.eventId !== requestedEventId) {
      return res.status(404).json({
        error: 'No data available for this event',
        requestedEventId,
        currentEventId: metadata.eventId,
      });
    }

    const currentState = getCurrentState();

    log.server.endpoint(`/event/${requestedEventId}/current`, currentState.length);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.json(currentState);
  });

  const sendLeaderboardsZip = async (req, res) => {
    const requestedEventId = resolveEventIdRequest(req, res);
    if (requestedEventId == null) return;

    const zip = new JSZip();
    const currentMetadata = getCompetitionMetadata();
    const currentState =
      currentMetadata.eventId === null ||
      currentMetadata.eventId === requestedEventId
        ? getCurrentState()
        : [];
    zip.file(
      `current-${requestedEventId}.csv`,
      withUtf8Bom(leaderboardToCsv(currentState)),
    );

    for (const [competitionType, competitionId] of Object.entries(
      COMPETITION_TYPE_TO_ID,
    )) {
      const metadata = getCompetitionSpecificMetadata(competitionId);
      const competitionState =
        metadata.eventId === null || metadata.eventId === requestedEventId
          ? getLeaderboardState(competitionId)
          : [];

      const startRows = sortLeaderboard(competitionState, 'start');
      const rankRows = sortLeaderboard(competitionState, 'rank');

      zip.file(
        `${competitionType}-${requestedEventId}-start.csv`,
        withUtf8Bom(leaderboardToCsv(startRows)),
      );
      zip.file(
        `${competitionType}-${requestedEventId}-rank.csv`,
        withUtf8Bom(leaderboardToCsv(rankRows)),
      );
    }

    const archive = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="leaderboards-${requestedEventId}.zip"`,
    );
    res.send(archive);
  };

  app.get('/event/:eventId/leaderboards.zip', sendLeaderboardsZip);
  app.get('/event/:eventId/csv.zip', sendLeaderboardsZip);

  app.get('/event/:eventId/:competitionType', (req, res) => {
    const resolved = resolveCompetitionRequest(req, res);
    if (!resolved) return;
    const { requestedEventId, competitionType, sort, sorted } = resolved;

    log.server.endpoint(
      `/event/${requestedEventId}/${competitionType}?sort=${sort}`,
      sorted.length,
    );

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.json(sorted);
  });

  app.get('/event/:eventId/:competitionType/groups', (req, res) => {
    const resolved = resolveCompetitionRequest(req, res);
    if (!resolved) return;
    const { requestedEventId, competitionType, sort, sorted } = resolved;

    const groupSize =
      req.query.groupSize == null ? 7 : Number.parseInt(req.query.groupSize, 10);
    if (!Number.isInteger(groupSize) || groupSize <= 0 || groupSize > 50) {
      return res.status(400).json({
        error: 'Invalid groupSize value',
        supported: '1-50',
      });
    }

    const vmixRows = sorted.map((entry) => ({
      name: entry.Knapi || '',
      horse: entry.Hestur || '',
      Lid: entry.Lid || '',
      Nr: entry.Nr || '',
      einkunn: entry.E6 || '',
    }));
    const groups = chunkEntries(vmixRows, groupSize);
    log.server.endpoint(
      `/event/${requestedEventId}/${competitionType}/groups?sort=${sort}&groupSize=${groupSize}`,
      sorted.length,
    );

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.json(groups);
  });

  app.get('/event/:eventId/:competitionType/group', (req, res) => {
    const resolved = resolveCompetitionRequest(req, res);
    if (!resolved) return;
    const { requestedEventId, competitionType, sort, sorted } = resolved;

    const groupSize =
      req.query.groupSize == null ? 7 : Number.parseInt(req.query.groupSize, 10);
    if (!Number.isInteger(groupSize) || groupSize <= 0 || groupSize > 50) {
      return res.status(400).json({
        error: 'Invalid groupSize value',
        supported: '1-50',
      });
    }

    const group =
      req.query.group == null ? 1 : Number.parseInt(req.query.group, 10);
    if (!Number.isInteger(group) || group <= 0) {
      return res.status(400).json({
        error: 'Invalid group value',
        supported: '>= 1',
      });
    }

    const vmixRows = sorted.map((entry) => ({
      name: entry.Knapi || '',
      horse: entry.Hestur || '',
      Lid: entry.Lid || '',
      Nr: entry.Nr || '',
      einkunn: entry.E6 || '',
    }));
    const groups = chunkEntries(vmixRows, groupSize);
    const selectedGroup = groups[group - 1] || [];

    log.server.endpoint(
      `/event/${requestedEventId}/${competitionType}/group?sort=${sort}&groupSize=${groupSize}&group=${group}`,
      selectedGroup.length,
    );

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.json(selectedGroup);
  });

  app.get('/event/:eventId/:competitionType/groups/flat', (req, res) => {
    const resolved = resolveCompetitionRequest(req, res);
    if (!resolved) return;
    const { requestedEventId, competitionType, sort, sorted } = resolved;

    const groupSize =
      req.query.groupSize == null ? 7 : Number.parseInt(req.query.groupSize, 10);
    if (!Number.isInteger(groupSize) || groupSize <= 0 || groupSize > 50) {
      return res.status(400).json({
        error: 'Invalid groupSize value',
        supported: '1-50',
      });
    }

    const vmixRows = sorted.map((entry) => ({
      name: entry.Knapi || '',
      horse: entry.Hestur || '',
      Lid: entry.Lid || '',
      Nr: entry.Nr || '',
      einkunn: entry.E6 || '',
    }));

    const grouped = chunkEntries(vmixRows, groupSize);
    const flattened = grouped.map((groupRows, groupIndex) => {
      const row = { group: groupIndex + 1 };
      for (let i = 0; i < groupSize; i += 1) {
        const contestant = groupRows[i];
        const n = i + 1;
        row[`name${n}`] = contestant?.name || '';
        row[`horse${n}`] = contestant?.horse || '';
        row[`Lid${n}`] = contestant?.Lid || '';
        row[`Nr${n}`] = contestant?.Nr || '';
        row[`einkunn${n}`] = contestant?.einkunn || '';
      }
      return row;
    });

    log.server.endpoint(
      `/event/${requestedEventId}/${competitionType}/groups/flat?sort=${sort}&groupSize=${groupSize}`,
      flattened.length,
    );

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.json(flattened);
  });

  app.get('/event/:eventId/:competitionType/csv', (req, res) => {
    const resolved = resolveCompetitionRequest(req, res);
    if (!resolved) return;
    const { requestedEventId, competitionType, sort, sorted } = resolved;

    const csv = withUtf8Bom(leaderboardToCsv(sorted));
    log.server.endpoint(
      `/event/${requestedEventId}/${competitionType}/csv?sort=${sort}`,
      sorted.length,
    );

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${competitionType}-${requestedEventId}-${sort}.csv"`,
    );
    res.send(csv);
  });

  app.get('/event/:eventId/:competitionType/results', (req, res) => {
    const resolved = resolveCompetitionRequest(req, res, 'start');
    if (!resolved) return;
    const { requestedEventId, competitionType, sort, sorted } = resolved;
    const results = extractGangtegundResults(sorted, sort);

    log.server.endpoint(
      `/event/${requestedEventId}/${competitionType}/results?sort=${sort}`,
      results.length,
    );

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.json(results);
  });

  app.get('/event/:eventId/participants', async (req, res) => {
    try {
      const eventId = req.params.eventId;

      if (!eventId || isNaN(eventId)) {
        return res.status(400).json({ error: 'Invalid event ID' });
      }

      const data = await apiGetWithRetry(
        `/${SPORTFENGUR_LOCALE}/participants/${eventId}`,
      );

      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('Content-Type', 'application/json');
      res.json(data);
    } catch (error) {
      console.error(`[vMix Server] Error fetching participants:`, error);
      res.status(error.status || 500).json({
        error: 'Failed to fetch participants',
        message: error.message,
      });
    }
  });

  app.get('/event/:eventId/tests', async (req, res) => {
    try {
      const eventId = req.params.eventId;

      if (!eventId || isNaN(eventId)) {
        return res.status(400).json({ error: 'Invalid event ID' });
      }

      const data = await apiGetWithRetry(
        `/${SPORTFENGUR_LOCALE}/event/tests/${eventId}`,
      );

      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('Content-Type', 'application/json');
      res.json(data);
    } catch (error) {
      console.error(`[vMix Server] Error fetching event tests:`, error);
      res.status(error.status || 500).json({
        error: 'Failed to fetch event tests',
        message: error.message,
      });
    }
  });

  app.get('/events/search', async (req, res) => {
    try {
      const queryParams = new URLSearchParams();

      const allowedParams = [
        'numer',
        'motsheiti',
        'motsnumer',
        'stadsetning',
        'felag_audkenni',
        'adildarfelag_numer',
        'land_kodi',
        'ar',
        'dagsetning_byrjar',
        'innanhusmot',
        'motstegund_numer',
        'stormot',
        'world_ranking',
        'skraning_stada',
      ];

      for (const param of allowedParams) {
        if (req.query[param] !== undefined) {
          queryParams.append(param, req.query[param]);
        }
      }

      const queryString = queryParams.toString();
      const path = `/${SPORTFENGUR_LOCALE}/events/search${queryString ? '?' + queryString : ''}`;

      const data = await apiGetWithRetry(path);

      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('Content-Type', 'application/json');
      res.json(data);
    } catch (error) {
      console.error(`[vMix Server] Error searching events:`, error);
      res.status(error.status || 500).json({
        error: 'Failed to search events',
        message: error.message,
      });
    }
  });
}
