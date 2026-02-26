import { requireControlSession } from './control-auth.js';
import { getDbPool, isDbConfigured, queryDb } from './db/client.js';

function parseOptionalBigInt(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseOptionalText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function parseEventIds(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    const parsed = parseOptionalBigInt(item);
    if (parsed) out.push(parsed);
  }
  return [...new Set(out)];
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeLeagueKey(value) {
  return slugify(value);
}

function normalizeContestantName(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/\s*-\s*liðsstjóri\s*$/i, '').trim();
}

function isLikelyContestantName(name) {
  if (!name) return false;
  if (/\d/.test(name)) return false;
  if (name.includes('/')) return false;
  return name.split(/\s+/).filter(Boolean).length >= 2;
}

function isIgnoredImportLine(line) {
  return /^meistaradeild\b/i.test(String(line || '').trim());
}

function isLikelyTeamHeader(line, nextLine = '') {
  const text = String(line || '').trim();
  if (!text) return false;

  if (isIgnoredImportLine(text)) return false;
  if (text.includes('/')) return true;
  if (/\d/.test(text)) return true;
  if (text.split(/\s+/).filter(Boolean).length === 1) return true;
  if (/\b(rider|team)\b/i.test(text)) return true;
  if (/\bliðsstjóri\b/i.test(String(nextLine || ''))) return true;

  return false;
}

async function upsertLeagueEvent(eventId, leagueKey) {
  if (!eventId || !leagueKey) return null;
  const result = await queryDb(
    `
    INSERT INTO league_events (event_id, league_key)
    VALUES ($1, $2)
    ON CONFLICT (event_id)
    DO UPDATE SET league_key = EXCLUDED.league_key, updated_at = NOW()
    RETURNING event_id, league_key, updated_at
    `,
    [eventId, leagueKey],
  );
  return result.rows[0] || null;
}

async function getLeagueKeyByEventId(eventId) {
  if (!eventId) return null;
  const result = await queryDb(
    'SELECT league_key FROM league_events WHERE event_id = $1 LIMIT 1',
    [eventId],
  );
  return result.rows[0]?.league_key || null;
}

async function resolveLeagueKey({ leagueKey, eventId }) {
  const normalized = normalizeLeagueKey(leagueKey);
  if (normalized) return normalized;

  const parsedEventId = parseOptionalBigInt(eventId);
  if (!parsedEventId) return null;

  const fromMap = await getLeagueKeyByEventId(parsedEventId);
  if (fromMap) return fromMap;

  return `event-${parsedEventId}`;
}

async function upsertLeagueTeam(name, leagueKey) {
  const normalizedName = String(name || '').replace(/\s+/g, ' ').trim();
  if (!normalizedName || !leagueKey) return null;

  const slug = slugify(normalizedName);
  if (!slug) return null;

  const result = await queryDb(
    `
    INSERT INTO league_teams (league_key, name, slug)
    VALUES ($1, $2, $3)
    ON CONFLICT (league_key, slug)
    DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
    RETURNING id, league_key, name, slug, updated_at
    `,
    [leagueKey, normalizedName, slug],
  );

  return result.rows[0] || null;
}

async function ensureContestant(displayName) {
  const existing = await queryDb(
    `
    SELECT id, display_name
    FROM contestants
    WHERE LOWER(display_name) = LOWER($1)
    ORDER BY id ASC
    LIMIT 1
    `,
    [displayName],
  );

  if (existing.rowCount > 0) {
    return { id: existing.rows[0].id, created: false };
  }

  const inserted = await queryDb(
    `
    INSERT INTO contestants (display_name)
    VALUES ($1)
    RETURNING id
    `,
    [displayName],
  );

  return { id: inserted.rows[0].id, created: true };
}

async function upsertLeagueMembership(contestantId, leagueKey, leagueTeamId) {
  const result = await queryDb(
    `
    INSERT INTO contestant_league_memberships (
      contestant_id, league_key, league_team_id
    ) VALUES ($1, $2, $3)
    ON CONFLICT (contestant_id, league_key)
    DO UPDATE SET league_team_id = EXCLUDED.league_team_id, updated_at = NOW()
    RETURNING id
    `,
    [contestantId, leagueKey, leagueTeamId],
  );
  return result.rows[0]?.id || null;
}

