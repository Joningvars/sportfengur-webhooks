/**
 * Data Server for vMix Integration
 *
 * Registers HTTP endpoints that serve in-memory competition state.
 * Endpoints return JSON and CSV formats with appropriate headers.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 8.2, 8.3, 9.3
 */

import { getCurrentState, getLeaderboardState } from './state.js';
import { leaderboardToCsv } from './normalizer.js';
import { apiGetWithRetry } from '../sportfengur.js';
import { SPORTFENGUR_LOCALE } from '../config.js';

/**
 * Register vMix data endpoints on Express app
 * @param {Express} app - Express application instance
 */
export function registerVmixRoutes(app) {
  // GET /data/current.json - Returns all players as JSON array
  app.get('/data/current.json', (req, res) => {
    const currentState = getCurrentState();

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.json(currentState);
  });

  // GET /data/leaderboard.csv - Returns leaderboard as CSV
  app.get('/data/leaderboard.csv', (req, res) => {
    const leaderboardState = getLeaderboardState();
    const csv = leaderboardToCsv(leaderboardState);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/csv');
    res.send(csv);
  });

  // GET /data/event/:eventId/tests - Returns tests/competitions for an event
  app.get('/data/event/:eventId/tests', async (req, res) => {
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

  // GET /data/events/search - Search for events from Sportfengur
  app.get('/data/events/search', async (req, res) => {
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
