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

test('syncGmailMessages ingests Pereless ATS confirmations as separate applied applications by job ID', async (t) => {
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

  const messageA = {
    id: 'msg-pereless-1',
    rfcMessageId: '<msg-pereless-1@example.com>',
    subject: 'Jobs Applied to on 04/02/2026',
    body: [
      'ID: 110365 - Product Support Specialist / Web Based Software',
      '',
      'Dear Jason,',
      '',
      'Thank you for inquiring about employment opportunities with Pereless Systems.',
      'We are currently reviewing your resume and evaluating your professional credentials.',
      'If there is a match between our requirements and your experience, we will contact you to discuss the position in further detail.',
      'We wish you the best in your employment search!'
    ].join('\n')
  };

  const messageB = {
    id: 'msg-pereless-2',
    rfcMessageId: '<msg-pereless-2@example.com>',
    subject: 'Jobs Applied to on 04/02/2026',
    body: [
      'ID: 255074 - Front End Web Application Developer',
      'ID: 110365 - Product Support Specialist / Web Based Software',
      '',
      'Dear Jason,',
      '',
      'Thank you for inquiring about employment opportunities with Pereless Systems.',
      'We are currently reviewing your resume and evaluating your professional credentials.',
      'If there is a match between our requirements and your experience, we will contact you to discuss the position in further detail.',
      'We wish you the best in your employment search!'
    ].join('\n')
  };

  const byId = new Map([
    [messageA.id, messageA],
    [messageB.id, messageB]
  ]);

  const gmail = {
    users: {
      messages: {
        list: async () => ({
          data: {
            messages: [{ id: messageA.id }, { id: messageB.id }],
            resultSizeEstimate: 2,
            nextPageToken: null
          }
        }),
        get: async ({ id }) => {
          const msg = byId.get(String(id));
          if (!msg) {
            throw new Error(`Unknown message id ${id}`);
          }
          return {
            data: {
              id: msg.id,
              internalDate: String(now),
              snippet: 'Thank you for inquiring about employment opportunities with Pereless Systems.',
              labelIds: ['INBOX'],
              payload: {
                headers: [
                  { name: 'From', value: 'Pereless Recruiting <recruiting@pereless.com>' },
                  { name: 'Subject', value: msg.subject },
                  { name: 'Message-ID', value: msg.rfcMessageId }
                ],
                mimeType: 'text/plain',
                body: {
                  data: toBase64Url(msg.body)
                }
              }
            }
          };
        }
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
    assert.equal(Number(result.reasons?.not_relevant || 0), 0);

    const events = db
      .prepare(
        `SELECT provider_message_id, detected_type, identity_company_name, role_title, external_req_id, ingest_decision, application_id
         FROM email_events
         WHERE user_id = ?
           AND provider = 'gmail'
         ORDER BY provider_message_id ASC`
      )
      .all(userId);
    assert.equal(events.length, 2);
    assert.ok(events.every((row) => String(row.detected_type || '').toLowerCase() === 'confirmation'));
    assert.ok(events.every((row) => String(row.identity_company_name || '').includes('Pereless Systems')));
    assert.ok(events.every((row) => String(row.external_req_id || '').length > 0));
    assert.ok(events.every((row) => row.application_id));

    const apps = db
      .prepare(
        `SELECT id, company, role, current_status, external_req_id
         FROM job_applications
         WHERE user_id = ?
         ORDER BY created_at ASC`
      )
      .all(userId);
    assert.equal(apps.length, 2);
    assert.ok(apps.every((row) => String(row.company || '').includes('Pereless Systems')));
    assert.ok(apps.some((row) => String(row.role || '').includes('Product Support Specialist / Web Based Software')));
    assert.ok(apps.some((row) => String(row.role || '').includes('Front End Web Application Developer')));
    assert.deepEqual(
      apps.map((row) => String(row.external_req_id || '')).sort(),
      ['110365', '255074']
    );
    assert.ok(apps.every((row) => String(row.current_status || '').toUpperCase() === 'APPLIED'));
  } finally {
    if (originalLlm === undefined) {
      delete process.env.JOBTRACK_LLM_ENABLED;
    } else {
      process.env.JOBTRACK_LLM_ENABLED = originalLlm;
    }
    db.close();
  }
});

test('syncGmailMessages reprocesses CBRE received/under-review confirmation and creates applied application', async (t) => {
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

  const messageId = 'msg-cbre-1';
  const rfcMessageId = '<msg-cbre-1@example.com>';
  const subject = 'Thank you for applying at CBRE - 267657 Data Center Change Management Coordinator';
  const body = [
    'Hello Michelle,',
    '',
    'Thank you for applying to the Data Center Change Management Coordinator role. We have successfully received your application and it is currently under review.',
    '',
    'Over the coming weeks, we will be assessing applicants for this role. If your qualifications prove to be a match, we will reach out to you to schedule an interview.',
    '',
    'We may invite you to some or all of the below recruitment stages, as they help us to get a more accurate picture of who you are. Some of your interactions with us may include:',
    '- A screening interview',
    '- Face-to-face interview or Zoom Call',
    '- Assessment exercises',
    '',
    'To check the status of your application at any time, login to your profile by clicking here.',
    '',
    'Thank you,',
    'CBRE Talent Acquisition'
  ].join('\n');

  insertEmailEventRecord(db, {
    id: 'evt-legacy-cbre-1',
    userId,
    provider: 'gmail',
    messageId,
    providerMessageId: messageId,
    rfcMessageId,
    sender: 'CBRE Talent Acquisition <donotreply@cbre.com>',
    subject,
    internalDate: now - 60 * 60 * 1000,
    snippet: 'Thank you for applying to the Data Center Change Management Coordinator role.',
    detectedType: 'other_job_related',
    confidenceScore: 0.21,
    classificationConfidence: 0.21,
    identityConfidence: 0,
    identityCompanyName: null,
    identityJobTitle: null,
    identityCompanyConfidence: null,
    identityExplanation: null,
    explanation: 'legacy_not_relevant',
    reasonCode: 'not_relevant',
    reasonDetail: null,
    roleTitle: null,
    roleConfidence: null,
    roleSource: null,
    roleExplanation: null,
    externalReqId: '267657',
    ingestDecision: 'unsorted',
    createdAt: new Date(now - 60 * 60 * 1000).toISOString()
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
            snippet: 'Thank you for applying to the Data Center Change Management Coordinator role.',
            labelIds: ['INBOX'],
            payload: {
              headers: [
                { name: 'From', value: 'CBRE Talent Acquisition <donotreply@cbre.com>' },
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
      days: 30,
      maxResults: 20,
      mode: 'days',
      timeWindowStart: new Date(now - 30 * 24 * 60 * 60 * 1000),
      timeWindowEnd: new Date(now + 60 * 1000),
      authClientOverride: {},
      gmailServiceOverride: gmail,
      authenticatedUserEmailOverride: `user-${userId}@example.com`
    });

    assert.equal(result.status, 'ok');
    assert.equal(result.skippedDuplicate, 0);
    assert.ok((result.createdApplications || 0) + (result.matchedExisting || 0) >= 1);

    const storedEvent = db
      .prepare(
        `SELECT detected_type, reason_code, identity_company_name, role_title, ingest_decision, application_id
         FROM email_events
         WHERE user_id = ? AND provider = 'gmail' AND provider_message_id = ?`
      )
      .get(userId, messageId);
    assert.ok(storedEvent);
    assert.notEqual(String(storedEvent.reason_code || '').toLowerCase(), 'not_relevant');
    assert.ok(['confirmation', 'under_review'].includes(String(storedEvent.detected_type || '').toLowerCase()));
    assert.match(String(storedEvent.identity_company_name || ''), /CBRE/i);
    assert.match(String(storedEvent.role_title || ''), /Data Center Change Management Coordinator/i);
    assert.ok(storedEvent.application_id);
    assert.ok(['matched', 'auto_created', 'unsorted'].includes(String(storedEvent.ingest_decision || '')));

    const app = db
      .prepare(
        `SELECT company, role, current_status
         FROM job_applications
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(userId);
    assert.ok(app);
    assert.match(String(app.company || ''), /CBRE/i);
    assert.match(String(app.role || ''), /Data Center Change Management Coordinator/i);
    assert.equal(String(app.current_status || '').toUpperCase(), 'APPLIED');
  } finally {
    if (originalLlm === undefined) {
      delete process.env.JOBTRACK_LLM_ENABLED;
    } else {
      process.env.JOBTRACK_LLM_ENABLED = originalLlm;
    }
    db.close();
  }
});

test('syncGmailMessages reprocesses Fulcrum interview-stage assessment invite and creates interview application', async (t) => {
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

  const messageId = 'msg-fulcrum-1';
  const rfcMessageId = '<msg-fulcrum-1@example.com>';
  const subject = 'Thank you for your interest in Remote Accounts Receivable Specialist role';
  const body = [
    'Thank you for your interest in joining our team. We’re pleased to invite you to the next step in our hiring process.',
    '',
    'Attached, you’ll find the screening test and job description, which together will serve as your initial interview.',
    'This format allows us to better understand your thought process and approach to challenges.',
    'We kindly ask that you review and respond to the attached questions at your earliest convenience.',
    'Please submit your responses via email. Your answers will play a key role in helping us determine your progression to the next stage of the process.',
    '',
    'We look forward to reviewing your submission.',
    '',
    'Kind Regards,',
    'Adrian Berley',
    'Human Resources Team | HR Manager',
    'Fulcrum Vets, LLC'
  ].join('\n');

  insertEmailEventRecord(db, {
    id: 'evt-legacy-fulcrum-1',
    userId,
    provider: 'gmail',
    messageId,
    providerMessageId: messageId,
    rfcMessageId,
    sender: 'Adrian Berley <adrian.berley@fulcrumvets.com>',
    subject,
    internalDate: now - 30 * 60 * 1000,
    snippet: 'We’re pleased to invite you to the next step in our hiring process.',
    detectedType: 'other_job_related',
    confidenceScore: 0.22,
    classificationConfidence: 0.22,
    identityConfidence: 0,
    identityCompanyName: null,
    identityJobTitle: null,
    identityCompanyConfidence: null,
    identityExplanation: null,
    explanation: 'legacy_not_relevant',
    reasonCode: 'not_relevant',
    reasonDetail: null,
    roleTitle: null,
    roleConfidence: null,
    roleSource: null,
    roleExplanation: null,
    externalReqId: null,
    ingestDecision: 'unsorted',
    createdAt: new Date(now - 30 * 60 * 1000).toISOString()
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
            snippet: 'We’re pleased to invite you to the next step in our hiring process.',
            labelIds: ['INBOX'],
            payload: {
              headers: [
                { name: 'From', value: 'Adrian Berley <adrian.berley@fulcrumvets.com>' },
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
      days: 30,
      maxResults: 20,
      mode: 'days',
      timeWindowStart: new Date(now - 30 * 24 * 60 * 60 * 1000),
      timeWindowEnd: new Date(now + 60 * 1000),
      authClientOverride: {},
      gmailServiceOverride: gmail,
      authenticatedUserEmailOverride: `user-${userId}@example.com`
    });

    assert.equal(result.status, 'ok');
    assert.equal(result.skippedDuplicate, 0);
    assert.ok((result.createdApplications || 0) + (result.matchedExisting || 0) >= 1);

    const storedEvent = db
      .prepare(
        `SELECT detected_type, reason_code, identity_company_name, role_title, ingest_decision, application_id
         FROM email_events
         WHERE user_id = ? AND provider = 'gmail' AND provider_message_id = ?`
      )
      .get(userId, messageId);
    assert.ok(storedEvent);
    assert.notEqual(String(storedEvent.reason_code || '').toLowerCase(), 'not_relevant');
    assert.equal(String(storedEvent.detected_type || '').toLowerCase(), 'interview_requested');
    assert.match(String(storedEvent.identity_company_name || ''), /Fulcrum Vets/i);
    assert.match(String(storedEvent.role_title || ''), /Remote Accounts Receivable Specialist/i);
    assert.ok(storedEvent.application_id);
    assert.ok(['matched', 'auto_created', 'unsorted'].includes(String(storedEvent.ingest_decision || '')));

    const app = db
      .prepare(
        `SELECT company, role, current_status
         FROM job_applications
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(userId);
    assert.ok(app);
    assert.match(String(app.company || ''), /Fulcrum Vets/i);
    assert.match(String(app.role || ''), /Remote Accounts Receivable Specialist/i);
    assert.equal(String(app.current_status || '').toUpperCase(), 'INTERVIEW_REQUESTED');
  } finally {
    if (originalLlm === undefined) {
      delete process.env.JOBTRACK_LLM_ENABLED;
    } else {
      process.env.JOBTRACK_LLM_ENABLED = originalLlm;
    }
    db.close();
  }
});
