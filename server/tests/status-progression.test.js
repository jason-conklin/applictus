const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const { matchAndAssignEvent } = require('../src/matching');
const { runStatusInferenceForApplication } = require('../src/statusInferenceRunner');
const { ApplicationStatus } = require('../../shared/types');
const { extractThreadIdentity } = require('../../shared/matching');
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

function insertEmailEvent(db, {
  userId,
  messageId,
  sender,
  subject,
  detectedType,
  confidenceScore,
  classificationConfidence,
  snippet
}) {
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  db.prepare(
    `INSERT INTO email_events
     (id, user_id, application_id, provider, message_id, provider_message_id, sender, subject, snippet,
      detected_type, confidence_score, classification_confidence, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    timestamp
  );
  return id;
}

test('matched rejection updates application status', async () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const userId = insertUser(db);

  const sender = 'no-reply@us.greenhouse-mail.io';
  const confirmationSubject = 'Thank you for applying to OrangeTwist';
  const confirmationId = insertEmailEvent(db, {
    userId,
    messageId: 'msg-confirm-1',
    sender,
    subject: confirmationSubject,
    detectedType: 'confirmation',
    confidenceScore: 0.92,
    classificationConfidence: 0.92,
    snippet: 'Thank you for applying to OrangeTwist.'
  });

  const confirmationMatch = await matchAndAssignEvent({
    db,
    userId,
    event: {
      id: confirmationId,
      sender,
      subject: confirmationSubject,
      snippet: 'Thank you for applying to OrangeTwist.',
      detected_type: 'confirmation',
      confidence_score: 0.92,
      classification_confidence: 0.92,
      created_at: new Date().toISOString()
    }
  });
  assert.equal(confirmationMatch.action, 'created_application');
  const appId = confirmationMatch.applicationId;

  const rejectionSubject = 'Update on your application to OrangeTwist';
  const rejectionId = insertEmailEvent(db, {
    userId,
    messageId: 'msg-reject-1',
    sender,
    subject: rejectionSubject,
    detectedType: 'rejection',
    confidenceScore: 0.95,
    classificationConfidence: 0.95,
    snippet: 'We will not be moving forward with your application.'
  });

  const rejectionMatch = await matchAndAssignEvent({
    db,
    userId,
    event: {
      id: rejectionId,
      sender,
      subject: rejectionSubject,
      snippet: 'We will not be moving forward with your application.',
      detected_type: 'rejection',
      confidence_score: 0.95,
      classification_confidence: 0.95,
      created_at: new Date().toISOString()
    }
  });
  assert.equal(rejectionMatch.action, 'matched_existing');

  runStatusInferenceForApplication(db, userId, appId);
  const updated = db.prepare('SELECT current_status FROM job_applications WHERE id = ?').get(appId);
  assert.equal(updated.current_status, ApplicationStatus.REJECTED);
  db.close();
});

test('LinkedIn confirmation and rejection lifecycle updates existing application to REJECTED', async () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const userId = insertUser(db);
  const sender = 'jobs-noreply@linkedin.com';

  const confirmationSubject = 'Jason, your application was sent to Concorde Research Technologies';
  const confirmationBody = `Jason, your application was sent to Concorde Research Technologies.
Software Engineer · Concorde Research Technologies · Remote
Applied on February 1, 2026`;
  const confirmationClassification = classifyEmail({
    subject: confirmationSubject,
    snippet: confirmationBody,
    sender,
    body: confirmationBody
  });
  assert.equal(confirmationClassification.detectedType, 'confirmation');

  const confirmationIdentity = extractThreadIdentity({
    subject: confirmationSubject,
    sender,
    bodyText: confirmationBody
  });
  assert.equal(confirmationIdentity.companyName, 'Concorde Research Technologies');
  assert.equal(confirmationIdentity.jobTitle, 'Software Engineer');

  const confirmationId = insertEmailEvent(db, {
    userId,
    messageId: 'msg-linkedin-confirm',
    sender,
    subject: confirmationSubject,
    detectedType: confirmationClassification.detectedType,
    confidenceScore: confirmationClassification.confidenceScore,
    classificationConfidence: confirmationClassification.confidenceScore,
    snippet: 'Your application was sent to Concorde Research Technologies.'
  });

  const confirmationMatch = await matchAndAssignEvent({
    db,
    userId,
    event: {
      id: confirmationId,
      sender,
      subject: confirmationSubject,
      snippet: 'Your application was sent to Concorde Research Technologies.',
      detected_type: confirmationClassification.detectedType,
      confidence_score: confirmationClassification.confidenceScore,
      classification_confidence: confirmationClassification.confidenceScore,
      role_title: confirmationIdentity.jobTitle,
      role_confidence: confirmationIdentity.roleConfidence,
      role_source: 'identity',
      created_at: new Date().toISOString()
    },
    identity: confirmationIdentity
  });
  assert.equal(confirmationMatch.action, 'created_application');
  const appId = confirmationMatch.applicationId;

  const rejectionSubject = 'Your application to Software Engineer at Concorde Research Technologies';
  const rejectionBody =
    'Your update from Concorde Research Technologies. Unfortunately, we will not be moving forward with your application at this time.';
  const rejectionClassification = classifyEmail({
    subject: rejectionSubject,
    snippet: rejectionBody,
    sender,
    body: rejectionBody
  });
  assert.equal(rejectionClassification.detectedType, 'rejection');
  assert.ok(rejectionClassification.confidenceScore >= 0.95);

  const rejectionIdentity = extractThreadIdentity({
    subject: rejectionSubject,
    sender,
    snippet: rejectionBody,
    bodyText: rejectionBody
  });
  assert.equal(rejectionIdentity.companyName, 'Concorde Research Technologies');
  assert.equal(rejectionIdentity.jobTitle, 'Software Engineer');

  const rejectionId = insertEmailEvent(db, {
    userId,
    messageId: 'msg-linkedin-reject',
    sender,
    subject: rejectionSubject,
    detectedType: rejectionClassification.detectedType,
    confidenceScore: rejectionClassification.confidenceScore,
    classificationConfidence: rejectionClassification.confidenceScore,
    snippet: rejectionBody
  });

  const rejectionMatch = await matchAndAssignEvent({
    db,
    userId,
    event: {
      id: rejectionId,
      sender,
      subject: rejectionSubject,
      snippet: rejectionBody,
      detected_type: rejectionClassification.detectedType,
      confidence_score: rejectionClassification.confidenceScore,
      classification_confidence: rejectionClassification.confidenceScore,
      role_title: rejectionIdentity.jobTitle,
      role_confidence: rejectionIdentity.roleConfidence,
      role_source: 'identity',
      created_at: new Date().toISOString()
    },
    identity: rejectionIdentity
  });
  assert.equal(rejectionMatch.action, 'matched_existing');
  assert.equal(rejectionMatch.applicationId, appId);

  runStatusInferenceForApplication(db, userId, appId);
  const updated = db.prepare('SELECT current_status FROM job_applications WHERE id = ?').get(appId);
  assert.equal(updated.current_status, ApplicationStatus.REJECTED);
  db.close();
});

test('re-evaluated LinkedIn rejection event can update an existing non-rejection event to REJECTED', async () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const userId = insertUser(db);
  const sender = 'jobs-noreply@linkedin.com';

  const confirmationSubject = 'Jason, your application was sent to Concorde Research Technologies';
  const confirmationBody = `Jason, your application was sent to Concorde Research Technologies.
Software Engineer · Concorde Research Technologies · Remote
Applied on February 1, 2026`;
  const confirmationIdentity = extractThreadIdentity({
    subject: confirmationSubject,
    sender,
    bodyText: confirmationBody
  });
  const confirmationId = insertEmailEvent(db, {
    userId,
    messageId: 'msg-linkedin-reprocess-confirm',
    sender,
    subject: confirmationSubject,
    detectedType: 'confirmation',
    confidenceScore: 0.92,
    classificationConfidence: 0.92,
    snippet: 'Your application was sent to Concorde Research Technologies.'
  });
  const confirmationMatch = await matchAndAssignEvent({
    db,
    userId,
    event: {
      id: confirmationId,
      sender,
      subject: confirmationSubject,
      snippet: 'Your application was sent to Concorde Research Technologies.',
      detected_type: 'confirmation',
      confidence_score: 0.92,
      classification_confidence: 0.92,
      role_title: confirmationIdentity.jobTitle,
      role_confidence: confirmationIdentity.roleConfidence,
      role_source: 'identity',
      created_at: new Date().toISOString()
    },
    identity: confirmationIdentity
  });
  assert.equal(confirmationMatch.action, 'created_application');
  const appId = confirmationMatch.applicationId;

  const rejectionSubject = 'Your application to Software Engineer at Concorde Research Technologies';
  const rejectionUpdateOnlySnippet = 'Your update from Concorde Research Technologies.';
  const rejectionIdentity = extractThreadIdentity({
    subject: rejectionSubject,
    sender,
    snippet: rejectionUpdateOnlySnippet,
    bodyText: rejectionUpdateOnlySnippet
  });

  const rejectionId = insertEmailEvent(db, {
    userId,
    messageId: 'msg-linkedin-reprocess-reject',
    sender,
    subject: rejectionSubject,
    detectedType: 'other_job_related',
    confidenceScore: 0.8,
    classificationConfidence: 0.8,
    snippet: rejectionUpdateOnlySnippet
  });

  await matchAndAssignEvent({
    db,
    userId,
    event: {
      id: rejectionId,
      sender,
      subject: rejectionSubject,
      snippet: rejectionUpdateOnlySnippet,
      detected_type: 'other_job_related',
      confidence_score: 0.8,
      classification_confidence: 0.8,
      role_title: rejectionIdentity.jobTitle,
      role_confidence: rejectionIdentity.roleConfidence,
      role_source: 'identity',
      created_at: new Date().toISOString()
    },
    identity: rejectionIdentity
  });

  runStatusInferenceForApplication(db, userId, appId);
  const before = db.prepare('SELECT current_status FROM job_applications WHERE id = ?').get(appId);
  assert.notEqual(before.current_status, ApplicationStatus.REJECTED);

  const reprocessedSnippet =
    'Your update from Concorde Research Technologies. Unfortunately, we will not be moving forward with your application at this time.';
  db.prepare(
    `UPDATE email_events
     SET detected_type = ?, confidence_score = ?, classification_confidence = ?, snippet = ?
     WHERE id = ?`
  ).run('rejection', 0.97, 0.97, reprocessedSnippet, rejectionId);

  const reprocessedMatch = await matchAndAssignEvent({
    db,
    userId,
    event: {
      id: rejectionId,
      sender,
      subject: rejectionSubject,
      snippet: reprocessedSnippet,
      detected_type: 'rejection',
      confidence_score: 0.97,
      classification_confidence: 0.97,
      role_title: rejectionIdentity.jobTitle,
      role_confidence: rejectionIdentity.roleConfidence,
      role_source: 'identity',
      created_at: new Date().toISOString()
    },
    identity: rejectionIdentity
  });
  assert.equal(reprocessedMatch.action, 'matched_existing');
  assert.equal(reprocessedMatch.applicationId, appId);

  runStatusInferenceForApplication(db, userId, appId);
  const after = db.prepare('SELECT current_status FROM job_applications WHERE id = ?').get(appId);
  assert.equal(after.current_status, ApplicationStatus.REJECTED);
  db.close();
});

test('user override prevents auto-rejection', async () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const userId = insertUser(db);

  const sender = 'no-reply@us.greenhouse-mail.io';
  const confirmationSubject = 'Thank you for applying to OrangeTwist';
  const confirmationId = insertEmailEvent(db, {
    userId,
    messageId: 'msg-confirm-2',
    sender,
    subject: confirmationSubject,
    detectedType: 'confirmation',
    confidenceScore: 0.92,
    classificationConfidence: 0.92,
    snippet: 'Thank you for applying to OrangeTwist.'
  });

  const confirmationMatch = await matchAndAssignEvent({
    db,
    userId,
    event: {
      id: confirmationId,
      sender,
      subject: confirmationSubject,
      snippet: 'Thank you for applying to OrangeTwist.',
      detected_type: 'confirmation',
      confidence_score: 0.92,
      classification_confidence: 0.92,
      created_at: new Date().toISOString()
    }
  });
  assert.equal(confirmationMatch.action, 'created_application');
  const appId = confirmationMatch.applicationId;

  db.prepare(
    'UPDATE job_applications SET user_override = 1, status_source = ? WHERE id = ?'
  ).run('user', appId);

  const rejectionSubject = 'Update on your application to OrangeTwist';
  const rejectionId = insertEmailEvent(db, {
    userId,
    messageId: 'msg-reject-2',
    sender,
    subject: rejectionSubject,
    detectedType: 'rejection',
    confidenceScore: 0.95,
    classificationConfidence: 0.95,
    snippet: 'We will not be moving forward with your application.'
  });

  await matchAndAssignEvent({
    db,
    userId,
    event: {
      id: rejectionId,
      sender,
      subject: rejectionSubject,
      snippet: 'We will not be moving forward with your application.',
      detected_type: 'rejection',
      confidence_score: 0.95,
      classification_confidence: 0.95,
      created_at: new Date().toISOString()
    }
  });

  runStatusInferenceForApplication(db, userId, appId);
  const updated = db
    .prepare('SELECT current_status, user_override, suggested_status FROM job_applications WHERE id = ?')
    .get(appId);
  assert.equal(updated.current_status, ApplicationStatus.APPLIED);
  assert.equal(updated.user_override, 1);
  assert.equal(updated.suggested_status, null);
  db.close();
});

test('rejection with role matches correct application and applies status', async () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const userId = insertUser(db);

  const sender = 'no-reply@embrace.com';
  const confirmationSubject = 'Thank you for applying';
  const confirmationSnippet =
    'Thank you for applying to the Outreach Coordinator/Marketer position at Embrace Psychiatric Wellness Center.';
  const confirmationId = insertEmailEvent(db, {
    userId,
    messageId: 'msg-confirm-3',
    sender,
    subject: confirmationSubject,
    detectedType: 'confirmation',
    confidenceScore: 0.92,
    classificationConfidence: 0.92,
    snippet: confirmationSnippet
  });

  const confirmationMatch = await matchAndAssignEvent({
    db,
    userId,
    event: {
      id: confirmationId,
      sender,
      subject: confirmationSubject,
      snippet: confirmationSnippet,
      detected_type: 'confirmation',
      confidence_score: 0.92,
      classification_confidence: 0.92,
      created_at: new Date().toISOString()
    }
  });
  assert.equal(confirmationMatch.action, 'created_application');

  const rejectionSubject = 'Application update';
  const rejectionSnippet =
    'Thank you for applying to the Outreach Coordinator/Marketer position at Embrace Psychiatric Wellness Center. Unfortunately, Embrace Psychiatric Wellness Center has moved to the next step in their hiring process, and your application was not selected at this time.';
  const rejectionId = insertEmailEvent(db, {
    userId,
    messageId: 'msg-reject-3',
    sender,
    subject: rejectionSubject,
    detectedType: 'rejection',
    confidenceScore: 0.95,
    classificationConfidence: 0.95,
    snippet: rejectionSnippet
  });

  const rejectionMatch = await matchAndAssignEvent({
    db,
    userId,
    event: {
      id: rejectionId,
      sender,
      subject: rejectionSubject,
      snippet: rejectionSnippet,
      detected_type: 'rejection',
      confidence_score: 0.95,
      classification_confidence: 0.95,
      created_at: new Date().toISOString()
    }
  });
  assert.equal(rejectionMatch.action, 'matched_existing');

  runStatusInferenceForApplication(db, userId, confirmationMatch.applicationId);
  const updated = db
    .prepare('SELECT current_status FROM job_applications WHERE id = ?')
    .get(confirmationMatch.applicationId);
  assert.equal(updated.current_status, ApplicationStatus.REJECTED);
  db.close();
});

test('rejection without role is ambiguous when multiple apps exist', async () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const userId = insertUser(db);

  const sender = 'no-reply@embrace.com';
  const confirmationSubject = 'Thank you for applying';
  const confirmSnippetA =
    'Thank you for applying to the Outreach Coordinator/Marketer position at Embrace Psychiatric Wellness Center.';
  const confirmSnippetB =
    'Thank you for applying to the Program Assistant position at Embrace Psychiatric Wellness Center.';

  const confirmAId = insertEmailEvent(db, {
    userId,
    messageId: 'msg-confirm-4',
    sender,
    subject: confirmationSubject,
    detectedType: 'confirmation',
    confidenceScore: 0.92,
    classificationConfidence: 0.92,
    snippet: confirmSnippetA
  });
  const confirmBId = insertEmailEvent(db, {
    userId,
    messageId: 'msg-confirm-5',
    sender,
    subject: confirmationSubject,
    detectedType: 'confirmation',
    confidenceScore: 0.92,
    classificationConfidence: 0.92,
    snippet: confirmSnippetB
  });

  await matchAndAssignEvent({
    db,
    userId,
    event: {
      id: confirmAId,
      sender,
      subject: confirmationSubject,
      snippet: confirmSnippetA,
      detected_type: 'confirmation',
      confidence_score: 0.92,
      classification_confidence: 0.92,
      created_at: new Date().toISOString()
    }
  });
  await matchAndAssignEvent({
    db,
    userId,
    event: {
      id: confirmBId,
      sender,
      subject: confirmationSubject,
      snippet: confirmSnippetB,
      detected_type: 'confirmation',
      confidence_score: 0.92,
      classification_confidence: 0.92,
      created_at: new Date().toISOString()
    }
  });

  const rejectionSubject = 'Application update';
  const rejectionSnippet =
    'Embrace Psychiatric Wellness Center has moved to the next step in their hiring process, and your application was not selected.';
  const rejectionId = insertEmailEvent(db, {
    userId,
    messageId: 'msg-reject-4',
    sender,
    subject: rejectionSubject,
    detectedType: 'rejection',
    confidenceScore: 0.95,
    classificationConfidence: 0.95,
    snippet: rejectionSnippet
  });

  const rejectionMatch = await matchAndAssignEvent({
    db,
    userId,
    event: {
      id: rejectionId,
      sender,
      subject: rejectionSubject,
      snippet: rejectionSnippet,
      detected_type: 'rejection',
      confidence_score: 0.95,
      classification_confidence: 0.95,
      created_at: new Date().toISOString()
    }
  });
  assert.equal(rejectionMatch.action, 'unassigned');
  assert.equal(rejectionMatch.reason, 'ambiguous_match_rejection');

  const attached = db
    .prepare('SELECT application_id FROM email_events WHERE id = ?')
    .get(rejectionId);
  assert.equal(attached.application_id, null);
  db.close();
});

test('rejection-only email creates application as REJECTED', async () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const userId = insertUser(db);

  const sender = 'no-reply@embrace.com';
  const rejectionSubject = 'Application update';
  const rejectionSnippet =
    'Thank you for applying to the Outreach Coordinator/Marketer position at Embrace Psychiatric Wellness Center. Unfortunately, Embrace Psychiatric Wellness Center has moved to the next step in their hiring process, and your application was not selected at this time.';
  const rejectionId = insertEmailEvent(db, {
    userId,
    messageId: 'msg-reject-5',
    sender,
    subject: rejectionSubject,
    detectedType: 'rejection',
    confidenceScore: 0.96,
    classificationConfidence: 0.96,
    snippet: rejectionSnippet
  });

  const rejectionMatch = await matchAndAssignEvent({
    db,
    userId,
    event: {
      id: rejectionId,
      sender,
      subject: rejectionSubject,
      snippet: rejectionSnippet,
      detected_type: 'rejection',
      confidence_score: 0.96,
      classification_confidence: 0.96,
      created_at: new Date().toISOString()
    }
  });

  assert.equal(rejectionMatch.action, 'created_application');
  const appId = rejectionMatch.applicationId;
  const app = db
    .prepare('SELECT current_status FROM job_applications WHERE id = ?')
    .get(appId);
  assert.equal(app.current_status, ApplicationStatus.REJECTED);
  db.close();
});
