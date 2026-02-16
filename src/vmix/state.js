/**
 * State Manager for vMix Data Server
 *
 * Maintains in-memory competition state with atomic update operations.
 * State is immutable from outside - getters return current state,
 * updates replace entire objects atomically.
 */

let state = {
  leaderboard: [],
};

/**
 * Initialize state to empty values
 * Called on application startup
 */
export function initializeState() {
  state = {
    leaderboard: [],
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
 * Update state atomically
 * Replaces entire state array in a single operation
 * @param {array} newLeaderboard - New leaderboard state
 */
export function updateState(newLeaderboard) {
  state = {
    leaderboard: newLeaderboard,
  };
}
