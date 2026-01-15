const crypto = require('crypto');
const { ApplicationStatus } = require('../../shared/types');
const { extractThreadIdentity } = require('../../shared/matching');

const AUTO_CREATE_TYPES = new Set([
  'confirmation',
  'interview',
  'offer',
  'rejection',
  'under_review'
]);
const UNKNOWN_ROLE = 'Unknown role';

function toIsoFromInternalDate(internalDate, fallback = new Date()) {
  if (!internalDate) {
    return fallback.toISOString();
  }
  const date = new Date(Number(internalDate));
  if (Number.isNaN(date.getTime())) {
    return fallback.toISOString();
  }
  return date.toISOString();
}

function inferInitialStatus(event, eventTimestamp) {
  const timestamp = eventTimestamp || toIsoFromInternalDate(event.internal_date, new Date(event.created_at));
  const isApplied = event.detected_type === 'confirmation' && event.confidence_score >= 0.9;
  return {
    status: isApplied ? ApplicationStatus.APPLIED : ApplicationStatus.UNKNOWN,
    statusConfidence: isApplied ? event.confidence_score : null,
    appliedAt: isApplied ? timestamp : null
  };
}

function shouldAutoCreate(event, identity) {
  if (!event || !identity) {
    return false;
  }
  if (!AUTO_CREATE_TYPES.has(event.detected_type)) {
    return false;
  }
  if ((identity.companyConfidence || 0) < 0.9) {
    return false;
  }
  const threadConfidence = Math.min(identity.matchConfidence || 0, event.confidence_score || 0);
  if (threadConfidence < 0.9) {
    return false;
  }
  return true;
}

function findMatchingApplication(db, userId, identity) {
  if (!identity.companyName || !identity.senderDomain) {
    return null;
  }
  if (identity.jobTitle) {
    return db
      .prepare(
        `SELECT * FROM job_applications
         WHERE user_id = ?
           AND company_name = ?
           AND job_title = ?
           AND source = ?
           AND archived = 0
         LIMIT 1`
      )
      .get(userId, identity.companyName, identity.jobTitle, identity.senderDomain);
  }
  const matches = db
    .prepare(
      `SELECT * FROM job_applications
       WHERE user_id = ?
         AND company_name = ?
         AND source = ?
         AND archived = 0`
    )
    .all(userId, identity.companyName, identity.senderDomain);
  if (matches.length === 1) {
    return matches[0];
  }
  return null;
}

function updateApplicationActivity(db, application, event) {
  const updates = {};
  const eventTimestamp = toIsoFromInternalDate(event.internal_date, new Date(event.created_at));

  if (!application.last_activity_at || eventTimestamp > application.last_activity_at) {
    updates.last_activity_at = eventTimestamp;
  }

  if (
    event.detected_type === 'confirmation' &&
    event.confidence_score >= 0.9 &&
    (!application.applied_at || eventTimestamp < application.applied_at)
  ) {
    updates.applied_at = eventTimestamp;
  }

  if (Object.keys(updates).length) {
    updates.updated_at = new Date().toISOString();
    const keys = Object.keys(updates);
    const setClause = keys.map((key) => `${key} = ?`).join(', ');
    const values = keys.map((key) => updates[key]);
    values.push(application.id);
    db.prepare(`UPDATE job_applications SET ${setClause} WHERE id = ?`).run(...values);
  }
}

function createApplicationFromEvent(db, userId, identity, event) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const eventTimestamp = toIsoFromInternalDate(event.internal_date, new Date(event.created_at));
  const jobTitle = identity.jobTitle || UNKNOWN_ROLE;

  const { status, statusConfidence, appliedAt } = inferInitialStatus(event, eventTimestamp);
  const statusExplanation =
    status === ApplicationStatus.APPLIED
      ? `Auto-applied from confirmation event ${event.id}.`
      : 'Auto-created with unknown status.';

  db.prepare(
    `INSERT INTO job_applications
      (id, user_id, company, role, status, status_source, company_name, job_title, job_location,
       source, applied_at, current_status, status_confidence, status_explanation, status_updated_at,
       last_activity_at, archived, user_override, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    identity.companyName,
    jobTitle,
    status,
    'inferred',
    identity.companyName,
    jobTitle,
    null,
    identity.senderDomain,
    appliedAt,
    status,
    statusConfidence,
    statusExplanation,
    createdAt,
    eventTimestamp,
    0,
    0,
    createdAt,
    createdAt
  );

  return db.prepare('SELECT * FROM job_applications WHERE id = ?').get(id);
}

function attachEventToApplication(db, eventId, applicationId) {
  db.prepare('UPDATE email_events SET application_id = ? WHERE id = ?').run(applicationId, eventId);
}

function matchAndAssignEvent({ db, userId, event }) {
  const identity = extractThreadIdentity({ subject: event.subject, sender: event.sender });
  if (!identity.companyName || !identity.senderDomain) {
    return { action: 'unassigned', reason: 'missing_identity', identity };
  }

  if (identity.matchConfidence < 0.9) {
    return { action: 'unassigned', reason: 'low_confidence', identity };
  }

  const existing = findMatchingApplication(db, userId, identity);
  if (existing) {
    attachEventToApplication(db, event.id, existing.id);
    updateApplicationActivity(db, existing, event);
    return { action: 'matched_existing', applicationId: existing.id, identity };
  }

  if (!shouldAutoCreate(event, identity)) {
    return { action: 'unassigned', reason: 'not_confident_for_create', identity };
  }

  const application = createApplicationFromEvent(db, userId, identity, event);
  attachEventToApplication(db, event.id, application.id);
  return { action: 'created_application', applicationId: application.id, identity };
}

module.exports = {
  matchAndAssignEvent,
  extractThreadIdentity,
  shouldAutoCreate,
  inferInitialStatus,
  toIsoFromInternalDate
};