async function importContestantsFromText(text, leagueKey, eventIds = []) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let createdContestants = 0;
  let linkedMemberships = 0;
  let skipped = 0;
  const insertedContestants = [];
  const skippedLines = [];
  const teams = new Map();
  let currentLeagueTeamId = null;
  const seenContestantIds = new Set();

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const nextLine = lines[i + 1] || '';

    if (isIgnoredImportLine(rawLine)) {
      skipped += 1;
      skippedLines.push(rawLine);
      continue;
    }

    if (isLikelyTeamHeader(rawLine, nextLine)) {
      const team = await upsertLeagueTeam(rawLine, leagueKey);
      if (team) {
        currentLeagueTeamId = team.id;
        teams.set(team.slug, team);
      } else {
        skipped += 1;
        skippedLines.push(rawLine);
      }
      continue;
    }

    const displayName = normalizeContestantName(rawLine);
    if (!isLikelyContestantName(displayName)) {
      skipped += 1;
      skippedLines.push(rawLine);
      continue;
    }

    const contestant = await ensureContestant(displayName);
    seenContestantIds.add(contestant.id);
    if (contestant.created) {
      createdContestants += 1;
      insertedContestants.push({ id: contestant.id, display_name: displayName });
    }

    if (!currentLeagueTeamId) {
      skipped += 1;
      skippedLines.push(rawLine);
      continue;
    }

    await upsertLeagueMembership(contestant.id, leagueKey, currentLeagueTeamId);
    linkedMemberships += 1;
  }

  for (const eventId of eventIds) {
    await upsertLeagueEvent(eventId, leagueKey);
  }

  return {
    leagueKey,
    eventIds,
    totalLines: lines.length,
    teams: [...teams.values()],
    createdContestants,
    linkedMemberships,
    skipped,
    insertedContestants,
    skippedLines,
    seenContestantIds: [...seenContestantIds],
  };
}

async function upsertContestant(body) {
  const id = parseOptionalBigInt(body.id);
  const kennitala = parseOptionalText(body.kennitala);
  const displayName = parseOptionalText(body.displayName);
  const imageUrl = parseOptionalText(body.imageUrl);
  const leagueTeamId = parseOptionalBigInt(body.leagueTeamId);

  if (!displayName && !id) {
    return {
      status: 400,
      body: { error: 'displayName is required when creating a contestant' },
    };
  }

  const findQuery = id
    ? { text: 'SELECT id FROM contestants WHERE id = $1', values: [id] }
    : kennitala
      ? {
          text: 'SELECT id FROM contestants WHERE kennitala = $1',
          values: [kennitala],
        }
      : null;

  let contestantId = null;
  if (findQuery) {
    const found = await queryDb(findQuery.text, findQuery.values);
    contestantId = found.rows[0]?.id || null;
  }

  if (contestantId) {
    const updated = await queryDb(
      `
      UPDATE contestants
      SET
        kennitala = COALESCE($2, kennitala),
        display_name = COALESCE($3, display_name),
        image_url = $4,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, kennitala, display_name, image_url, updated_at
      `,
      [contestantId, kennitala, displayName, imageUrl],
    );

    if (leagueTeamId) {
      const team = await queryDb(
        'SELECT id, league_key FROM league_teams WHERE id = $1',
        [leagueTeamId],
      );
      if (team.rowCount > 0) {
        await upsertLeagueMembership(
          contestantId,
          team.rows[0].league_key,
          leagueTeamId,
        );
      }
    }

    return { status: 200, body: updated.rows[0] };
  }

  const inserted = await queryDb(
    `
    INSERT INTO contestants (kennitala, display_name, image_url)
    VALUES ($1, $2, $3)
    RETURNING id, kennitala, display_name, image_url, created_at
    `,
    [kennitala, displayName, imageUrl],
  );

  const newContestantId = inserted.rows[0].id;
  if (leagueTeamId) {
    const team = await queryDb('SELECT id, league_key FROM league_teams WHERE id = $1', [
      leagueTeamId,
    ]);
    if (team.rowCount > 0) {
      await upsertLeagueMembership(
        newContestantId,
        team.rows[0].league_key,
        leagueTeamId,
      );
    }
  }

  return { status: 201, body: inserted.rows[0] };
}

