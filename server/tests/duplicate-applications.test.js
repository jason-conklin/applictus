const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const { matchAndAssignEvent } = require('../src/matching');
const {
  extractThreadIdentity,
  extractJobTitle,
  extractExternalReqId
} = require('../../shared/matching');

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

function insertEmailEvent(db, {
  userId,
  messageId,
  sender,
  subject,
  detectedType,
  confidenceScore,
  classificationConfidence,
  snippet,
  externalReqId
}) {
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

test('Workday confirmations with different requisitions create separate applications', () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const userId = insertUser(db);

  const sender = 'Workday <pru@myworkday.com>';
  const subject = 'Thank you for applying!';

  const bodyA =
    'Thank you for applying.\nPosition of Associate Software Engineer, R-122920\nBest Regards,\nRecruiting Team\nPrudential';
  const bodyB =
    'Thank you for applying.\nPosition of Software Engineer (Retirement Strategies), R-122404\nBest Regards,\nRecruiting Team\nPrudential';

  const identityA = extractThreadIdentity({ subject, sender, bodyText: bodyA });
  const identityB = extractThreadIdentity({ subject, sender, bodyText: bodyB });
  assert.equal(identityA.companyName, 'Prudential');
  assert.equal(identityB.companyName, 'Prudential');

  const roleA = extractJobTitle({ subject, snippet: '', bodyText: bodyA, sender, companyName: 'Prudential' });
  const roleB = extractJobTitle({ subject, snippet: '', bodyText: bodyB, sender, companyName: 'Prudential' });
  assert.equal(roleA.jobTitle, 'Associate Software Engineer');
  assert.equal(roleB.jobTitle, 'Software Engineer (Retirement Strategies)');

  const reqA = extractExternalReqId({ subject, snippet: '', bodyText: bodyA });
  const reqB = extractExternalReqId({ subject, snippet: '', bodyText: bodyB });
  assert.equal(reqA.externalReqId, 'R-122920');
  assert.equal(reqB.externalReqId, 'R-122404');

  const eventAId = insertEmailEvent(db, {
    userId,
    messageId: 'msg-a',
    sender,
    subject,
    detectedType: 'confirmation',
    confidenceScore: 0.92,
    classificationConfidence: 0.92,
    snippet: 'Thank you for applying.',
    externalReqId: reqA.externalReqId
  });

  const matchA = matchAndAssignEvent({
    db,
    userId,
    event: {
      id: eventAId,
      sender,
      subject,
      snippet: 'Thank you for applying.',
      detected_type: 'confirmation',
      confidence_score: 0.92,
      classification_confidence: 0.92,
      role_title: roleA.jobTitle,
      role_confidence: roleA.confidence,
      role_source: roleA.source,
      role_explanation: roleA.explanation,
      external_req_id: reqA.externalReqId,
      created_at: new Date().toISOString()
    },
    identity: identityA
  });
  assert.equal(matchA.action, 'created_application');

  const eventBId = insertEmailEvent(db, {
    userId,
    messageId: 'msg-b',
    sender,
    subject,
    detectedType: 'confirmation',
    confidenceScore: 0.92,
    classificationConfidence: 0.92,
    snippet: 'Thank you for applying.',
    externalReqId: reqB.externalReqId
  });

  const matchB = matchAndAssignEvent({
    db,
    userId,
    event: {
      id: eventBId,
      sender,
      subject,
      snippet: 'Thank you for applying.',
      detected_type: 'confirmation',
      confidence_score: 0.92,
      classification_confidence: 0.92,
      role_title: roleB.jobTitle,
      role_confidence: roleB.confidence,
      role_source: roleB.source,
      role_explanation: roleB.explanation,
      external_req_id: reqB.externalReqId,
      created_at: new Date().toISOString()
    },
    identity: identityB
  });
  assert.equal(matchB.action, 'created_application');

  const apps = db.prepare('SELECT id, external_req_id FROM job_applications').all();
  assert.equal(apps.length, 2);
  const reqIds = apps.map((row) => row.external_req_id).sort();
  assert.deepEqual(reqIds, ['R-122404', 'R-122920']);

  const eventRows = db
    .prepare('SELECT id, application_id FROM email_events WHERE id IN (?, ?)')
    .all(eventAId, eventBId);
  assert.equal(eventRows.length, 2);
  assert.notEqual(eventRows[0].application_id, eventRows[1].application_id);
});

