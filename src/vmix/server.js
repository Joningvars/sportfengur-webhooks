
import {
  getCurrentState,
  getLeaderboardState,
  getCompetitionMetadata,
  getCompetitionSpecificMetadata,
} from './state.js';
import { leaderboardToCsv } from './normalizer.js';
import { apiGetWithRetry } from '../sportfengur.js';
import { SPORTFENGUR_LOCALE } from '../config.js';
import { log } from '../logger.js';

function extractGangtegundResults(currentState) {
  const gangtegundTypes = {};

  currentState.forEach((rider) => {
    for (const [key, value] of Object.entries(rider)) {
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

      if (!excludeKeys.has(key) && typeof value === 'object') {
        if (!gangtegundTypes[key]) {
          gangtegundTypes[key] = {
            gangtegundKey: key,
            title: value._title || key,
            einkunnir: [],
          };
        }

        const scores = {};
        for (const [scoreKey, scoreValue] of Object.entries(value)) {
          if (scoreKey !== '_title') {
            scores[scoreKey] = scoreValue;
          }
        }

        gangtegundTypes[key].einkunnir.push({
          nafn: rider.Knapi,
          saeti: rider.Saeti,
          ...scores,
        });
      }
    }
  });

  return Object.values(gangtegundTypes);
}

export function registerVmixRoutes(app) {
  app.get('/current', (req, res) => {
    const currentState = getCurrentState();

    log.server.endpoint('/current', currentState.length);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.json(currentState);
  });

  app.get('/forkeppni/sorted', (req, res) => {
    const currentState = getLeaderboardState(1);
    const sorted = [...currentState].sort((a, b) => {
      const saetiA = Number(a.Saeti) || 999;
      const saetiB = Number(b.Saeti) || 999;
      return saetiA - saetiB;
    });

    log.server.endpoint('/forkeppni/sorted', sorted.length);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.json(sorted);
  });

  app.get('/forkeppni', (req, res) => {
    const currentState = getLeaderboardState(1);
    const sorted = [...currentState].sort((a, b) => {
      const nrA = Number(a.Nr) || 999;
      const nrB = Number(b.Nr) || 999;
      return nrA - nrB;
    });

    log.server.endpoint('/forkeppni', sorted.length);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.json(sorted);
  });

  app.get('/a/sorted', (req, res) => {
    const currentState = getLeaderboardState(2);
    const sorted = [...currentState].sort((a, b) => {
      const saetiA = Number(a.Saeti) || 999;
      const saetiB = Number(b.Saeti) || 999;
      return saetiA - saetiB;
    });

    log.server.endpoint('/a/sorted', sorted.length);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.json(sorted);
  });

  app.get('/a', (req, res) => {
    const currentState = getLeaderboardState(2);
    const sorted = [...currentState].sort((a, b) => {
      const nrA = Number(a.Nr) || 999;
      const nrB = Number(b.Nr) || 999;
      return nrA - nrB;
    });

    log.server.endpoint('/a', sorted.length);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.json(sorted);
  });

  app.get('/b/sorted', (req, res) => {
    const currentState = getLeaderboardState(3);
    const sorted = [...currentState].sort((a, b) => {
      const saetiA = Number(a.Saeti) || 999;
      const saetiB = Number(b.Saeti) || 999;
      return saetiA - saetiB;
    });

    log.server.endpoint('/b/sorted', sorted.length);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.json(sorted);
  });

  app.get('/b', (req, res) => {
    const currentState = getLeaderboardState(3);
    const sorted = [...currentState].sort((a, b) => {
      const nrA = Number(a.Nr) || 999;
      const nrB = Number(b.Nr) || 999;
      return nrA - nrB;
    });

    log.server.endpoint('/b', sorted.length);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.json(sorted);
  });

  app.get('/:eventId/results/a', (req, res) => {
    const requestedEventId = Number(req.params.eventId);
    const metadata = getCompetitionSpecificMetadata(2);

    if (isNaN(requestedEventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    if (metadata.eventId !== null && metadata.eventId !== requestedEventId) {
      return res.status(404).json({
        error: 'No data available for this event',
        requestedEventId,
        currentEventId: metadata.eventId,
      });
    }

    if (metadata.competitionId !== null && metadata.competitionId !== 2) {
      return res.status(404).json({
        error: 'No A-úrslit data available',
        currentCompetitionId: metadata.competitionId,
      });
    }

    const currentState = getCurrentState();
    const resultsArray = extractGangtegundResults(currentState);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.json(resultsArray);
  });

  app.get('/:eventId/results/b', (req, res) => {
    const requestedEventId = Number(req.params.eventId);
    const metadata = getCompetitionSpecificMetadata(3);

    if (isNaN(requestedEventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    if (metadata.eventId !== null && metadata.eventId !== requestedEventId) {
      return res.status(404).json({
        error: 'No data available for this event',
        requestedEventId,
        currentEventId: metadata.eventId,
      });
    }

    if (metadata.competitionId !== null && metadata.competitionId !== 3) {
      return res.status(404).json({
        error: 'No B-úrslit data available',
        currentCompetitionId: metadata.competitionId,
      });
    }

    const currentState = getCurrentState();
    const resultsArray = extractGangtegundResults(currentState);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.json(resultsArray);
  });

  app.get('/:eventId/forkeppni/sorted', (req, res) => {
    const requestedEventId = Number(req.params.eventId);
    const metadata = getCompetitionSpecificMetadata(1);

    if (isNaN(requestedEventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    if (metadata.eventId !== null && metadata.eventId !== requestedEventId) {
      return res.status(404).json({
        error: 'No Forkeppni data available for this event',
        requestedEventId,
        currentEventId: metadata.eventId,
      });
    }

    const currentState = getLeaderboardState(1);
    const sorted = [...currentState].sort((a, b) => {
      const saetiA = Number(a.Saeti) || 999;
      const saetiB = Number(b.Saeti) || 999;
      return saetiA - saetiB;
    });

    log.server.endpoint(`/${requestedEventId}/forkeppni/sorted`, sorted.length);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.json(sorted);
  });

  app.get('/:eventId/forkeppni', (req, res) => {
    const requestedEventId = Number(req.params.eventId);
    const metadata = getCompetitionSpecificMetadata(1);

    if (isNaN(requestedEventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    if (metadata.eventId !== null && metadata.eventId !== requestedEventId) {
      return res.status(404).json({
        error: 'No Forkeppni data available for this event',
        requestedEventId,
        currentEventId: metadata.eventId,
      });
    }

    const currentState = getLeaderboardState(1);
    const sorted = [...currentState].sort((a, b) => {
      const nrA = Number(a.Nr) || 999;
      const nrB = Number(b.Nr) || 999;
      return nrA - nrB;
    });

    log.server.endpoint(`/${requestedEventId}/forkeppni`, sorted.length);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.json(sorted);
  });

  app.get('/:eventId/a/sorted', (req, res) => {
    const requestedEventId = Number(req.params.eventId);
    const metadata = getCompetitionSpecificMetadata(2);

    if (isNaN(requestedEventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    if (metadata.eventId !== null && metadata.eventId !== requestedEventId) {
      return res.status(404).json({
        error: 'No A-úrslit data available for this event',
        requestedEventId,
        currentEventId: metadata.eventId,
      });
    }

    const currentState = getLeaderboardState(2);
    const sorted = [...currentState].sort((a, b) => {
      const saetiA = Number(a.Saeti) || 999;
      const saetiB = Number(b.Saeti) || 999;
      return saetiA - saetiB;
    });

    log.server.endpoint(`/${requestedEventId}/a/sorted`, sorted.length);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.json(sorted);
  });

  app.get('/:eventId/a', (req, res) => {
    const requestedEventId = Number(req.params.eventId);
    const metadata = getCompetitionSpecificMetadata(2);

    if (isNaN(requestedEventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    if (metadata.eventId !== null && metadata.eventId !== requestedEventId) {
      return res.status(404).json({
        error: 'No A-úrslit data available for this event',
        requestedEventId,
        currentEventId: metadata.eventId,
      });
    }

    const currentState = getLeaderboardState(2);
    const sorted = [...currentState].sort((a, b) => {
      const nrA = Number(a.Nr) || 999;
      const nrB = Number(b.Nr) || 999;
      return nrA - nrB;
    });

    log.server.endpoint(`/${requestedEventId}/a`, sorted.length);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.json(sorted);
  });

  app.get('/:eventId/b/sorted', (req, res) => {
    const requestedEventId = Number(req.params.eventId);
    const metadata = getCompetitionSpecificMetadata(3);

    if (isNaN(requestedEventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    if (metadata.eventId !== null && metadata.eventId !== requestedEventId) {
      return res.status(404).json({
        error: 'No B-úrslit data available for this event',
        requestedEventId,
        currentEventId: metadata.eventId,
      });
    }

    const currentState = getLeaderboardState(3);
    const sorted = [...currentState].sort((a, b) => {
      const saetiA = Number(a.Saeti) || 999;
      const saetiB = Number(b.Saeti) || 999;
      return saetiA - saetiB;
    });

    log.server.endpoint(`/${requestedEventId}/b/sorted`, sorted.length);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.json(sorted);
  });

  app.get('/:eventId/b', (req, res) => {
    const requestedEventId = Number(req.params.eventId);
    const metadata = getCompetitionSpecificMetadata(3);

    if (isNaN(requestedEventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    if (metadata.eventId !== null && metadata.eventId !== requestedEventId) {
      return res.status(404).json({
        error: 'No B-úrslit data available for this event',
        requestedEventId,
        currentEventId: metadata.eventId,
      });
    }

    const currentState = getLeaderboardState(3);
    const sorted = [...currentState].sort((a, b) => {
      const nrA = Number(a.Nr) || 999;
      const nrB = Number(b.Nr) || 999;
      return nrA - nrB;
    });

    log.server.endpoint(`/${requestedEventId}/b`, sorted.length);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.json(sorted);
  });

  app.get('/current/:eventId', (req, res) => {
    const requestedEventId = Number(req.params.eventId);
    const metadata = getCompetitionMetadata();

    if (isNaN(requestedEventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    if (metadata.eventId !== null && metadata.eventId !== requestedEventId) {
      return res.status(404).json({
        error: 'No data available for this event',
        requestedEventId,
        currentEventId: metadata.eventId,
      });
    }

    const currentState = getCurrentState();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.json(currentState);
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
