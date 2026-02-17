
let state = {
  competitions: {
    1: { leaderboard: [], eventId: null, classId: null },
    2: { leaderboard: [], eventId: null, classId: null },
    3: { leaderboard: [], eventId: null, classId: null },
  },
  currentCompetitionId: null,
  currentEventId: null,
  currentClassId: null,
};

export function initializeState() {
  state = {
    competitions: {
      1: { leaderboard: [], eventId: null, classId: null },
      2: { leaderboard: [], eventId: null, classId: null },
      3: { leaderboard: [], eventId: null, classId: null },
    },
    currentCompetitionId: null,
    currentEventId: null,
    currentClassId: null,
  };
}

export function getCurrentState() {
  if (
    state.currentCompetitionId &&
    state.competitions[state.currentCompetitionId]
  ) {
    return state.competitions[state.currentCompetitionId].leaderboard;
  }
  return [];
}

export function getLeaderboardState(competitionId = null) {
  const compId = competitionId || state.currentCompetitionId;
  if (compId && state.competitions[compId]) {
    return state.competitions[compId].leaderboard;
  }
  return [];
}

export function getCompetitionMetadata() {
  return {
    eventId: state.currentEventId,
    classId: state.currentClassId,
    competitionId: state.currentCompetitionId,
  };
}

export function getCompetitionSpecificMetadata(competitionId) {
  if (state.competitions[competitionId]) {
    return {
      eventId: state.competitions[competitionId].eventId,
      classId: state.competitions[competitionId].classId,
      competitionId: competitionId,
    };
  }
  return {
    eventId: null,
    classId: null,
    competitionId: null,
  };
}

export function updateState(newLeaderboard, eventId, classId, competitionId) {
  if (state.competitions[competitionId]) {
    state.competitions[competitionId] = {
      leaderboard: newLeaderboard,
      eventId,
      classId,
    };
  }

  state.currentCompetitionId = competitionId;
  state.currentEventId = eventId;
  state.currentClassId = classId;
}