test('Workday + corporate confirmations dedupe to one application and ignore greeting company', () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const userId = insertUser(db);

  const senderA = 'Careers <careers@trimble.com>';
  const subjectA = 'Thank you for your application to Trimble!';
  const snippetA = 'Thank you for your application to Trimble for Software Engineer.';
  const bodyA = 'Thank you for your application to Trimble for Software Engineer.';
  const identityA = extractThreadIdentity({ subject: subjectA, sender: senderA, snippet: snippetA, bodyText: bodyA });
  const roleA = extractJobTitle({
    subject: subjectA,
    snippet: snippetA,
    bodyText: bodyA,
    sender: senderA,
    companyName: identityA.companyName
  });
  const reqA = extractExternalReqId({ subject: subjectA, snippet: snippetA, bodyText: bodyA });

  const eventAId = insertEmailEvent(db, {
    userId,
    messageId: 'trimble-a',
    sender: senderA,
    subject: subjectA,
    detectedType: 'confirmation',
    confidenceScore: 0.92,
    classificationConfidence: 0.92,
    snippet: snippetA,
    externalReqId: reqA.externalReqId
  });

  const matchA = matchAndAssignEvent({
    db,
    userId,
    event: {
      id: eventAId,
      sender: senderA,
      subject: subjectA,
      snippet: snippetA,
      detected_type: 'confirmation',
      confidence_score: 0.92,
      classification_confidence: 0.92,
      role_title: roleA.jobTitle,
      role_confidence: roleA.confidence,
      role_source: roleA.source,
      role_explanation: roleA.explanation,
      external_req_id: reqA.externalReqId,
      created_at: new Date().toISOString()
    },
    identity: identityA
  });
  assert.equal(matchA.action, 'created_application');

  const senderB = 'Trimble Recruiting <trimble@myworkday.com>';
  const subjectB = 'Trimble Recruiting - Thank you for applying!';
  const bodyB = `
Jason, Thank you so much for applying to Trimble.
Business Process: Job Application: Jason Conklin - R-0001 Software Engineer on 01/20/2026
Best Regards,
Trimble Talent Acquisition
`;
  const identityB = extractThreadIdentity({ subject: subjectB, sender: senderB, bodyText: bodyB });
  assert.equal(identityB.companyName, 'Trimble');
  assert.ok(identityB.jobTitle && identityB.jobTitle.includes('Software Engineer'));

  const roleB = extractJobTitle({
    subject: subjectB,
    snippet: '',
    bodyText: bodyB,
    sender: senderB,
    companyName: identityB.companyName
  });
  const reqB = extractExternalReqId({ subject: subjectB, snippet: '', bodyText: bodyB });

  const eventBId = insertEmailEvent(db, {
    userId,
    messageId: 'trimble-b',
    sender: senderB,
    subject: subjectB,
    detectedType: 'confirmation',
    confidenceScore: 0.92,
    classificationConfidence: 0.92,
    snippet: 'Thank you for applying',
    externalReqId: reqB.externalReqId
  });

  const matchB = matchAndAssignEvent({
    db,
    userId,
    event: {
      id: eventBId,
      sender: senderB,
      subject: subjectB,
      snippet: 'Thank you for applying',
      detected_type: 'confirmation',
      confidence_score: 0.92,
      classification_confidence: 0.92,
      role_title: roleB.jobTitle,
      role_confidence: roleB.confidence,
      role_source: roleB.source,
      role_explanation: roleB.explanation,
      external_req_id: reqB.externalReqId,
      created_at: new Date().toISOString()
    },
    identity: identityB
  });

  assert.equal(matchB.action, 'matched_existing');

  const apps = db.prepare('SELECT id FROM job_applications').all();
  assert.equal(apps.length, 1);

  const events = db
    .prepare('SELECT application_id FROM email_events WHERE id IN (?, ?)')
    .all(eventAId, eventBId);
  assert.equal(events.length, 2);
  assert.ok(events[0].application_id === events[1].application_id);
});
