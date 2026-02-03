const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

process.env.JOBTRACK_TOKEN_ENC_KEY = crypto.randomBytes(32).toString('base64');

const { upsertTokens, getStoredTokens } = require('../src/email');

function runMigrations(db) {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql') && !file.endsWith('_postgres.sql'))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    try {
      db.exec(sql);
    } catch (err) {
      err.message = `${file}: ${err.message}`;
      throw err;
    }
  }
}

test('token persistence encrypts and preserves refresh token', async () => {
  const db = new Database(':memory:');
  runMigrations(db);

  const userId = crypto.randomUUID();
  db.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').run(
    userId,
    'test@example.com',
    'Test User',
    new Date().toISOString()
  );

  await upsertTokens(
    db,
    userId,
    {
      access_token: 'access-1',
      refresh_token: 'refresh-1',
      scope: 'scope',
      expiry_date: 123
    },
    'test@example.com'
  );

  await upsertTokens(db, userId, { access_token: 'access-2' });

  const stored = await getStoredTokens(db, userId);
  assert.equal(stored.access_token, 'access-2');
  assert.equal(stored.refresh_token, 'refresh-1');
  assert.equal(stored.connected_email, 'test@example.com');
  db.close();
});
