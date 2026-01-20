const test = require('node:test');
const assert = require('node:assert/strict');

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const { extractMessageMetadata, insertEmailEventRecord } = require('../src/ingest');

function runMigrations(db) {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.exec(sql);
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

test('extractMessageMetadata tolerates missing headers/snippet/body', () => {
  const details = {
    payload: {
      headers: [
        { name: 'From', value: 'Workday <pru@myworkday.com>' },
        { name: 'Subject', value: 'Thank you for applying!' }
      ]
    }
  };
  const result = extractMessageMetadata(details);
  assert.equal(result.sender, 'Workday <pru@myworkday.com>');
  assert.equal(result.subject, 'Thank you for applying!');
  assert.equal(result.rfcMessageId, null);
  assert.equal(result.snippet, '');
  assert.equal(result.bodyText, '');
});

test('insertEmailEventRecord accepts null rfc_message_id and external_req_id', () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const userId = insertUser(db);
  const createdAt = new Date().toISOString();

  insertEmailEventRecord(db, {
    id: crypto.randomUUID(),
    userId,
    provider: 'gmail',
    messageId: 'msg-1',
    providerMessageId: 'msg-1',
    rfcMessageId: null,
    sender: 'Workday <pru@myworkday.com>',
    subject: 'Thank you for applying!',
    internalDate: null,
    snippet: null,
    detectedType: 'confirmation',
    confidenceScore: 0.92,
    classificationConfidence: 0.92,
    identityConfidence: 0.9,
    identityCompanyName: 'Prudential',
    identityJobTitle: null,
    identityCompanyConfidence: 0.9,
    identityExplanation: 'Derived from body.',
    explanation: 'Detected confirmation.',
    reasonCode: null,
    reasonDetail: null,
    roleTitle: null,
    roleConfidence: null,
    roleSource: null,
    roleExplanation: null,
    externalReqId: null,
    ingestDecision: null,
    createdAt
  });

  insertEmailEventRecord(db, {
    id: crypto.randomUUID(),
    userId,
    provider: 'gmail',
    messageId: 'msg-2',
    providerMessageId: 'msg-2',
    rfcMessageId: '<msg-2@example.com>',
    sender: 'Workday <pru@myworkday.com>',
    subject: 'Thank you for applying!',
    internalDate: null,
    snippet: null,
    detectedType: 'confirmation',
    confidenceScore: 0.92,
    classificationConfidence: 0.92,
    identityConfidence: 0.9,
    identityCompanyName: 'Prudential',
    identityJobTitle: null,
    identityCompanyConfidence: 0.9,
    identityExplanation: 'Derived from body.',
    explanation: 'Detected confirmation.',
    reasonCode: null,
    reasonDetail: null,
    roleTitle: null,
    roleConfidence: null,
    roleSource: null,
    roleExplanation: null,
    externalReqId: 'R-122920',
    ingestDecision: null,
    createdAt,
    llmStatus: true,
    llmError: null,
    llmModel: 'test-model',
    llmLatency: 123,
    llmEventType: 'confirmation',
    llmConfidence: 0.9,
    llmCompanyName: 'Prudential',
    llmJobTitle: 'Engineer',
    llmExternalReqId: null,
    llmProviderGuess: null,
    llmReasonCodes: ['missing_company'],
    llmRawJson: { test: true }
  });

  const count = db.prepare('SELECT COUNT(*) as count FROM email_events').get();
  assert.equal(count.count, 2);
});
