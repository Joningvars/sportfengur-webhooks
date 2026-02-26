import { ROSTER_CACHE_TTL_MS } from './config.js';
import { isDbConfigured, queryDb } from './db/client.js';

let lastLoadedAt = 0;
let loadingPromise = null;
const teamsByNormalizedName = new Map();
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
    const result = await queryDb(
      `
      SELECT c.display_name, t.name AS team_name
      FROM contestants c
      LEFT JOIN teams t ON t.id = c.team_id
      WHERE c.display_name IS NOT NULL AND c.display_name <> ''
      `,
    );

    const nextMap = new Map();
    for (const row of result.rows) {
      const key = normalizeName(row.display_name);
      if (!key) continue;
      if (!nextMap.has(key)) {
        nextMap.set(key, new Set());
      }
      if (row.team_name) {
        nextMap.get(key).add(String(row.team_name));
      }
    }

    teamsByNormalizedName.clear();
    for (const [key, teamSet] of nextMap.entries()) {
      teamsByNormalizedName.set(key, teamSet);
    }

    lastLoadedAt = Date.now();
  })();

  try {
    await loadingPromise;
  } finally {
    loadingPromise = null;
  }
}

function resolveTeamNameForRider(riderName) {
  const teamSet = teamsByNormalizedName.get(normalizeName(riderName));
  if (!teamSet || teamSet.size === 0) {
    return '';
  }

  const teams = [...teamSet].sort((a, b) => a.localeCompare(b));
  if (teams.length > 1 && !warnedAmbiguousNames.has(riderName)) {
    warnedAmbiguousNames.add(riderName);
    console.warn(
      `Ambiguous team match for rider "${riderName}". Using "${teams[0]}" from [${teams.join(', ')}].`,
    );
  }

  return teams[0] || '';
}

export async function enrichEntriesWithTeam(entries) {
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

  return entries.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      return entry;
    }

    const riderName = extractRiderName(entry);
    if (!riderName) {
      return entry;
    }

    const teamName = resolveTeamNameForRider(riderName);
    if (!teamName) {
      return entry;
    }

    return {
      ...entry,
      lid: teamName,
    };
  });
}
