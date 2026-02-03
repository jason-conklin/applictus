const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const { applyStatusOverride } = require('../src/overrides');
const { mergeApplications } = require('../src/merge');
const { ApplicationStatus } = require('../../shared/types');

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

function insertApplication(db, { userId, company, role, status, appliedAt, lastActivityAt }) {
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  db.prepare(
    `INSERT INTO job_applications
     (id, user_id, company, role, status, status_updated_at, created_at, updated_at, archived,
      company_name, job_title, current_status, applied_at, last_activity_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    company,
    role,
    status,
    timestamp,
    timestamp,
    timestamp,
    0,
    company,
    role,
    status,
    appliedAt || null,
    lastActivityAt || null
  );
  return id;
}

function insertEmailEvent(db, { userId, applicationId, messageId }) {
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  db.prepare(
    `INSERT INTO email_events
     (id, user_id, application_id, provider, message_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, userId, applicationId, 'gmail', messageId, timestamp);
  return id;
}

test('applyStatusOverride updates status and logs action', () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const userId = insertUser(db);

  const appId = insertApplication(db, {
    userId,
    company: 'Acme',
    role: 'Engineer',
    status: ApplicationStatus.UNKNOWN
  });

  const application = db.prepare('SELECT * FROM job_applications WHERE id = ?').get(appId);
  applyStatusOverride(db, {
    userId,
    application,
    nextStatus: ApplicationStatus.REJECTED,
    explanation: 'User confirmed rejection.'
  });

  const updated = db.prepare('SELECT * FROM job_applications WHERE id = ?').get(appId);
  assert.equal(updated.current_status, ApplicationStatus.REJECTED);
  assert.equal(updated.user_override, 1);
  assert.equal(updated.status_explanation, 'User confirmed rejection.');
  assert.equal(updated.status_source, 'user');

  const action = db
    .prepare('SELECT action_type, action_payload FROM user_actions WHERE application_id = ?')
    .get(appId);
  assert.equal(action.action_type, 'STATUS_OVERRIDE');
  const payload = JSON.parse(action.action_payload);
  assert.equal(payload.previous_value, ApplicationStatus.UNKNOWN);
  assert.equal(payload.new_value, ApplicationStatus.REJECTED);
  db.close();
});

test('mergeApplications moves events and archives source', () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const userId = insertUser(db);

  const sourceId = insertApplication(db, {
    userId,
    company: 'Orbit',
    role: 'Designer',
    status: ApplicationStatus.APPLIED,
    appliedAt: new Date(Date.now() - 100000).toISOString(),
    lastActivityAt: new Date(Date.now() - 50000).toISOString()
  });
  const targetId = insertApplication(db, {
    userId,
    company: 'Orbit',
    role: 'Designer',
    status: ApplicationStatus.UNDER_REVIEW,
    appliedAt: new Date(Date.now() - 200000).toISOString(),
    lastActivityAt: new Date(Date.now() - 100000).toISOString()
  });

  insertEmailEvent(db, { userId, applicationId: sourceId, messageId: 'msg-1' });
  insertEmailEvent(db, { userId, applicationId: sourceId, messageId: 'msg-2' });

  const result = mergeApplications(db, { userId, sourceId, targetId });
  assert.equal(result.status, 'ok');
  assert.equal(result.movedEvents, 2);

  const moved = db
    .prepare('SELECT COUNT(*) as count FROM email_events WHERE application_id = ?')
    .get(targetId).count;
  assert.equal(moved, 2);

  const source = db.prepare('SELECT archived FROM job_applications WHERE id = ?').get(sourceId);
  assert.equal(source.archived, 1);

  const action = db
    .prepare('SELECT action_type, action_payload FROM user_actions WHERE application_id = ?')
    .get(targetId);
  assert.equal(action.action_type, 'MERGE_APPLICATION');
  const payload = JSON.parse(action.action_payload);
  assert.equal(payload.source_id, sourceId);
  assert.equal(payload.target_id, targetId);
  assert.equal(payload.moved_events, 2);
  db.close();
});
