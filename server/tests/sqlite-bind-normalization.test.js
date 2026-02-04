const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const { matchAndAssignEvent } = require('../src/matching');

function runMigrations(db) {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql') && !file.endsWith('_postgres.sql'))
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

function insertEmailEvent(
  db,
  { userId, messageId, sender, subject, detectedType, confidenceScore, classificationConfidence, snippet, externalReqId }
) {
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  db.prepare(
    `INSERT INTO email_events
     (id, user_id, application_id, provider, message_id, provider_message_id, sender, subject, snippet,
      detected_type, confidence_score, classification_confidence, external_req_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    null,
    'gmail',
    messageId,
    messageId,
    sender,
    subject,
    snippet || null,
    detectedType,
    confidenceScore,
    classificationConfidence,
    externalReqId || null,
    timestamp
  );
  return id;
}

test('SQLite bind normalization avoids boolean params in application insert', async () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const userId = insertUser(db);

  // Force an auto-create path deterministically (independent of identity parsing heuristics).
  const identity = {
    companyName: 'Prudential',
    companyConfidence: 0.95,
    matchConfidence: 0.95,
    domainConfidence: 0.95,
    isAtsDomain: true,
    senderDomain: 'myworkday.com'
  };

  const eventId = insertEmailEvent(db, {
    userId,
    messageId: 'msg-1',
    sender: 'Workday <pru@myworkday.com>',
    subject: 'Thank you for applying!',
    detectedType: 'confirmation',
    confidenceScore: 0.92,
    classificationConfidence: 0.92,
    snippet: 'We received your application.',
    externalReqId: null
  });

  const result = await matchAndAssignEvent({
    db,
    userId,
    event: {
      id: eventId,
      sender: 'Workday <pru@myworkday.com>',
      subject: 'Thank you for applying!',
      snippet: 'We received your application.',
      detected_type: 'confirmation',
      confidence_score: 0.92,
      classification_confidence: 0.92,
      role_title: 'Associate Software Engineer',
      role_confidence: 0.95,
      role_source: 'body',
      role_explanation: 'test',
      external_req_id: null,
      created_at: new Date().toISOString()
    },
    identity
  });
  assert.equal(result.action, 'created_application');
  assert.ok(result.applicationId);

  const row = db
    .prepare('SELECT archived, user_override FROM job_applications WHERE id = ?')
    .get(result.applicationId);
  assert.equal(row.archived, 0);
  assert.equal(row.user_override, 0);
});
