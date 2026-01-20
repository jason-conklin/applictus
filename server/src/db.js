const fs = require('fs');
const path = require('path');

let Database;
try {
  // Load here so we can surface clearer errors if native module fails.
  Database = require('better-sqlite3');
} catch (err) {
  const help = [
    'Failed to load better-sqlite3 (native module).',
    'Use Node 20 LTS, then reinstall dependencies:',
    '- delete node_modules and package-lock.json',
    '- npm install',
    'If needed: npm rebuild better-sqlite3 --build-from-source'
  ].join(' ');
  const wrapped = new Error(`${help}. Original error: ${err.message}`);
  wrapped.code = err.code || 'SQLITE_NATIVE_LOAD_FAILED';
  wrapped.cause = err;
  throw wrapped;
}

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'jobtrack.db');

function openDb() {
  const dbPath = process.env.JOBTRACK_DB_PATH || DEFAULT_DB_PATH;
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  let db;
  try {
    db = new Database(dbPath);
  } catch (err) {
    const help = [
      'Failed to open SQLite database via better-sqlite3.',
      'Ensure better-sqlite3 is built for your platform (Node 20 LTS recommended).',
      'Try deleting node_modules and package-lock.json, then npm install.',
      'If needed: npm rebuild better-sqlite3 --build-from-source'
    ].join(' ');
    const wrapped = new Error(`${help}. DB path: ${dbPath}. Original error: ${err.message}`);
    wrapped.code = err.code || 'SQLITE_NATIVE_OPEN_FAILED';
    wrapped.cause = err;
    throw wrapped;
  }
  db.pragma('foreign_keys = ON');
  return db;
}

function migrate(db) {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)'
  );
  const applied = new Set(
    db
      .prepare('SELECT name FROM schema_migrations')
      .all()
      .map((row) => row.name)
  );

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    if (applied.has(file)) {
      continue;
    }
    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, 'utf8');
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(
      file,
      new Date().toISOString()
    );
  }
}

let emailEventColumnsCache = null;
function getEmailEventColumns(db) {
  if (emailEventColumnsCache) {
    return emailEventColumnsCache;
  }
  const rows = db.prepare('PRAGMA table_info(email_events)').all();
  emailEventColumnsCache = new Set(rows.map((r) => r.name));
  return emailEventColumnsCache;
}

module.exports = {
  openDb,
  migrate,
  getEmailEventColumns
};
