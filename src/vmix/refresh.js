
import { fetchLeaderboard } from './vendor.js';
import { normalizeLeaderboard } from './normalizer.js';
import { updateState } from './state.js';
import { log } from '../logger.js';

const DEBOUNCE_MS = Number(process.env.VMIX_DEBOUNCE_MS || 200);
const REFRESH_TIMEOUT_MS = Number(process.env.VMIX_REFRESH_TIMEOUT_MS || 30000);

let refreshTimer = null;
let refreshInProgress = false;
let pendingRefreshTimestamp = null;

let competitionContext = {
  eventId: null,
  classId: null,
  competitionId: null,
};

export function setCompetitionContext(
  eventId,
  classId,
  competitionId,
  forceRefresh = false,
) {
  competitionContext = { eventId, classId, competitionId, forceRefresh };
}

export function scheduleRefresh() {
  pendingRefreshTimestamp = Date.now();

  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }

  refreshTimer = setTimeout(() => {
    executeRefresh();
  }, DEBOUNCE_MS);
}

export function isRefreshInProgress() {
  return refreshInProgress;
}

export function _resetRefreshState() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }
  refreshTimer = null;
  refreshInProgress = false;
  pendingRefreshTimestamp = null;
}

async function executeRefresh() {
  if (refreshInProgress) {
    log.vmix.skipped();
    return;
  }

  refreshInProgress = true;
  refreshTimer = null;

  try {
    const { eventId, classId, competitionId } = competitionContext;

    if (!classId || !competitionId) {
      log.vmix.noContext();
      return;
    }

    log.vmix.starting(eventId, classId, competitionId);

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error('Refresh timeout')),
        REFRESH_TIMEOUT_MS,
      );
    });

    await Promise.race([refreshWithTimeout(), timeoutPromise]);

    log.vmix.updated();
  } catch (error) {
    log.error('vMix refresh', error);
  } finally {
    refreshInProgress = false;

    const timeSinceLastSchedule = pendingRefreshTimestamp
      ? Date.now() - pendingRefreshTimestamp
      : Infinity;

    if (timeSinceLastSchedule >= DEBOUNCE_MS) {
      pendingRefreshTimestamp = null;
    }
  }
}

async function refreshWithTimeout() {
  const { eventId, classId, competitionId, forceRefresh } = competitionContext;

  log.vmix.fetching(classId, competitionId, forceRefresh);

  const leaderboardData = await fetchLeaderboard(
    eventId,
    classId,
    competitionId,
    forceRefresh,
  );

  const normalizedLeaderboard = normalizeLeaderboard(leaderboardData);

  log.vmix.normalized(normalizedLeaderboard.length);

  updateState(normalizedLeaderboard, eventId, classId, competitionId);
}
