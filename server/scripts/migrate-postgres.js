try {
  require('dotenv').config();
} catch (err) {
  // ignore if dotenv unavailable; envs are provided in production
}

const { createDb } = require('../src/pgDb');
const { pgMigrate, assertPgSchema } = require('../src/pgMigrate');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      'DATABASE_URL is required. Set it to your Supabase connection string (e.g., via .env) then rerun: node server/scripts/migrate-postgres.js'
    );
    process.exit(1);
  }

  const db = createDb(url);
  try {
    await pgMigrate(db, { log: true });
    await assertPgSchema(db);
    console.log('Postgres migrations complete.');
  } catch (err) {
    console.error('Postgres migration failed:', err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    try {
      await db.close();
    } catch (_) {
      // ignore
    }
  }
}

main();

