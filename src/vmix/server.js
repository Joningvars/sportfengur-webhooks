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

const COMPETITION_TYPE_TO_ID = {
  forkeppni: 1,
  'a-urslit': 2,
  'b-urslit': 3,
};

function sortLeaderboard(entries, sort) {
  const mode = sort === 'rank' ? 'rank' : 'start';
  return [...entries].sort((a, b) => {
    const valueA = Number(mode === 'rank' ? a.Saeti : a.Nr) || 999;
    const valueB = Number(mode === 'rank' ? b.Saeti : b.Nr) || 999;
    return valueA - valueB;
  });
}

function isRequestedEventAllowed(requestedEventId) {
  if (EVENT_ID_FILTER == null) {
    return true;
  }
  return requestedEventId === EVENT_ID_FILTER;
}

function resolveCompetitionRequest(req, res) {
  const requestedEventId = Number(req.params.eventId);
  if (!Number.isInteger(requestedEventId)) {
    res.status(400).json({ error: 'Invalid event ID' });
    return null;
  }
  if (!isRequestedEventAllowed(requestedEventId)) {
    res.status(404).json({ error: 'No data available for this event' });
    return null;
  }

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

  const sort = req.query.sort == null ? 'start' : String(req.query.sort);
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
    const requestedEventId = Number(req.params.eventId);
    if (!Number.isInteger(requestedEventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }
    if (!isRequestedEventAllowed(requestedEventId)) {
      return res.status(404).json({ error: 'No data available for this event' });
    }

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

  app.get('/event/:eventId/:competitionType/csv', (req, res) => {
    const resolved = resolveCompetitionRequest(req, res);
    if (!resolved) return;
    const { requestedEventId, competitionType, sort, sorted } = resolved;

    const csv = leaderboardToCsv(sorted);
    log.server.endpoint(
      `/event/${requestedEventId}/${competitionType}/csv?sort=${sort}`,
      sorted.length,
    );

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${competitionType}-${requestedEventId}-${sort}.csv"`,
    );
    res.send(csv);
  });

  app.get('/leaderboard.csv', (req, res) => {
    const leaderboardState = getLeaderboardState();
    const csv = leaderboardToCsv(leaderboardState);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/csv');
    res.send(csv);
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