export function registerRosterRoutes(app) {
  app.get('/control/db/health', async (req, res) => {
    if (!requireControlSession(req, res, true)) return;

    if (!isDbConfigured()) {
      return res.status(503).json({
        ok: false,
        configured: false,
        message: 'DATABASE_URL is not configured',
      });
    }

    try {
      const pool = await getDbPool();
      const ping = await pool.query('SELECT NOW() AS now');
      return res.json({ ok: true, configured: true, now: ping.rows[0]?.now || null });
    } catch (error) {
      return res
        .status(503)
        .json({ ok: false, configured: true, message: error.message });
    }
  });

  app.get('/control/leagues/events', async (req, res) => {
    if (!requireControlSession(req, res, true)) return;

    const leagueKey = normalizeLeagueKey(req.query?.leagueKey);

    try {
      const values = [];
      let where = '';
      if (leagueKey) {
        values.push(leagueKey);
        where = 'WHERE league_key = $1';
      }

      const result = await queryDb(
        `
        SELECT event_id, league_key, updated_at
        FROM league_events
        ${where}
        ORDER BY event_id DESC
        `,
        values,
      );

      return res.json({ total: result.rowCount, items: result.rows });
    } catch (error) {
      return res.status(500).json({
        error: 'Failed to load league event mappings',
        message: error.message,
      });
    }
  });

  app.post('/control/leagues/events', async (req, res) => {
    if (!requireControlSession(req, res, true)) return;

    const leagueKey = normalizeLeagueKey(req.body?.leagueKey);
    const eventIds = parseEventIds(req.body?.eventIds);
    const singleEventId = parseOptionalBigInt(req.body?.eventId);

    if (!leagueKey) {
      return res.status(400).json({ error: 'leagueKey is required' });
    }

    const allEventIds = [...eventIds];
    if (singleEventId && !allEventIds.includes(singleEventId)) {
      allEventIds.push(singleEventId);
    }

    if (allEventIds.length === 0) {
      return res.status(400).json({ error: 'eventId or eventIds is required' });
    }

    try {
      const items = [];
      for (const eventId of allEventIds) {
        const item = await upsertLeagueEvent(eventId, leagueKey);
        if (item) items.push(item);
      }
      return res.json({ leagueKey, total: items.length, items });
    } catch (error) {
      return res.status(500).json({
        error: 'Failed to save league event mappings',
        message: error.message,
      });
    }
  });

  app.get('/control/teams', async (req, res) => {
    if (!requireControlSession(req, res, true)) return;

    const search = parseOptionalText(req.query?.q);
    const eventId = parseOptionalBigInt(req.query?.eventId);
    const explicitLeagueKey = normalizeLeagueKey(req.query?.leagueKey);

    try {
      const leagueKey = explicitLeagueKey || (await getLeagueKeyByEventId(eventId));
      const values = [];
      const where = [];

      if (search) {
        values.push(`%${search.toLowerCase()}%`);
        where.push(
          `(LOWER(name) LIKE $${values.length} OR LOWER(slug) LIKE $${values.length})`,
        );
      }
      if (leagueKey) {
        values.push(leagueKey);
        where.push(`league_key = $${values.length}`);
      }

      const result = await queryDb(
        `
        SELECT id, league_key, name, slug, created_at, updated_at
        FROM league_teams
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY name ASC
        `,
        values,
      );

      return res.json({ total: result.rowCount, items: result.rows, leagueKey: leagueKey || null });
    } catch (error) {
      return res
        .status(500)
        .json({ error: 'Failed to load teams', message: error.message });
    }
  });

  app.post('/control/teams', async (req, res) => {
    if (!requireControlSession(req, res, true)) return;

    const name = parseOptionalText(req.body?.name);
    const eventId = parseOptionalBigInt(req.body?.eventId);
    const leagueKey = await resolveLeagueKey({
      leagueKey: req.body?.leagueKey,
      eventId,
    });

    if (!name || !leagueKey) {
      return res
        .status(400)
        .json({ error: 'name and (leagueKey or eventId) are required' });
    }

    try {
      const team = await upsertLeagueTeam(name, leagueKey);
      if (eventId) {
        await upsertLeagueEvent(eventId, leagueKey);
      }
      return res.json(team);
    } catch (error) {
      return res
        .status(500)
        .json({ error: 'Failed to save team', message: error.message });
    }
  });

  app.get('/control/contestants', async (req, res) => {
    if (!requireControlSession(req, res, true)) return;

    const search = parseOptionalText(req.query?.q);
    const eventId = parseOptionalBigInt(req.query?.eventId);
    const explicitLeagueKey = normalizeLeagueKey(req.query?.leagueKey);

    try {
      const leagueKey = explicitLeagueKey || (await getLeagueKeyByEventId(eventId));

      if (leagueKey) {
        const values = [leagueKey];
        let where = 'WHERE m.league_key = $1';
        if (search) {
          values.push(`%${search.toLowerCase()}%`);
          where += ` AND LOWER(c.display_name) LIKE $${values.length}`;
        }

        const result = await queryDb(
          `
          SELECT
            c.id,
            c.kennitala,
            c.display_name,
            c.image_url,
            t.id AS league_team_id,
            t.name AS team_name,
            m.league_key,
            c.updated_at
          FROM contestants c
          JOIN contestant_league_memberships m ON m.contestant_id = c.id
          JOIN league_teams t ON t.id = m.league_team_id
          ${where}
          ORDER BY c.display_name ASC
          LIMIT 500
          `,
          values,
        );
        return res.json({
          total: result.rowCount,
          items: result.rows,
          leagueKey,
        });
      }

      const values = [];
      let where = '';
      if (search) {
        values.push(`%${search.toLowerCase()}%`);
        where = 'WHERE LOWER(c.display_name) LIKE $1';
      }

      const result = await queryDb(
        `
        SELECT c.id, c.kennitala, c.display_name, c.image_url, c.updated_at
        FROM contestants c
        ${where}
        ORDER BY c.display_name ASC
        LIMIT 500
        `,
        values,
      );

      return res.json({ total: result.rowCount, items: result.rows });
    } catch (error) {
      return res
        .status(500)
        .json({ error: 'Failed to load contestants', message: error.message });
    }
  });

  app.post('/control/contestants', async (req, res) => {
    if (!requireControlSession(req, res, true)) return;

    try {
      const outcome = await upsertContestant(req.body || {});
      return res.status(outcome.status).json(outcome.body);
    } catch (error) {
      return res
        .status(500)
        .json({ error: 'Failed to save contestant', message: error.message });
    }
  });

  app.post('/control/contestants/import', async (req, res) => {
    if (!requireControlSession(req, res, true)) return;

    const eventId = parseOptionalBigInt(req.body?.eventId);
    const eventIds = parseEventIds(req.body?.eventIds);
    if (eventId && !eventIds.includes(eventId)) {
      eventIds.push(eventId);
    }

    const leagueKey = await resolveLeagueKey({
      leagueKey: req.body?.leagueKey,
      eventId,
    });

    const text =
      parseOptionalText(req.body?.text) ||
      (Array.isArray(req.body?.lines) ? req.body.lines.join('\n') : null);

    if (!leagueKey) {
      return res.status(400).json({
        error: 'Missing league scope',
        message: 'Provide leagueKey or eventId in request body',
      });
    }

    if (!text) {
      return res.status(400).json({
        error: 'Missing import content',
        message: 'Provide text or lines in request body',
      });
    }

    try {
      const replaceExisting =
        req.body?.replaceExisting == null ? true : Boolean(req.body.replaceExisting);

      const result = await importContestantsFromText(text, leagueKey, eventIds);

      if (replaceExisting) {
        const ids = result.seenContestantIds || [];
        if (ids.length > 0) {
          await queryDb(
            `
            DELETE FROM contestant_league_memberships
            WHERE league_key = $1
              AND contestant_id <> ALL($2::bigint[])
            `,
            [leagueKey, ids],
          );
        } else {
          await queryDb(
            `
            DELETE FROM contestant_league_memberships
            WHERE league_key = $1
            `,
            [leagueKey],
          );
        }
      }

      const { seenContestantIds, ...response } = result;
      response.replaceExisting = replaceExisting;
      return res.json(response);
    } catch (error) {
      return res.status(500).json({
        error: 'Failed to import contestants',
        message: error.message,
      });
    }
  });
}
