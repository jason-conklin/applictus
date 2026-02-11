const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const { ApplicationStatus } = require('../../shared/types');
const { repairLinkedInSplitApplications } = require('../src/ingest');

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
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    `${id}@example.com`,
    'User',
    new Date().toISOString()
  );
  return id;
}

function insertApplication(db, { userId, company, role, appliedAt, status = ApplicationStatus.APPLIED }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO job_applications
      (id, user_id, company, company_name, role, job_title, status, current_status, status_updated_at,
       created_at, updated_at, applied_at, last_activity_at, archived, user_override)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    company,
    company,
    role,
    role,
    status,
    status,
    now,
    now,
    now,
    appliedAt,
    appliedAt,
    0,
    0
  );
  return id;
}

function insertEmailEvent(db, { userId, appId, messageId, sender, subject, detectedType, confidence = 0.98 }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO email_events
      (id, user_id, application_id, provider, message_id, provider_message_id, sender, subject, snippet,
       detected_type, confidence_score, classification_confidence, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    appId,
    'gmail',
    messageId,
    messageId,
    sender,
    subject,
    subject,
    detectedType,
    confidence,
    confidence,
    now
  );
  return id;
}

test('repairLinkedInSplitApplications merges Tata confirmation/rejection split with normalized identity keys', async () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const userId = insertUser(db);

  const appApplied = insertApplication(db, {
    userId,
    company: 'Tata\u00a0Consultancy Services',
    role: 'Artificial\u00a0Intelligence Engineer \u2013 Entry Level',
    appliedAt: '2026-02-06T12:00:00.000Z',
    status: ApplicationStatus.APPLIED
  });
  const appRejected = insertApplication(db, {
    userId,
    company: 'Tata Consultancy Services',
    role: 'Artificial Intelligence Engineer - Entry Level',
    appliedAt: '2026-02-09T12:00:00.000Z',
    status: ApplicationStatus.APPLIED
  });

  insertEmailEvent(db, {
    userId,
    appId: appApplied,
    messageId: 'msg-repair-confirm',
    sender: 'LinkedIn Jobs <jobs-noreply@linkedin.com>',
    subject: 'Jason, your application was sent to Tata Consultancy Services',
    detectedType: 'confirmation'
  });
  insertEmailEvent(db, {
    userId,
    appId: appRejected,
    messageId: 'msg-repair-reject',
    sender: 'LinkedIn Jobs <jobs-noreply@linkedin.com>',
    subject: 'Your application to Artificial Intelligence Engineer - Entry Level at Tata Consultancy Services',
    detectedType: 'rejection'
  });

  const result = await repairLinkedInSplitApplications(db, userId, {
    syncStart: '2026-02-01T00:00:00.000Z',
    syncEnd: '2026-02-28T23:59:59.999Z'
  });
  assert.equal(result.mergedPairs, 1);

  const apps = db.prepare('SELECT id, archived, current_status FROM job_applications WHERE user_id = ?').all(userId);
  const active = apps.filter((row) => Number(row.archived) === 0);
  const archived = apps.filter((row) => Number(row.archived) === 1);
  assert.equal(active.length, 1);
  assert.equal(archived.length, 1);

  const eventApps = db
    .prepare('SELECT DISTINCT application_id FROM email_events WHERE user_id = ?')
    .all(userId)
    .map((row) => row.application_id);
  assert.equal(eventApps.length, 1);
  assert.equal(eventApps[0], active[0].id);
  assert.equal(active[0].current_status, ApplicationStatus.REJECTED);
  db.close();
});

test('repairLinkedInSplitApplications does not merge same normalized identity when anchors are months apart', async () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const userId = insertUser(db);

  const appOld = insertApplication(db, {
    userId,
    company: 'Tata Consultancy Services',
    role: 'Artificial Intelligence Engineer - Entry Level',
    appliedAt: '2025-01-06T12:00:00.000Z',
    status: ApplicationStatus.APPLIED
  });
  const appRecent = insertApplication(db, {
    userId,
    company: 'Tata Consultancy Services',
    role: 'Artificial Intelligence Engineer - Entry Level',
    appliedAt: '2025-09-06T12:00:00.000Z',
    status: ApplicationStatus.APPLIED
  });

  insertEmailEvent(db, {
    userId,
    appId: appOld,
    messageId: 'msg-repair-no-merge-confirm',
    sender: 'jobs-noreply@linkedin.com',
    subject: 'Jason, your application was sent to Tata Consultancy Services',
    detectedType: 'confirmation'
  });
  insertEmailEvent(db, {
    userId,
    appId: appRecent,
    messageId: 'msg-repair-no-merge-reject',
    sender: 'jobs-noreply@linkedin.com',
    subject: 'Your application to Artificial Intelligence Engineer - Entry Level at Tata Consultancy Services',
    detectedType: 'rejection'
  });

  const result = await repairLinkedInSplitApplications(db, userId, {
    syncStart: '2025-09-01T00:00:00.000Z',
    syncEnd: '2025-09-30T23:59:59.999Z'
  });
  assert.equal(result.mergedPairs, 0);

  const activeCount = db
    .prepare('SELECT COUNT(*) AS c FROM job_applications WHERE user_id = ? AND archived = 0')
    .get(userId).c;
  assert.equal(Number(activeCount), 2);

  const distinctEventApps = db
    .prepare('SELECT COUNT(DISTINCT application_id) AS c FROM email_events WHERE user_id = ?')
    .get(userId).c;
  assert.equal(Number(distinctEventApps), 2);
  db.close();
});
