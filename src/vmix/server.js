/**
 * Data Server for vMix Integration
 *
 * Registers HTTP endpoints that serve in-memory competition state.
 * Endpoints return JSON and CSV formats with appropriate headers.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 8.2, 8.3, 9.3
 */

import {
  getCurrentState,
  getLeaderboardState,
  getCompetitionMetadata,
} from './state.js';
import { leaderboardToCsv } from './normalizer.js';
import { apiGetWithRetry } from '../sportfengur.js';
import { SPORTFENGUR_LOCALE } from '../config.js';

/**
 * Extract gangtegund results from current state
 * @param {array} currentState - Current leaderboard state
 * @returns {array} Array of gangtegund results
 */
function extractGangtegundResults(currentState) {
  // Group results by gangtegund
  const gangtegundTypes = {};

  currentState.forEach((rider) => {
    // Iterate through all properties to find gangtegund scores
    for (const [key, value] of Object.entries(rider)) {
      // Skip base rider info and adal
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
        // This is a gangtegund
        if (!gangtegundTypes[key]) {
          gangtegundTypes[key] = {
            gangtegundKey: key,
            title: value._title || key,
            einkunnir: [],
          };
        }

        // Add this rider's scores for this gangtegund
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

  // Convert to array
  return Object.values(gangtegundTypes);
}

/**
 * Register vMix data endpoints on Express app
 * @param {Express} app - Express application instance
 */
export function registerVmixRoutes(app) {
  // GET /current - Returns all current data (no event filter)
  app.get('/current', (req, res) => {
    const currentState = getCurrentState();

    console.log(
      '[vMix Server] /current called, returning',
      currentState.length,
      'entries',
    );

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.json(currentState);
  });

  // GET /current/:eventId/results/a - Returns gangtegund results for A-úrslit (competitionId 2)
  app.get('/current/:eventId/results/a', (req, res) => {
    const requestedEventId = Number(req.params.eventId);
    const metadata = getCompetitionMetadata();

    if (isNaN(requestedEventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    // Check if current event matches requested event
    if (metadata.eventId !== requestedEventId) {
      return res.status(404).json({
        error: 'No data available for this event',
        requestedEventId,
        currentEventId: metadata.eventId,
      });
    }

    // Check if current competition is A-úrslit (competitionId 2)
    if (metadata.competitionId !== 2) {
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

  // GET /current/:eventId/results/b - Returns gangtegund results for B-úrslit (competitionId 3)
  app.get('/current/:eventId/results/b', (req, res) => {
    const requestedEventId = Number(req.params.eventId);
    const metadata = getCompetitionMetadata();

    if (isNaN(requestedEventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    // Check if current event matches requested event
    if (metadata.eventId !== requestedEventId) {
      return res.status(404).json({
        error: 'No data available for this event',
        requestedEventId,
        currentEventId: metadata.eventId,
      });
    }

    // Check if current competition is B-úrslit (competitionId 3)
    if (metadata.competitionId !== 3) {
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

  // GET /current/:eventId - Returns players only if eventId matches
  app.get('/current/:eventId', (req, res) => {
    const requestedEventId = Number(req.params.eventId);
    const metadata = getCompetitionMetadata();

    if (isNaN(requestedEventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    // Check if the current state matches the requested eventId
    if (metadata.eventId !== requestedEventId) {
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

  // GET /leaderboard.csv - Returns leaderboard as CSV
  app.get('/leaderboard.csv', (req, res) => {
    const leaderboardState = getLeaderboardState();
    const csv = leaderboardToCsv(leaderboardState);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/csv');
    res.send(csv);
  });

  // GET /event/:eventId/participants - Returns participants for an event
  app.get('/event/:eventId/participants', async (req, res) => {
    try {
      const eventId = req.params.eventId;

      if (!eventId || isNaN(eventId)) {
        return res.status(400).json({ error: 'Invalid event ID' });
      }

      const data = await apiGetWithRetry(
        `/${SPORTFENGUR_LOCALE}/participants/${eventId}`,
      );

      res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
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

  // GET /event/:eventId/tests - Returns tests/competitions for an event
  app.get('/event/:eventId/tests', async (req, res) => {
    try {
      const eventId = req.params.eventId;

      if (!eventId || isNaN(eventId)) {
        return res.status(400).json({ error: 'Invalid event ID' });
      }

      const data = await apiGetWithRetry(
        `/${SPORTFENGUR_LOCALE}/event/tests/${eventId}`,
      );

      res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
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

  // GET /events/search - Search for events from Sportfengur
  app.get('/events/search', async (req, res) => {
    try {
      // Build query string from request parameters
      const queryParams = new URLSearchParams();

      // Add all supported query parameters if they exist
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

      res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
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
