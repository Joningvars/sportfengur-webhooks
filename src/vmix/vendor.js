/**
 * Vendor API client wrapper for vMix integration
 * Reuses existing Sportfengur API client for data fetching
 */

import { apiGetWithRetry } from '../sportfengur.js';
import { SPORTFENGUR_LOCALE } from '../config.js';
import { log } from '../logger.js';

// Cache for starting list data
// Key: `${classId}-${competitionId}`
// Value: { data: [...], timestamp: Date.now() }
const startingListCache = new Map();

/**
 * Fetches current rider data from Sportfengur API
 * @param {number} eventId - Event identifier
 * @param {number} classId - Class identifier
 * @param {number} competitionId - Competition identifier
 * @returns {Promise<object>} Raw API response for current rider
 *
 * Validates: Requirements 4.1, 4.5
 */
export async function fetchCurrentRider(eventId, classId, competitionId) {
  const data = await apiGetWithRetry(
    `/${SPORTFENGUR_LOCALE}/test/results/${classId}/${competitionId}`,
  );

  // The API returns an array of results, find the most recent one
  // (highest rank or most recently updated)
  if (Array.isArray(data?.res) && data.res.length > 0) {
    // Sort by rank (saeti) and return the first entry (current leader/most recent)
    const sorted = [...data.res].sort((a, b) => {
      const rankA = Number(a.saeti || a.fmt_saeti) || 999;
      const rankB = Number(b.saeti || b.fmt_saeti) || 999;
      return rankA - rankB;
    });
    return sorted[0];
  }

  return {};
}

/**
 * Fetches starting list from Sportfengur API with caching
 * @param {number} classId - Class identifier
 * @param {number} competitionId - Competition identifier
 * @param {boolean} forceRefresh - If true, bypass cache and fetch fresh data
 * @returns {Promise<array>} Starting list array
 */
async function fetchStartingList(classId, competitionId, forceRefresh = false) {
  const cacheKey = `${classId}-${competitionId}`;

  // Check cache if not forcing refresh
  if (!forceRefresh && startingListCache.has(cacheKey)) {
    const cached = startingListCache.get(cacheKey);
    log.vmix.cached(cached.data.length);
    return cached.data;
  }

  // Fetch fresh data
  const startingListData = await apiGetWithRetry(
    `/${SPORTFENGUR_LOCALE}/startinglist/${classId}/${competitionId}`,
  );
  const startingList = Array.isArray(startingListData?.raslisti)
    ? startingListData.raslisti
    : [];

  // Update cache
  startingListCache.set(cacheKey, {
    data: startingList,
    timestamp: Date.now(),
  });

  return startingList;
}

/**
 * Fetches results/scores from Sportfengur API
 * @param {number} classId - Class identifier
 * @param {number} competitionId - Competition identifier
 * @returns {Promise<array>} Results array
 */
async function fetchResults(classId, competitionId) {
  const resultsData = await apiGetWithRetry(
    `/${SPORTFENGUR_LOCALE}/test/results/${classId}/${competitionId}`,
  );
  const scores = Array.isArray(resultsData?.einkunnir)
    ? resultsData.einkunnir
    : [];

  return scores;
}

/**
 * Invalidates the starting list cache for a specific competition
 * @param {number} classId - Class identifier
 * @param {number} competitionId - Competition identifier
 */
export function invalidateStartingListCache(classId, competitionId) {
  const cacheKey = `${classId}-${competitionId}`;
  if (startingListCache.has(cacheKey)) {
    startingListCache.delete(cacheKey);
    log.vmix.cacheInvalidated(cacheKey);
  }
}

/**
 * Fetches leaderboard data from Sportfengur API
 * @param {number} eventId - Event identifier
 * @param {number} classId - Class identifier
 * @param {number} competitionId - Competition identifier
 * @param {boolean} forceRefresh - If true, bypass cache and fetch fresh starting list
 * @returns {Promise<array>} Raw API response array for leaderboard
 *
 * Validates: Requirements 4.2, 4.5
 */
export async function fetchLeaderboard(
  eventId,
  classId,
  competitionId,
  forceRefresh = false,
) {
  try {
    // Fetch starting list (with caching)
    const startingList = await fetchStartingList(
      classId,
      competitionId,
      forceRefresh,
    );

    // Fetch results (always fresh)
    const scores = await fetchResults(classId, competitionId);

    log.vmix.fetched(startingList.length, scores.length);

    // Merge starting list with scores by keppandi_numer
    const scoresByKeppandi = new Map();
    for (const score of scores) {
      if (score.keppandi_numer != null) {
        scoresByKeppandi.set(score.keppandi_numer, score);
      }
    }

    // Combine data
    const combined = startingList.map((rider) => {
      const score = scoresByKeppandi.get(rider.keppandi_numer);
      return {
        ...rider,
        einkunnir_domara: score?.einkunnir_domara || [],
        keppandi_medaleinkunn: score?.keppandi_medaleinkunn,
        saeti: score?.saeti,
      };
    });

    return combined;
  } catch (error) {
    log.error('vMix vendor fetchLeaderboard', error);
    throw error;
  }
}
