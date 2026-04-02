const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let Database = null;
try {
  Database = require('better-sqlite3');
} catch (_) {
  Database = null;
}

const { syncGmailMessages, insertEmailEventRecord } = require('../src/ingest');

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

function toBase64Url(value) {
  return Buffer.from(String(value || ''), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function insertUser(db) {
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, email, name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(userId, `user-${userId}@example.com`, 'Test User', now, now);
  return userId;
}

test('syncGmailMessages reprocesses previously ignored Indeed confirmation and creates/updates applied application', async (t) => {
  if (!Database) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }

  let db;
  try {
    db = new Database(':memory:');
  } catch (err) {
    const message = String(err && err.message ? err.message : err);
    if (/better-sqlite3|invalid ELF header|SQLITE_NATIVE_(OPEN|LOAD)_FAILED/i.test(message)) {
      t.skip('better-sqlite3 native module unavailable in this environment');
      return;
    }
    throw err;
  }
  runMigrations(db);
  const userId = insertUser(db);
  const now = Date.now();

  const subject = "Indeed Application: Sr. Analyst, Business Management Indeed o'clock Application submitted";
  const body = [
    'Sr. Analyst, Business Management',
    'company logo',
    'Valley National Bank - New Jersey United States',
    'star rating 3.2 602 reviews',
    '',
    'The following items were sent to Valley National Bank. Good luck!',
    '- Application',
    '- Resume',
    '',
    'Next steps',
    '- The employer or job advertiser may reach out to you about your application.'
  ].join('\n');
  const messageId = 'msg-indeed-1';
  const rfcMessageId = '<indeed-msg-1@example.com>';

  insertEmailEventRecord(db, {
    id: 'evt-legacy-indeed-1',
    userId,
    provider: 'gmail',
    messageId,
    providerMessageId: messageId,
    rfcMessageId,
    sender: 'Indeed Apply <indeedapply@indeed.com>',
    subject,
    internalDate: now - 24 * 60 * 60 * 1000,
    snippet: 'The following items were sent to Valley National Bank. Good luck!',
    detectedType: 'other_job_related',
    confidenceScore: 0.28,
    classificationConfidence: 0.28,
    identityConfidence: 0,
    identityCompanyName: null,
    identityJobTitle: null,
    identityCompanyConfidence: null,
    identityExplanation: null,
    explanation: 'legacy_not_relevant',
    reasonCode: 'not_relevant',
    reasonDetail: null,
    roleTitle: "Indeed o'clock Application submitted",
    roleConfidence: 0.1,
    roleSource: 'legacy',
    roleExplanation: 'legacy',
    externalReqId: null,
    ingestDecision: 'unsorted',
    createdAt: new Date(now - 24 * 60 * 60 * 1000).toISOString()
  });

  const gmail = {
    users: {
      messages: {
        list: async () => ({
          data: {
            messages: [{ id: messageId }],
            resultSizeEstimate: 1,
            nextPageToken: null
          }
        }),
        get: async () => ({
          data: {
            id: messageId,
            internalDate: String(now),
            snippet: 'The following items were sent to Valley National Bank. Good luck!',
            labelIds: ['INBOX'],
            payload: {
              headers: [
                { name: 'From', value: 'Indeed Apply <indeedapply@indeed.com>' },
                { name: 'Subject', value: subject },
                { name: 'Message-ID', value: rfcMessageId }
              ],
              mimeType: 'text/plain',
              body: {
                data: toBase64Url(body)
              }
            }
          }
        })
      }
    }
  };

  const originalLlm = process.env.JOBTRACK_LLM_ENABLED;
  process.env.JOBTRACK_LLM_ENABLED = '0';
  try {
    const result = await syncGmailMessages({
      db,
      userId,
      days: 7,
      maxResults: 10,
      mode: 'days',
      timeWindowStart: new Date(now - 7 * 24 * 60 * 60 * 1000),
      timeWindowEnd: new Date(now + 60 * 1000),
      authClientOverride: {},
      gmailServiceOverride: gmail,
      authenticatedUserEmailOverride: `user-${userId}@example.com`
    });

    assert.equal(result.status, 'ok');
    assert.equal(result.skippedDuplicate, 0);
    assert.ok((result.createdApplications || 0) + (result.matchedExisting || 0) >= 1);

    const providerCount = db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM email_events
         WHERE user_id = ? AND provider = 'gmail' AND provider_message_id = ?`
      )
      .get(userId, messageId);
    assert.equal(Number(providerCount.count), 1);

    const storedEvent = db
      .prepare(
        `SELECT detected_type, role_title, identity_company_name, ingest_decision, reason_code, application_id
         FROM email_events
         WHERE user_id = ? AND provider = 'gmail' AND provider_message_id = ?`
      )
      .get(userId, messageId);
    assert.equal(storedEvent.detected_type, 'confirmation');
    assert.match(String(storedEvent.role_title || ''), /Sr\.?\s*Analyst.*Business Management/i);
    assert.match(String(storedEvent.identity_company_name || ''), /Valley National Bank/i);
    assert.notEqual(String(storedEvent.reason_code || '').toLowerCase(), 'not_relevant');
    assert.ok(['matched', 'auto_created', 'unsorted'].includes(String(storedEvent.ingest_decision || '')));

    const app = db
      .prepare(
        `SELECT company, role, status, current_status
         FROM job_applications
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(userId);
    assert.ok(app);
    assert.match(String(app.company || ''), /Valley National Bank/i);
    assert.match(String(app.role || ''), /Sr\.?\s*Analyst.*Business Management/i);
    assert.equal(String(app.current_status || app.status || '').toUpperCase(), 'APPLIED');
  } finally {
    if (originalLlm === undefined) {
      delete process.env.JOBTRACK_LLM_ENABLED;
    } else {
      process.env.JOBTRACK_LLM_ENABLED = originalLlm;
    }
    db.close();
  }
});
