try {
  require('dotenv').config();
} catch (err) {
  // ignore if dotenv unavailable; envs are provided in production
}
const { createDb } = require('../src/pgDb');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      'DATABASE_URL is required. Set it to your Supabase connection string (e.g., via .env) then rerun: node server/scripts/check-postgres.js'
    );
    process.exit(1);
  }

  try {
    const db = createDb(url);
    const ping = await db.prepare('select 1 as ok').get();
    if (!ping || ping.ok !== 1) {
      throw new Error('Connection check failed.');
    }

    const table = await db
      .prepare(
        "select table_name from information_schema.tables where table_schema='public' and table_name='job_applications'"
      )
      .get();

    if (!table) {
      console.error(
        "Tables not found. Run the SQL in Supabase SQL Editor:\n  node server/scripts/print-postgres-schema.js"
      );
      process.exit(1);
    }

    console.log('Postgres connection and schema look OK.');
    process.exit(0);
  } catch (err) {
    console.error('Postgres check failed:', err.message);
    process.exit(1);
  }
}

main();
