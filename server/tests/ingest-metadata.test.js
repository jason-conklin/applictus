const test = require('node:test');
const assert = require('node:assert/strict');

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const { extractMessageMetadata, insertEmailEventRecord } = require('../src/ingest');
const { classifyEmail } = require('../../shared/emailClassifier');

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

test('extractMessageMetadata tolerates missing headers/snippet/body', async () => {
  const details = {
    payload: {
      headers: [
        { name: 'From', value: 'Workday <pru@myworkday.com>' },
        { name: 'Subject', value: 'Thank you for applying!' }
      ]
    }
  };
  const result = await extractMessageMetadata(details);
  assert.equal(result.sender, 'Workday <pru@myworkday.com>');
  assert.equal(result.subject, 'Thank you for applying!');
  assert.equal(result.rfcMessageId, null);
  assert.equal(result.snippet, '');
  assert.equal(result.bodyText, '');
});

test('extractMessageMetadata captures LinkedIn rejection phrase from nested html payload when snippet lacks it', async () => {
  const htmlBody =
    '<div>Your update from Concorde Research Technologies.</div>=0A' +
    '<div>Unfortunately, we will not be moving forward with your application at this time.</div>';
  const details = {
    snippet: 'Your update from Concorde Research Technologies.',
    payload: {
      headers: [
        { name: 'From', value: 'jobs-noreply@linkedin.com' },
        { name: 'Subject', value: 'Your application to Software Engineer at Concorde Research Technologies' }
      ],
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            {
              mimeType: 'text/plain',
              body: {
                data: Buffer.from('Your update from Concorde Research Technologies.', 'utf8').toString('base64url')
              }
            },
            {
              mimeType: 'text/html',
              body: {
                data: Buffer.from(htmlBody, 'utf8').toString('base64url')
              }
            }
          ]
        }
      ]
    }
  };

  const result = await extractMessageMetadata(details);
  assert.match(result.bodyText, /will not be moving forward with your application/i);
  const classification = classifyEmail({
    subject: result.subject,
    snippet: result.snippet,
    sender: result.sender,
    body: result.bodyText
  });
  assert.equal(classification.detectedType, 'rejection');
  assert.ok(classification.confidenceScore >= 0.97);
  assert.equal(classification.reason, 'linkedin_jobs_rejection_phrase_body');
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
