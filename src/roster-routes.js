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

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeContestantName(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return '';
  const withoutRole = trimmed.replace(/\s*-\s*liðsstjóri\s*$/i, '').trim();
  return withoutRole;
}

function isLikelyContestantName(name) {
  if (!name) return false;
  if (/\d/.test(name)) return false;
  if (name.includes('/')) return false;

  const words = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (words.length < 2) return false;
  return true;
}

function isIgnoredImportLine(line) {
  return /^meistaradeild\b/i.test(String(line || '').trim());
}

function normalizeTeamName(line) {
  return String(line || '').replace(/\s+/g, ' ').trim();
}

async function upsertTeam(name) {
  const normalizedName = normalizeTeamName(name);
  if (!normalizedName) return null;
  const slug = slugify(normalizedName);
  if (!slug) return null;

  const result = await queryDb(
    `
    INSERT INTO teams (name, slug)
    VALUES ($1, $2)
    ON CONFLICT (slug)
    DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
    RETURNING id, name, slug, updated_at
    `,
    [normalizedName, slug],
  );

  return result.rows[0] || null;
}

async function importContestantsFromText(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const inserted = [];
  const skippedLines = [];
  const teams = new Map();
  let currentTeamId = null;

  for (const rawLine of lines) {
    if (isIgnoredImportLine(rawLine)) {
      skipped += 1;
      skippedLines.push(rawLine);
      continue;
    }

    const displayName = normalizeContestantName(rawLine);
    if (!isLikelyContestantName(displayName)) {
      const team = await upsertTeam(rawLine);
      if (team) {
        currentTeamId = team.id;
        teams.set(team.slug, team);
      } else {
        skipped += 1;
        skippedLines.push(rawLine);
      }
      continue;
    }

    const existing = await queryDb(
      `
      SELECT id, team_id
      FROM contestants
      WHERE LOWER(display_name) = LOWER($1)
      ORDER BY id ASC
      `,
      [displayName],
    );

    if (existing.rowCount > 0) {
      const sameTeam = existing.rows.find((row) => {
        const teamId = row.team_id == null ? null : Number(row.team_id);
        const importTeamId = currentTeamId == null ? null : Number(currentTeamId);
        return teamId === importTeamId;
      });

      if (sameTeam) {
        skipped += 1;
        continue;
      }

      const unassigned = existing.rows.find((row) => row.team_id == null);
      if (unassigned && currentTeamId != null) {
        await queryDb(
          `
          UPDATE contestants
          SET team_id = $2, updated_at = NOW()
          WHERE id = $1
          `,
          [unassigned.id, currentTeamId],
        );
        updated += 1;
        continue;
      }
    }

    const insertedRow = await queryDb(
      `
      INSERT INTO contestants (display_name, team_id)
      VALUES ($1, $2)
      RETURNING id, display_name, team_id, created_at
      `,
      [displayName, currentTeamId],
    );
    created += 1;
    inserted.push(insertedRow.rows[0]);
  }

  return {
    totalLines: lines.length,
    teams: [...teams.values()],
    created,
    updated,
    skipped,
    inserted,
    skippedLines,
  };
}

async function upsertContestant(body) {
  const id = parseOptionalBigInt(body.id);
  const teamId = parseOptionalBigInt(body.teamId);
  const kennitala = parseOptionalText(body.kennitala);
  const displayName = parseOptionalText(body.displayName);
  const imageUrl = parseOptionalText(body.imageUrl);

  if (!displayName && !id) {
    return {
      status: 400,
      body: {
        error: 'displayName is required when creating a contestant',
      },
    };
  }

  const findQuery = id
    ? {
        text: 'SELECT id FROM contestants WHERE id = $1',
        values: [id],
      }
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
        team_id = COALESCE($5, team_id),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, kennitala, display_name, image_url, team_id, updated_at
      `,
      [contestantId, kennitala, displayName, imageUrl, teamId],
    );
    return { status: 200, body: updated.rows[0] };
  }

  const inserted = await queryDb(
    `
    INSERT INTO contestants (
      kennitala, display_name, image_url, team_id
    ) VALUES ($1, $2, $3, $4)
    RETURNING id, kennitala, display_name, image_url, team_id, created_at
    `,
    [kennitala, displayName, imageUrl, teamId],
  );

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
      return res.json({
        ok: true,
        configured: true,
        now: ping.rows[0]?.now || null,
      });
    } catch (error) {
      return res.status(503).json({
        ok: false,
        configured: true,
        message: error.message,
      });
    }
  });

  app.get('/control/teams', async (req, res) => {
    if (!requireControlSession(req, res, true)) return;

    try {
      const result = await queryDb(
        `
        SELECT id, name, slug, created_at, updated_at
        FROM teams
        ORDER BY name ASC
        `,
      );
      return res.json({ total: result.rowCount, items: result.rows });
    } catch (error) {
      return res
        .status(500)
        .json({ error: 'Failed to load teams', message: error.message });
    }
  });

  app.post('/control/teams', async (req, res) => {
    if (!requireControlSession(req, res, true)) return;

    const name = parseOptionalText(req.body?.name);
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    try {
      const team = await upsertTeam(name);
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

    try {
      const values = [];
      let where = '';
      if (search) {
        values.push(`%${search.toLowerCase()}%`);
        where = 'WHERE LOWER(c.display_name) LIKE $1';
      }

      const result = await queryDb(
        `
        SELECT
          c.id,
          c.kennitala,
          c.display_name,
          c.image_url,
          c.team_id,
          t.name AS team_name,
          c.updated_at
        FROM contestants c
        LEFT JOIN teams t ON t.id = c.team_id
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

    const text =
      parseOptionalText(req.body?.text) ||
      (Array.isArray(req.body?.lines) ? req.body.lines.join('\n') : null);

    if (!text) {
      return res.status(400).json({
        error: 'Missing import content',
        message: 'Provide text or lines in request body',
      });
    }

    try {
      const result = await importContestantsFromText(text);
      return res.json(result);
    } catch (error) {
      return res.status(500).json({
        error: 'Failed to import contestants',
        message: error.message,
      });
    }
  });
}
