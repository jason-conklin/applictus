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
        "Tables not found. Run migrations:\n  node server/scripts/migrate-postgres.js\n\nIf you need the base schema for inspection:\n  node server/scripts/print-postgres-schema.js"
      );
      process.exit(1);
    }

    const jobAppsCompanyCols = await db
      .prepare(
        "select column_name from information_schema.columns where table_schema='public' and table_name='job_applications' and column_name in ('company_source','company_confidence','company_explanation')"
      )
      .all();
    const jobAppsPresent = new Set((jobAppsCompanyCols || []).map((row) => row.column_name));
    const jobAppsMissing = ['company_source', 'company_confidence', 'company_explanation'].filter(
      (name) => !jobAppsPresent.has(name)
    );

    if (jobAppsMissing.length) {
      console.error(
        [
          'job_applications is missing required company metadata columns:',
          `  job_applications.${jobAppsMissing.join(', job_applications.')}`,
          'This will crash matching/ingest on Postgres.',
          '',
          'Run migrations:',
          '  node server/scripts/migrate-postgres.js',
          '',
          'Expected migration:',
          '  server/migrations/021_job_applications_company_fields_postgres.sql'
        ].join('\n')
      );
      process.exit(1);
    }

    const jobAppsBoolCols = await db
      .prepare(
        "select column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name='job_applications' and column_name in ('archived','user_override')"
      )
      .all();
    const boolMeta = new Map((jobAppsBoolCols || []).map((row) => [row.column_name, row]));
    const boolMissing = ['archived', 'user_override'].filter((name) => !boolMeta.has(name));
    const boolWrongType = ['archived', 'user_override'].filter((name) => {
      const row = boolMeta.get(name);
      return row && row.data_type !== 'boolean';
    });
    const boolNullable = ['archived', 'user_override'].filter((name) => {
      const row = boolMeta.get(name);
      return row && row.is_nullable === 'YES';
    });

    if (boolMissing.length || boolWrongType.length || boolNullable.length) {
      console.error(
        [
          'job_applications boolean columns are not in the expected state.',
          ...(boolMissing.length ? [`Missing: job_applications.${boolMissing.join(', job_applications.')}`] : []),
          ...(boolWrongType.length ? [`Wrong type: job_applications.${boolWrongType.join(', job_applications.')}`] : []),
          ...(boolNullable.length ? [`Nullable: job_applications.${boolNullable.join(', job_applications.')}`] : []),
          '',
          'Run migrations:',
          '  node server/scripts/migrate-postgres.js',
          '',
          'Expected migration:',
          '  server/migrations/022_job_applications_boolean_columns_postgres.sql'
        ].join('\n')
      );
      process.exit(1);
    }

    const emailEventsCol = await db
      .prepare(
        "select 1 as ok from information_schema.columns where table_schema='public' and table_name='email_events' and column_name='provider_message_id'"
      )
      .get();

    if (!emailEventsCol) {
      console.error(
        [
          'email_events.provider_message_id is missing.',
          'This will crash Gmail sync/dedupe on Postgres.',
          '',
          'Run migrations:',
          '  node server/scripts/migrate-postgres.js',
          '',
          'Expected migration:',
          '  server/migrations/018_email_events_provider_message_id_postgres.sql'
        ].join('\n')
      );
      process.exit(1);
    }

    const emailEventTimestamps = await db
      .prepare(
        "select column_name, is_nullable from information_schema.columns where table_schema='public' and table_name='email_events' and column_name in ('created_at','updated_at')"
      )
      .all();
    const present = new Map((emailEventTimestamps || []).map((row) => [row.column_name, row.is_nullable]));
    const missingTs = ['created_at', 'updated_at'].filter((name) => !present.has(name));
    const nullableTs = ['created_at', 'updated_at'].filter((name) => present.get(name) === 'YES');
    if (missingTs.length || nullableTs.length) {
      console.error(
        [
          'email_events timestamp columns are not in the expected state.',
          ...(missingTs.length ? [`Missing: email_events.${missingTs.join(', email_events.')}`] : []),
          ...(nullableTs.length ? [`Nullable: email_events.${nullableTs.join(', email_events.')}`] : []),
          '',
          'Run migrations:',
          '  node server/scripts/migrate-postgres.js',
          '',
          'Expected migration:',
          '  server/migrations/020_email_events_timestamp_defaults_postgres.sql'
        ].join('\n')
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
