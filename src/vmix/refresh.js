/**
 * Refresh Scheduler for vMix Data Server
 *
 * Manages debounced refresh operations with concurrency control.
 * Implements 200ms debounce window and refresh lock to prevent
 * concurrent API calls.
 */

import { fetchCurrentRider, fetchLeaderboard } from './vendor.js';
import { normalizeCurrent, normalizeLeaderboard } from './normalizer.js';
import { updateState } from './state.js';

// Configuration
const DEBOUNCE_MS = Number(process.env.VMIX_DEBOUNCE_MS || 200);
const REFRESH_TIMEOUT_MS = Number(process.env.VMIX_REFRESH_TIMEOUT_MS || 30000);

// Internal state
let refreshTimer = null;
let refreshInProgress = false;
let pendingRefreshTimestamp = null;

// Competition identifiers (will be set from webhook context)
let competitionContext = {
  eventId: null,
  classId: null,
  competitionId: null,
};

/**
 * Set competition context for refresh operations
 * Called by webhook handler to provide competition identifiers
 * @param {number} eventId - Event identifier
 * @param {number} classId - Class identifier
 * @param {number} competitionId - Competition identifier
 * @param {boolean} forceRefresh - If true, bypass cache and fetch fresh starting list
 */
export function setCompetitionContext(
  eventId,
  classId,
  competitionId,
  forceRefresh = false,
) {
  competitionContext = { eventId, classId, competitionId, forceRefresh };
}

/**
 * Schedule a data refresh with debounce
 * Multiple calls within debounce window collapse to single refresh
 *
 * Validates: Requirements 3.2, 3.3, 3.5
 */
export function scheduleRefresh() {
  // Update pending refresh timestamp
  pendingRefreshTimestamp = Date.now();

  // Clear existing timer
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }

  // Schedule new refresh after debounce window
  refreshTimer = setTimeout(() => {
    executeRefresh();
  }, DEBOUNCE_MS);
}

/**
 * Check if a refresh operation is currently in progress
 * @returns {boolean} True if refresh is in progress
 *
 * Validates: Requirements 6.1
 */
export function isRefreshInProgress() {
  return refreshInProgress;
}

/**
 * Reset refresh state (for testing purposes)
 * @private
 */
export function _resetRefreshState() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }
  refreshTimer = null;
  refreshInProgress = false;
  pendingRefreshTimestamp = null;
}

/**
 * Execute the refresh operation
 * Fetches data from vendor API, normalizes, and updates state atomically
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 6.1, 6.2, 6.3, 9.2
 */
async function executeRefresh() {
  // Check refresh lock
  if (refreshInProgress) {
    // Another refresh is in progress, skip this one (deduplication)
    console.log('[vMix Refresh] Skipping - refresh already in progress');
    return;
  }

  // Acquire refresh lock
  refreshInProgress = true;
  refreshTimer = null;

  try {
    const { eventId, classId, competitionId } = competitionContext;

    // Validate competition context
    if (!classId || !competitionId) {
      console.warn(
        '[vMix Refresh] Competition context not set, skipping refresh',
      );
      return;
    }

    console.log(
      `[vMix Refresh] Starting refresh for event=${eventId} class=${classId} competition=${competitionId}`,
    );

    // Set timeout for refresh operation
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error('Refresh timeout')),
        REFRESH_TIMEOUT_MS,
      );
    });

    // Execute refresh with timeout
    await Promise.race([refreshWithTimeout(), timeoutPromise]);

    console.log('[vMix Refresh] Refresh completed successfully');
  } catch (error) {
    // Log error and preserve existing state
    const timestamp = new Date().toISOString();
    console.error('[vMix Refresh] Refresh failed:', {
      timestamp,
      operation: 'refresh',
      error: error.message,
      details: {
        context: competitionContext,
        stack: error.stack,
      },
    });
  } finally {
    // Release refresh lock
    refreshInProgress = false;

    // Clear pending timestamp if no new refresh was scheduled
    const timeSinceLastSchedule = pendingRefreshTimestamp
      ? Date.now() - pendingRefreshTimestamp
      : Infinity;

    if (timeSinceLastSchedule >= DEBOUNCE_MS) {
      // No new refresh was scheduled during execution
      pendingRefreshTimestamp = null;
    }
  }
}

/**
 * Internal refresh logic with API calls and state update
 */
async function refreshWithTimeout() {
  const { eventId, classId, competitionId, forceRefresh } = competitionContext;

  console.log(
    `[vMix Refresh] Fetching leaderboard from API: class=${classId} competition=${competitionId}${forceRefresh ? ' (force refresh)' : ''}`,
  );

  // Fetch leaderboard data from vendor API
  const leaderboardData = await fetchLeaderboard(
    eventId,
    classId,
    competitionId,
    forceRefresh,
  );

  console.log(
    `[vMix Refresh] Received ${Array.isArray(leaderboardData) ? leaderboardData.length : 0} entries from API`,
  );

  // Normalize data
  const normalizedLeaderboard = normalizeLeaderboard(leaderboardData);

  console.log(
    `[vMix Refresh] Normalized to ${normalizedLeaderboard.length} entries`,
  );

  // Update state atomically with metadata
  updateState(normalizedLeaderboard, eventId, classId, competitionId);

  console.log('[vMix Refresh] State updated');
}
