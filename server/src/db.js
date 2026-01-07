const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'jobtrack.db');

function openDb() {
  const dbPath = process.env.JOBTRACK_DB_PATH || DEFAULT_DB_PATH;
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(dbPath);
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

module.exports = {
  openDb,
  migrate
};
