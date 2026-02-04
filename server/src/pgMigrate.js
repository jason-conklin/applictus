const fs = require('fs');
const path = require('path');

function listPostgresMigrationFiles() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('_postgres.sql'))
    .sort()
    .map((file) => ({ name: file, fullPath: path.join(migrationsDir, file) }));
}

async function ensureSchemaMigrationsTable(db) {
  await db
    .prepare(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL)'
    )
    .run();
}

async function pgMigrate(db, { log = true } = {}) {
  if (!db || typeof db.prepare !== 'function' || typeof db.transaction !== 'function') {
    throw new Error('pgMigrate requires a Postgres db adapter with prepare() and transaction().');
  }

  await ensureSchemaMigrationsTable(db);

  const appliedRows = await db.prepare('SELECT name FROM schema_migrations ORDER BY name').all();
  const applied = new Set((appliedRows || []).map((row) => row.name));
  const files = listPostgresMigrationFiles();

  for (const file of files) {
    if (applied.has(file.name)) {
      continue;
    }
    const sql = fs.readFileSync(file.fullPath, 'utf8');
    if (!sql.trim()) {
      continue;
    }
    await db.transaction(async (tx) => {
      await tx.prepare(sql).run();
      await tx
        .prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)')
        .run(file.name, new Date().toISOString());
    });
    if (log) {
      // eslint-disable-next-line no-console
      console.log(`[pgMigrate] applied ${file.name}`);
    }
  }
}

async function assertPgSchema(db) {
  if (process.env.SKIP_SCHEMA_CHECK === '1') {
    return;
  }
  const requiredOauthColumns = [
    'access_token_enc',
    'refresh_token_enc',
    'connected_email',
    'created_at',
    'updated_at'
  ];
  const cols = await db
    .prepare(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name='oauth_tokens'`
    )
    .all();
  const present = new Map((cols || []).map((row) => [row.column_name, row.data_type]));
  const missing = requiredOauthColumns.filter((name) => !present.has(name));

  const expiryType = present.get('expiry_date');
  const expiryOk = !expiryType || expiryType === 'bigint' || expiryType === 'integer';

  if (!expiryOk) {
    missing.push('expiry_date(bigint)');
  }

  if (missing.length) {
    const message = [
      'Postgres schema is missing required columns for Gmail OAuth token storage:',
      `  oauth_tokens.${missing.join(', oauth_tokens.')}`,
      'Run migrations (or ensure startup migrations run). The migration that adds these is:',
      '  server/migrations/017_oauth_tokens_enc_postgres.sql',
      'Set SKIP_SCHEMA_CHECK=1 to bypass this check (not recommended).'
    ].join('\n');

    // eslint-disable-next-line no-console
    console.error(message);

    if (process.env.NODE_ENV === 'production') {
      const err = new Error(message);
      err.code = 'PG_SCHEMA_INVALID';
      throw err;
    }
  }

  const emailEventsProviderId = await db
    .prepare(
      `SELECT 1 as ok
       FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name='email_events'
         AND column_name='provider_message_id'`
    )
    .get();

  if (!emailEventsProviderId) {
    const message = [
      'Postgres schema is missing required email_events columns for sync/dedupe:',
      '  email_events.provider_message_id',
      'Run migrations (or ensure startup migrations run). The migration that adds this is:',
      '  server/migrations/018_email_events_provider_message_id_postgres.sql',
      'Set SKIP_SCHEMA_CHECK=1 to bypass this check (not recommended).'
    ].join('\n');

    // eslint-disable-next-line no-console
    console.error(message);

    if (process.env.NODE_ENV === 'production') {
      const err = new Error(message);
      err.code = 'PG_SCHEMA_INVALID';
      throw err;
    }
  }

  const emailEventsTimestampCols = await db
    .prepare(
      `SELECT column_name, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name='email_events'
         AND column_name IN ('created_at', 'updated_at')`
    )
    .all();
  const tsPresent = new Map(
    (emailEventsTimestampCols || []).map((row) => [row.column_name, row])
  );
  const tsMissing = ['created_at', 'updated_at'].filter((name) => !tsPresent.has(name));
  const tsNullable = ['created_at', 'updated_at'].filter((name) => {
    const row = tsPresent.get(name);
    return row && row.is_nullable === 'YES';
  });

  if (tsMissing.length || tsNullable.length) {
    const lines = [
      'Postgres schema is missing required email_events timestamp columns or constraints:',
      ...(tsMissing.length ? [`  Missing: email_events.${tsMissing.join(', email_events.')}`] : []),
      ...(tsNullable.length ? [`  Nullable: email_events.${tsNullable.join(', email_events.')}`] : []),
      'Run migrations (or ensure startup migrations run). The migration that sets defaults is:',
      '  server/migrations/020_email_events_timestamp_defaults_postgres.sql',
      'Set SKIP_SCHEMA_CHECK=1 to bypass this check (not recommended).'
    ];
    const message = lines.join('\n');

    // eslint-disable-next-line no-console
    console.error(message);

    if (process.env.NODE_ENV === 'production') {
      const err = new Error(message);
      err.code = 'PG_SCHEMA_INVALID';
      throw err;
    }
  }

  const jobAppsCompanyCols = await db
    .prepare(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name='job_applications'
         AND column_name IN ('company_source', 'company_confidence', 'company_explanation')`
    )
    .all();
  const jobAppsPresent = new Set((jobAppsCompanyCols || []).map((row) => row.column_name));
  const jobAppsMissing = ['company_source', 'company_confidence', 'company_explanation'].filter(
    (name) => !jobAppsPresent.has(name)
  );

  if (jobAppsMissing.length) {
    const message = [
      'Postgres schema is missing required job_applications columns used by matching/ingest:',
      `  job_applications.${jobAppsMissing.join(', job_applications.')}`,
      'Run migrations (or ensure startup migrations run). The migration that adds these is:',
      '  server/migrations/021_job_applications_company_fields_postgres.sql',
      'Set SKIP_SCHEMA_CHECK=1 to bypass this check (not recommended).'
    ].join('\n');

    // eslint-disable-next-line no-console
    console.error(message);

    if (process.env.NODE_ENV === 'production') {
      const err = new Error(message);
      err.code = 'PG_SCHEMA_INVALID';
      throw err;
    }
  }
}

module.exports = {
  pgMigrate,
  assertPgSchema,
  listPostgresMigrationFiles
};
