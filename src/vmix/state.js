/**
 * State Manager for vMix Data Server
 *
 * Maintains in-memory competition state with atomic update operations.
 * State is immutable from outside - getters return current state,
 * updates replace entire objects atomically.
 */

let state = {
  leaderboard: [],
  eventId: null,
  classId: null,
  competitionId: null,
};

/**
 * Initialize state to empty values
 * Called on application startup
 */
export function initializeState() {
  state = {
    leaderboard: [],
    eventId: null,
    classId: null,
    competitionId: null,
  };
}

/**
 * Get current leaderboard state (all players)
 * @returns {array} All leaderboard entries
 */
export function getCurrentState() {
  return state.leaderboard;
}

/**
 * Get leaderboard state
 * @returns {array} Leaderboard entries
 */
export function getLeaderboardState() {
  return state.leaderboard;
}

/**
 * Get current competition metadata
 * @returns {object} Object with eventId, classId, competitionId
 */
export function getCompetitionMetadata() {
  return {
    eventId: state.eventId,
    classId: state.classId,
    competitionId: state.competitionId,
  };
}

/**
 * Update state atomically
 * Replaces entire state array in a single operation
 * @param {array} newLeaderboard - New leaderboard state
 * @param {number} eventId - Event identifier
 * @param {number} classId - Class identifier
 * @param {number} competitionId - Competition identifier
 */
export function updateState(newLeaderboard, eventId, classId, competitionId) {
  state = {
    leaderboard: newLeaderboard,
    eventId,
    classId,
    competitionId,
  };
}
