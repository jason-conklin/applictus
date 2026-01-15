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
const MIN_COMPANY_CONFIDENCE = 0.85;
const MIN_CLASSIFICATION_CONFIDENCE = 0.85;
const MIN_MATCH_CONFIDENCE = 0.85;
const MIN_DOMAIN_CONFIDENCE = 0.4;

function getClassificationConfidence(event) {
  if (!event) {
    return 0;
  }
  const value =
    event.classification_confidence ??
    event.confidence_score ??
    event.confidenceScore ??
    event.confidence;
  return Number.isFinite(value) ? value : 0;
}

function formatConfidence(value) {
  const numeric = Number.isFinite(value) ? value : 0;
  return numeric.toFixed(2);
}

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
  const classificationConfidence = getClassificationConfidence(event);
  const isApplied = event.detected_type === 'confirmation' && classificationConfidence >= 0.9;
  return {
    status: isApplied ? ApplicationStatus.APPLIED : ApplicationStatus.UNKNOWN,
    statusConfidence: isApplied ? classificationConfidence : null,
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
  const classificationConfidence = getClassificationConfidence(event);
  if (classificationConfidence < MIN_CLASSIFICATION_CONFIDENCE) {
    return false;
  }
  if (!identity.companyName) {
    return false;
  }
  if ((identity.companyConfidence || 0) < MIN_COMPANY_CONFIDENCE) {
    return false;
  }
  const domainConfidence = identity.domainConfidence || 0;
  if (!identity.isAtsDomain && domainConfidence < MIN_DOMAIN_CONFIDENCE) {
    return false;
  }
  return true;
}

function findMatchingApplication(db, userId, identity) {
  if (!identity.companyName) {
    return null;
  }
  if (identity.senderDomain && identity.jobTitle) {
    return db
      .prepare(
        `SELECT * FROM job_applications
         WHERE user_id = ?
           AND (company_name = ? OR company = ?)
           AND (job_title = ? OR role = ?)
           AND source = ?
           AND archived = 0
         LIMIT 1`
      )
      .get(
        userId,
        identity.companyName,
        identity.companyName,
        identity.jobTitle,
        identity.jobTitle,
        identity.senderDomain
      );
  }
  if (identity.senderDomain) {
    const matches = db
      .prepare(
        `SELECT * FROM job_applications
         WHERE user_id = ?
           AND (company_name = ? OR company = ?)
           AND source = ?
           AND archived = 0`
      )
      .all(userId, identity.companyName, identity.companyName, identity.senderDomain);
    if (matches.length === 1) {
      return matches[0];
    }
    return null;
  }
  if (identity.jobTitle) {
    const matches = db
      .prepare(
        `SELECT * FROM job_applications
         WHERE user_id = ?
           AND (company_name = ? OR company = ?)
           AND (job_title = ? OR role = ?)
           AND archived = 0`
      )
      .all(
        userId,
        identity.companyName,
        identity.companyName,
        identity.jobTitle,
        identity.jobTitle
      );
    if (matches.length === 1) {
      return matches[0];
    }
    return null;
  }
  const matches = db
    .prepare(
      `SELECT * FROM job_applications
       WHERE user_id = ?
         AND (company_name = ? OR company = ?)
         AND archived = 0`
    )
    .all(userId, identity.companyName, identity.companyName);
  if (matches.length === 1) {
    return matches[0];
  }
  return null;
}

function findLooseMatchingApplication(db, userId, identity) {
  if (!identity.companyName) {
    return null;
  }
  if (identity.jobTitle) {
    const match = db
      .prepare(
        `SELECT * FROM job_applications
         WHERE user_id = ?
           AND (company_name = ? OR company = ?)
           AND (job_title = ? OR role = ?)
           AND archived = 0
         ORDER BY COALESCE(last_activity_at, updated_at, created_at) DESC
         LIMIT 1`
      )
      .get(
        userId,
        identity.companyName,
        identity.companyName,
        identity.jobTitle,
        identity.jobTitle
      );
    return match || null;
  }
  const match = db
    .prepare(
      `SELECT * FROM job_applications
       WHERE user_id = ?
         AND (company_name = ? OR company = ?)
         AND archived = 0
       ORDER BY COALESCE(last_activity_at, updated_at, created_at) DESC
       LIMIT 1`
    )
    .get(userId, identity.companyName, identity.companyName);
  return match || null;
}

