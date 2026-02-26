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

  // Contestant names are expected to contain first + last name at minimum.
  if (words.length < 2) return false;
  return true;
}

async function importContestantsFromText(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let created = 0;
  let skipped = 0;
  const inserted = [];
  const skippedLines = [];

  for (const rawLine of lines) {
    const displayName = normalizeContestantName(rawLine);
    if (!isLikelyContestantName(displayName)) {
      skipped += 1;
      skippedLines.push(rawLine);
      continue;
    }

    const existing = await queryDb(
      'SELECT id FROM contestants WHERE LOWER(display_name) = LOWER($1) LIMIT 1',
      [displayName],
    );

    if (existing.rowCount > 0) {
      skipped += 1;
      continue;
    }

    const insertedRow = await queryDb(
      `
      INSERT INTO contestants (display_name)
      VALUES ($1)
      RETURNING id, display_name, created_at
      `,
      [displayName],
    );
    created += 1;
    inserted.push(insertedRow.rows[0]);
  }

  return {
    totalLines: lines.length,
    created,
    skipped,
    inserted,
    skippedLines,
  };
}

async function upsertContestant(body) {
  const id = parseOptionalBigInt(body.id);
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
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, kennitala, display_name, image_url, updated_at
      `,
      [
        contestantId,
        kennitala,
        displayName,
        imageUrl,
      ],
    );
    return { status: 200, body: updated.rows[0] };
  }

  const inserted = await queryDb(
    `
    INSERT INTO contestants (
      kennitala, display_name, image_url
    ) VALUES ($1, $2, $3)
    RETURNING id, kennitala, display_name, image_url, created_at
    `,
    [
      kennitala,
      displayName,
      imageUrl,
    ],
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
          c.updated_at
        FROM contestants c
        ${where}
        ORDER BY c.display_name ASC
        LIMIT 500
        `,
        values,
      );

      return res.json({ total: result.rowCount, items: result.rows });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to load contestants', message: error.message });
    }
  });

  app.post('/control/contestants', async (req, res) => {
    if (!requireControlSession(req, res, true)) return;

    try {
      const outcome = await upsertContestant(req.body || {});
      return res.status(outcome.status).json(outcome.body);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to save contestant', message: error.message });
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
