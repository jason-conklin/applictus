const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

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

function insertUser(db) {
  const userId = crypto.randomUUID();
  db.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').run(
    userId,
    `user-${userId}@example.com`,
    'User',
    new Date().toISOString()
  );
  return userId;
}

test('email_events provider_message_id dedupe is scoped per-user and per-provider', () => {
  const db = new Database(':memory:');
  runMigrations(db);

  const userA = insertUser(db);
  const userB = insertUser(db);

  const sharedProviderMessageId = 'gmail-msg-shared';
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO email_events
     (id, user_id, provider, message_id, provider_message_id, detected_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    userA,
    'gmail',
    'unique-message-id-a',
    sharedProviderMessageId,
    'confirmation',
    createdAt
  );

  // Second user can store the same provider_message_id without colliding.
  db.prepare(
    `INSERT INTO email_events
     (id, user_id, provider, message_id, provider_message_id, detected_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    userB,
    'gmail',
    'unique-message-id-b',
    sharedProviderMessageId,
    'confirmation',
    createdAt
  );

  const count = db.prepare('SELECT COUNT(*) as count FROM email_events').get();
  assert.equal(count.count, 2);
});
