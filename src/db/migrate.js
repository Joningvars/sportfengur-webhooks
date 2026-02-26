import { queryDb } from './client.js';

const migrations = [
  {
    name: '001_create_roster_tables',
    sql: `
      CREATE TABLE IF NOT EXISTS contestants (
        id BIGSERIAL PRIMARY KEY,
        kennitala TEXT,
        display_name TEXT NOT NULL,
        image_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS contestants_kennitala_unique
        ON contestants (kennitala)
        WHERE kennitala IS NOT NULL;

      CREATE INDEX IF NOT EXISTS contestants_display_name_lower_idx
        ON contestants (LOWER(display_name));
    `,
  },
  {
    name: '002_simplify_contestants_schema',
    sql: `
      DROP INDEX IF EXISTS contestants_person_id_unique;

      ALTER TABLE contestants
        DROP COLUMN IF EXISTS sportfengur_person_id,
        DROP COLUMN IF EXISTS team_id,
        DROP COLUMN IF EXISTS image_cutout_url,
        DROP COLUMN IF EXISTS is_active;

      DROP TABLE IF EXISTS contestant_aliases;
      DROP TABLE IF EXISTS teams;
    `,
  },
];

export async function runMigrations() {
  await queryDb(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  for (const migration of migrations) {
    const exists = await queryDb(
      'SELECT 1 FROM schema_migrations WHERE name = $1',
      [migration.name],
    );

    if (exists.rowCount > 0) {
      continue;
    }

    await queryDb('BEGIN');
    try {
      await queryDb(migration.sql);
      await queryDb(
        'INSERT INTO schema_migrations (name, applied_at) VALUES ($1, NOW())',
        [migration.name],
      );
      await queryDb('COMMIT');
    } catch (error) {
      await queryDb('ROLLBACK');
      throw error;
    }
  }
}
