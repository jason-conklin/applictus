const test = require('node:test');
const assert = require('node:assert/strict');

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const { insertEmailEventRecord } = require('../src/ingest');

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

test('insertEmailEventRecord sets created_at and updated_at when omitted', () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const userId = insertUser(db);

  insertEmailEventRecord(db, {
    id: crypto.randomUUID(),
    userId,
    provider: 'gmail',
    messageId: 'msg-ts-1',
    providerMessageId: 'msg-ts-1',
    rfcMessageId: null,
    sender: 'Example <test@example.com>',
    subject: 'Hello',
    internalDate: null,
    snippet: null,
    detectedType: 'confirmation',
    confidenceScore: 0.9,
    classificationConfidence: 0.9,
    identityConfidence: 0.9,
    identityCompanyName: 'Acme',
    identityJobTitle: 'Engineer',
    identityCompanyConfidence: 0.9,
    identityExplanation: 'test',
    explanation: 'test',
    reasonCode: null,
    reasonDetail: null,
    roleTitle: null,
    roleConfidence: null,
    roleSource: null,
    roleExplanation: null,
    externalReqId: null,
    ingestDecision: null
    // Intentionally omit createdAt/updatedAt; helper must fill them.
  });

  const row = db
    .prepare('SELECT created_at, updated_at FROM email_events WHERE message_id = ?')
    .get('msg-ts-1');
  assert.ok(row);
  assert.ok(row.created_at);
  assert.ok(row.updated_at);
  assert.equal(row.created_at, row.updated_at);
});