function updateApplicationActivity(db, application, event) {
  const updates = {};
  const eventTimestamp = toIsoFromInternalDate(event.internal_date, new Date(event.created_at));
  const classificationConfidence = getClassificationConfidence(event);

  if (!application.last_activity_at || eventTimestamp > application.last_activity_at) {
    updates.last_activity_at = eventTimestamp;
  }

  if (
    event.detected_type === 'confirmation' &&
    classificationConfidence >= 0.9 &&
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

function buildUnassignedReason(event, identity) {
  const classificationConfidence = getClassificationConfidence(event);
  const companyConfidence = identity.companyConfidence || 0;
  const domainConfidence = identity.domainConfidence || 0;
  const matchConfidence = identity.matchConfidence || 0;

  if (!identity.companyName) {
    return { reason: 'missing_identity', detail: 'Missing company.' };
  }
  if (companyConfidence < MIN_COMPANY_CONFIDENCE) {
    return {
      reason: 'low_confidence',
      detail: `Company confidence ${formatConfidence(companyConfidence)} (< ${formatConfidence(
        MIN_COMPANY_CONFIDENCE
      )}).`
    };
  }
  if (classificationConfidence < MIN_CLASSIFICATION_CONFIDENCE) {
    return {
      reason: 'not_confident_for_create',
      detail: `Classification confidence ${formatConfidence(
        classificationConfidence
      )} (< ${formatConfidence(MIN_CLASSIFICATION_CONFIDENCE)}).`
    };
  }
  if (!identity.isAtsDomain && domainConfidence < MIN_DOMAIN_CONFIDENCE) {
    return { reason: 'ambiguous_sender', detail: 'Ambiguous sender domain.' };
  }
  if (matchConfidence < MIN_MATCH_CONFIDENCE) {
    return {
      reason: 'low_confidence',
      detail: `Identity confidence ${formatConfidence(matchConfidence)} (< ${formatConfidence(
        MIN_MATCH_CONFIDENCE
      )}).`
    };
  }
  if (!AUTO_CREATE_TYPES.has(event.detected_type)) {
    return {
      reason: 'not_confident_for_create',
      detail: `Event type ${event.detected_type || 'unknown'} not eligible for auto-create.`
    };
  }
  return { reason: 'not_confident_for_create', detail: 'Not confident enough to auto-create.' };
}

function matchAndAssignEvent({ db, userId, event, identity: providedIdentity }) {
  const identity =
    providedIdentity ||
    extractThreadIdentity({ subject: event.subject, sender: event.sender, snippet: event.snippet });
  if (!identity.companyName) {
    const unassigned = buildUnassignedReason(event, identity);
    return { action: 'unassigned', reason: unassigned.reason, reasonDetail: unassigned.detail, identity };
  }

  const matchConfidence = identity.matchConfidence || 0;
  let existing = null;
  if (matchConfidence >= MIN_MATCH_CONFIDENCE) {
    existing = findMatchingApplication(db, userId, identity);
    if (
      !existing &&
      AUTO_CREATE_TYPES.has(event.detected_type) &&
      identity.companyName &&
      (identity.companyConfidence || 0) >= MIN_COMPANY_CONFIDENCE &&
      getClassificationConfidence(event) >= MIN_CLASSIFICATION_CONFIDENCE
    ) {
      existing = findLooseMatchingApplication(db, userId, identity);
    }
  } else if (
    AUTO_CREATE_TYPES.has(event.detected_type) &&
    identity.companyName &&
    (identity.companyConfidence || 0) >= MIN_COMPANY_CONFIDENCE &&
    getClassificationConfidence(event) >= MIN_CLASSIFICATION_CONFIDENCE
  ) {
    existing = findLooseMatchingApplication(db, userId, identity);
  }
  if (existing) {
    attachEventToApplication(db, event.id, existing.id);
    updateApplicationActivity(db, existing, event);
    return { action: 'matched_existing', applicationId: existing.id, identity };
  }

  if (!shouldAutoCreate(event, identity)) {
    const unassigned = buildUnassignedReason(event, identity);
    return { action: 'unassigned', reason: unassigned.reason, reasonDetail: unassigned.detail, identity };
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
