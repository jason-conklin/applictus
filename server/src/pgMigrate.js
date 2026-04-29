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

  const jobAppsBoolCols = await db
    .prepare(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name='job_applications'
         AND column_name IN ('archived', 'user_override')`
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
    const lines = [
      'Postgres schema is missing required job_applications boolean columns or types:',
      ...(boolMissing.length ? [`  Missing: job_applications.${boolMissing.join(', job_applications.')}`] : []),
      ...(boolWrongType.length ? [`  Wrong type: job_applications.${boolWrongType.join(', job_applications.')}`] : []),
      ...(boolNullable.length ? [`  Nullable: job_applications.${boolNullable.join(', job_applications.')}`] : []),
      'Run migrations (or ensure startup migrations run). The migration that fixes these is:',
      '  server/migrations/022_job_applications_boolean_columns_postgres.sql',
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

  const userPlanColumns = await db
    .prepare(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name='users'
         AND column_name IN (
           'plan_tier',
           'plan_status',
           'monthly_tracked_email_limit',
           'tracked_email_count_current_month',
           'tracked_email_month_bucket',
           'monthly_inbound_email_limit',
           'inbound_email_count_current_month',
           'inbound_email_month_bucket',
           'inbound_email_relevant_count_current_month',
           'inbound_email_dropped_count_current_month',
           'inbound_email_dropped_irrelevant_count_current_month',
           'inbound_email_dropped_over_cap_count_current_month',
           'subscription_status',
           'current_period_end',
           'cancel_at_period_end'
         )`
    )
    .all();
  const userPlanPresent = new Set((userPlanColumns || []).map((row) => row.column_name));
  const userPlanMissing = [
    'plan_tier',
    'plan_status',
    'monthly_tracked_email_limit',
    'tracked_email_count_current_month',
    'tracked_email_month_bucket',
    'monthly_inbound_email_limit',
    'inbound_email_count_current_month',
    'inbound_email_month_bucket',
    'inbound_email_relevant_count_current_month',
    'inbound_email_dropped_count_current_month',
    'inbound_email_dropped_irrelevant_count_current_month',
    'inbound_email_dropped_over_cap_count_current_month',
    'subscription_status',
    'current_period_end',
    'cancel_at_period_end'
  ].filter((name) => !userPlanPresent.has(name));

  if (userPlanMissing.length) {
    const message = [
      'Postgres schema is missing required users plan/usage columns:',
      `  users.${userPlanMissing.join(', users.')}`,
      'Run migrations (or ensure startup migrations run). The migrations that add these are:',
      '  server/migrations/035_plan_usage_postgres.sql',
      '  server/migrations/037_inbound_usage_limits_postgres.sql',
      '  server/migrations/038_subscription_cancellation_fields_postgres.sql',
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

  const userActionsTable = await db
    .prepare(
      `SELECT 1 as ok
       FROM information_schema.tables
       WHERE table_schema='public'
         AND table_name='user_actions'`
    )
    .get();

  if (!userActionsTable) {
    const message = [
      'Postgres schema is missing required table user_actions.',
      'This will cause status inference and application actions to fail on Postgres.',
      '',
      'Run migrations (or ensure startup migrations run). The migration that adds this is:',
      '  server/migrations/023_user_actions_postgres.sql',
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

  const inboundTables = await db
    .prepare(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema='public'
         AND table_name IN ('inbound_addresses', 'inbound_messages', 'user_parse_hints', 'inbound_webhook_events')`
    )
    .all();
  const inboundPresent = new Set((inboundTables || []).map((row) => row.table_name));
  const inboundMissing = ['inbound_addresses', 'inbound_messages', 'user_parse_hints', 'inbound_webhook_events'].filter(
    (name) => !inboundPresent.has(name)
  );

  if (inboundMissing.length) {
    const message = [
      'Postgres schema is missing required inbound forwarding tables:',
      `  ${inboundMissing.join(', ')}`,
      'Run migrations (or ensure startup migrations run). The migration that adds these is:',
      '  server/migrations/025_inbound_forwarding_postgres.sql',
      '  server/migrations/030_user_parse_hints_postgres.sql',
      '  server/migrations/041_inbound_abuse_controls_postgres.sql',
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

  const inboundAddressColumns = await db
    .prepare(
      `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema='public'
           AND table_name='inbound_addresses'
         AND column_name IN ('confirmed_at', 'last_received_at', 'status')`
    )
    .all();
  const inboundAddressPresent = new Set((inboundAddressColumns || []).map((row) => row.column_name));
  const inboundAddressMissing = ['confirmed_at', 'last_received_at', 'status'].filter(
    (name) => !inboundAddressPresent.has(name)
  );

  if (inboundAddressMissing.length) {
    const message = [
      'Postgres schema is missing required inbound_addresses status columns:',
      `  inbound_addresses.${inboundAddressMissing.join(', inbound_addresses.')}`,
      'Run migrations (or ensure startup migrations run). The migration that adds these is:',
      '  server/migrations/026_inbound_forwarding_status_postgres.sql',
      '  server/migrations/041_inbound_abuse_controls_postgres.sql',
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

  const inboundMessageColumns = await db
    .prepare(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name='inbound_messages'
         AND column_name IN (
           'processed_at',
           'processing_status',
           'processing_error',
           'derived_event_id',
           'derived_application_id',
           'derived_application_key',
           'derived_status',
           'derived_company',
           'derived_role',
           'derived_debug_json'
         )`
    )
    .all();
  const inboundMessagePresent = new Set((inboundMessageColumns || []).map((row) => row.column_name));
  const inboundMessageMissing = [
    'processed_at',
    'processing_status',
    'processing_error',
    'derived_event_id',
    'derived_application_id',
    'derived_application_key',
    'derived_status',
    'derived_company',
    'derived_role',
    'derived_debug_json'
  ].filter((name) => !inboundMessagePresent.has(name));

  if (inboundMessageMissing.length) {
    const message = [
      'Postgres schema is missing required inbound_messages processing columns:',
      `  inbound_messages.${inboundMessageMissing.join(', inbound_messages.')}`,
      'Run migrations (or ensure startup migrations run). The migration that adds these is:',
      '  server/migrations/027_inbound_message_processing_postgres.sql',
      '  server/migrations/028_application_key_postgres.sql',
      '  server/migrations/029_inbound_debug_postgres.sql',
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

  const appKeyColumns = await db
    .prepare(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name='job_applications'
         AND column_name = 'application_key'`
    )
    .all();
  if (!Array.isArray(appKeyColumns) || !appKeyColumns.length) {
    const message = [
      'Postgres schema is missing required dedupe column:',
      '  job_applications.application_key',
      'Run migrations (or ensure startup migrations run). The migration that adds this is:',
      '  server/migrations/028_application_key_postgres.sql',
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
