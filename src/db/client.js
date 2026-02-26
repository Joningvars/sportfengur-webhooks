import {
  DATABASE_POOL_MAX,
  DATABASE_SSL,
  DATABASE_URL,
} from '../config.js';

let poolPromise = null;

function assertConfigured() {
  if (!DATABASE_URL) {
    const error = new Error('Database is not configured (DATABASE_URL is missing).');
    error.code = 'DB_NOT_CONFIGURED';
    throw error;
  }
}

export async function getDbPool() {
  assertConfigured();

  if (!poolPromise) {
    poolPromise = (async () => {
      const { Pool } = await import('pg');
      const pool = new Pool({
        connectionString: DATABASE_URL,
        max: DATABASE_POOL_MAX,
        ssl: DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
      });
      return pool;
    })();
  }

  return poolPromise;
}

export async function queryDb(text, params = []) {
  const pool = await getDbPool();
  return pool.query(text, params);
}

export function isDbConfigured() {
  return Boolean(DATABASE_URL);
}
