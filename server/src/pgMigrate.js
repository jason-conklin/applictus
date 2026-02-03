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
}

module.exports = {
  pgMigrate,
  assertPgSchema,
  listPostgresMigrationFiles
};

