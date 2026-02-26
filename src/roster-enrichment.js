import { ROSTER_CACHE_TTL_MS } from './config.js';
import { isDbConfigured, queryDb } from './db/client.js';

let lastLoadedAt = 0;
let loadingPromise = null;
const leagueByEventId = new Map();
const teamsByLeagueAndName = new Map();
const warnedAmbiguousNames = new Set();

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function extractRiderName(entry) {
  return String(
    entry?.knapi_fullt_nafn ||
      entry?.knapi_fulltnafn ||
      entry?.knapi_nafn ||
      entry?.Knapi ||
      '',
  ).trim();
}

function riderKey(leagueKey, riderName) {
  return `${leagueKey}:${normalizeName(riderName)}`;
}

async function loadRosterCache(force = false) {
  if (!isDbConfigured()) {
    return;
  }

  const now = Date.now();
  if (!force && now - lastLoadedAt < ROSTER_CACHE_TTL_MS) {
    return;
  }

  if (loadingPromise) {
    await loadingPromise;
    return;
  }

  loadingPromise = (async () => {
    const [leagues, memberships] = await Promise.all([
      queryDb(
        `
        SELECT event_id, league_key
        FROM league_events
        `,
      ),
      queryDb(
        `
        SELECT m.league_key, c.display_name, t.name AS team_name
        FROM contestant_league_memberships m
        JOIN contestants c ON c.id = m.contestant_id
        JOIN league_teams t ON t.id = m.league_team_id
        WHERE c.display_name IS NOT NULL AND c.display_name <> ''
        `,
      ),
    ]);

    leagueByEventId.clear();
    for (const row of leagues.rows) {
      const eventId = Number.parseInt(String(row.event_id), 10);
      if (Number.isInteger(eventId) && eventId > 0 && row.league_key) {
        leagueByEventId.set(eventId, String(row.league_key));
      }
    }

    const nextMap = new Map();
    for (const row of memberships.rows) {
      if (!row.league_key || !row.display_name) continue;
      const key = riderKey(row.league_key, row.display_name);
      if (!nextMap.has(key)) {
        nextMap.set(key, new Set());
      }
      if (row.team_name) {
        nextMap.get(key).add(String(row.team_name));
      }
    }

    teamsByLeagueAndName.clear();
    for (const [key, teamSet] of nextMap.entries()) {
      teamsByLeagueAndName.set(key, teamSet);
    }

    lastLoadedAt = Date.now();
  })();

  try {
    await loadingPromise;
  } finally {
    loadingPromise = null;
  }
}

function resolveLeagueKeyForEvent(eventId) {
  const parsedEventId = Number.parseInt(String(eventId), 10);
  if (!Number.isInteger(parsedEventId) || parsedEventId <= 0) {
    return null;
  }

  return leagueByEventId.get(parsedEventId) || `event-${parsedEventId}`;
}

function resolveTeamNameForRider(leagueKey, riderName) {
  const teamSet = teamsByLeagueAndName.get(riderKey(leagueKey, riderName));
  if (!teamSet || teamSet.size === 0) {
    return '';
  }

  const teams = [...teamSet].filter(Boolean).sort((a, b) => a.localeCompare(b));
  if (teams.length === 0) return '';

  if (teams.length > 1) {
    const key = `${leagueKey}:${riderName}`;
    if (!warnedAmbiguousNames.has(key)) {
      warnedAmbiguousNames.add(key);
      console.warn(
        `Ambiguous team match for rider "${riderName}" in league ${leagueKey}. Using "${teams[0]}" from [${teams.join(', ')}].`,
      );
    }
  }

  return teams[0] || '';
}

export async function enrichEntriesWithTeam(entries, eventId) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return entries;
  }

  if (!isDbConfigured()) {
    return entries;
  }

  try {
    await loadRosterCache(false);
  } catch (error) {
    console.warn(`Failed to load roster cache: ${error.message}`);
    return entries;
  }

  const leagueKey = resolveLeagueKeyForEvent(eventId);
  if (!leagueKey) {
    return entries;
  }

  return entries.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      return entry;
    }

    const riderName = extractRiderName(entry);
    if (!riderName) {
      return entry;
    }

    const teamName = resolveTeamNameForRider(leagueKey, riderName);
    if (!teamName) {
      return entry;
    }

    return {
      ...entry,
      lid: teamName,
    };
  });
}
