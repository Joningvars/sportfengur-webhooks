import './load-env.js';
import { runMigrations } from '../src/db/migrate.js';

async function main() {
  await runMigrations();
  console.log('Database migrations completed successfully.');
}

main().catch((error) => {
  console.error('Database migrations failed:', error.message);
  process.exit(1);
});
