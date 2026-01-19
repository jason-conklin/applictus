const crypto = require('crypto');
const { ApplicationStatus } = require('../../shared/types');
const {
  extractThreadIdentity,
  isProviderName,
  isInvalidCompanyCandidate,
  normalizeExternalReqId
} = require('../../shared/matching');

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
const MIN_ROLE_CONFIDENCE = 0.8;

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

function getExternalReqId(event) {
  if (!event) {
    return null;
  }
  const value = event.external_req_id ?? event.externalReqId ?? null;
  return normalizeExternalReqId(value);
}

function getRoleConfidence(value) {
  return Number.isFinite(value) ? value : null;
}

function getRoleFromEvent(event) {
  if (!event) {
    return null;
  }
  const title = event.role_title ?? event.roleTitle ?? null;
  if (!title) {
    return null;
  }
  return {
    title,
    confidence: getRoleConfidence(event.role_confidence ?? event.roleConfidence),
    source: event.role_source ?? event.roleSource ?? null,
    explanation: event.role_explanation ?? event.roleExplanation ?? null
  };
}

function selectRoleCandidate(identity, event) {
  const eventRole = getRoleFromEvent(event);
  if (eventRole?.title && (eventRole.confidence ?? 0) >= MIN_ROLE_CONFIDENCE) {
    return {
      title: eventRole.title,
      confidence: eventRole.confidence,
      source: eventRole.source || 'snippet',
      explanation: eventRole.explanation || 'Derived role from email.'
    };
  }
  if (identity?.jobTitle) {
    return {
      title: identity.jobTitle,
      confidence: getRoleConfidence(identity.roleConfidence),
      source: 'subject',
      explanation: 'Derived role from subject pattern.'
    };
  }
  return null;
}

function selectCompanyCandidate(identity) {
  if (!identity?.companyName) {
    return null;
  }
  return {
    name: identity.companyName,
    confidence: Number.isFinite(identity.companyConfidence) ? identity.companyConfidence : null,
    source: 'email',
    explanation: identity.explanation || 'Derived company from email.'
  };
}

function shouldUpdateCompany(application, candidate) {
  if (!candidate?.name) {
    return false;
  }
  if (application.company_source === 'manual') {
    return false;
  }
  const currentName = application.company_name || application.company || null;
  const currentConfidence = Number.isFinite(application.company_confidence)
    ? application.company_confidence
    : 0;
  const nextConfidence = Number.isFinite(candidate.confidence) ? candidate.confidence : 0;
  const currentInvalid =
    !currentName || isProviderName(currentName) || isInvalidCompanyCandidate(currentName);

  if (currentInvalid) {
    return true;
  }
  if (candidate.name === currentName) {
    return nextConfidence > currentConfidence;
  }
  return nextConfidence > currentConfidence + 0.05;
}

function applyCompanyCandidate(db, application, candidate) {
  if (!shouldUpdateCompany(application, candidate)) {
    return false;
  }
  db.prepare(
    `UPDATE job_applications
     SET company_name = ?, company = ?, company_confidence = ?, company_source = ?, company_explanation = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    candidate.name,
    candidate.name,
    Number.isFinite(candidate.confidence) ? candidate.confidence : null,
    candidate.source || null,
    candidate.explanation || null,
    new Date().toISOString(),
    application.id
  );
  return true;
}

function shouldUpdateRole(application, candidate) {
  if (!candidate?.title) {
    return false;
  }
  if (application.role_source === 'manual') {
    return false;
  }
  const currentTitle = application.job_title || application.role || null;
  const currentConfidence = Number.isFinite(application.role_confidence)
    ? application.role_confidence
    : 0;
  const nextConfidence = Number.isFinite(candidate.confidence) ? candidate.confidence : 0;
  if (!currentTitle || currentTitle === UNKNOWN_ROLE) {
    return true;
  }
  if (candidate.title === currentTitle) {
    return nextConfidence > currentConfidence;
  }
  return nextConfidence > currentConfidence + 0.05;
}

function applyRoleCandidate(db, application, candidate) {
  if (!shouldUpdateRole(application, candidate)) {
    return false;
  }
  db.prepare(
    `UPDATE job_applications
     SET job_title = ?, role = ?, role_confidence = ?, role_source = ?, role_explanation = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    candidate.title,
    candidate.title,
    Number.isFinite(candidate.confidence) ? candidate.confidence : null,
    candidate.source || null,
    candidate.explanation || null,
    new Date().toISOString(),
    application.id
  );
  return true;
}

function applyExternalReqId(db, application, externalReqId) {
  const normalized = normalizeExternalReqId(externalReqId);
  if (!normalized) {
    return false;
  }
  if (application.external_req_id) {
    return false;
  }
  db.prepare(
    `UPDATE job_applications
     SET external_req_id = ?, updated_at = ?
     WHERE id = ?`
  ).run(normalized, new Date().toISOString(), application.id);
  return true;
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

function findMatchingApplication(db, userId, identity, externalReqId) {
  if (!identity.companyName) {
    return null;
  }
  if (externalReqId) {
    return db
      .prepare(
        `SELECT * FROM job_applications
         WHERE user_id = ?
           AND (company_name = ? OR company = ?)
           AND external_req_id = ?
           AND archived = 0
         LIMIT 1`
      )
      .get(userId, identity.companyName, identity.companyName, externalReqId);
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

function findLooseMatchingApplication(db, userId, identity, externalReqId) {
  if (!identity.companyName) {
    return null;
  }
  if (externalReqId) {
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

function findCompanyMatches(db, userId, identity, senderDomain) {
  if (!identity.companyName) {
    return [];
  }
  if (senderDomain) {
    return db
      .prepare(
        `SELECT * FROM job_applications
         WHERE user_id = ?
           AND (company_name = ? OR company = ?)
           AND source = ?
           AND archived = 0`
      )
      .all(userId, identity.companyName, identity.companyName, senderDomain);
  }
  return db
    .prepare(
      `SELECT * FROM job_applications
       WHERE user_id = ?
         AND (company_name = ? OR company = ?)
         AND archived = 0`
    )
    .all(userId, identity.companyName, identity.companyName);
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
  const companyCandidate = selectCompanyCandidate(identity);
  const roleCandidate = selectRoleCandidate(identity, event);
  const externalReqId = getExternalReqId(event);
  const jobTitle = roleCandidate?.title || UNKNOWN_ROLE;

  const { status, statusConfidence, appliedAt } = inferInitialStatus(event, eventTimestamp);
  const statusExplanation =
    status === ApplicationStatus.APPLIED
      ? `Auto-applied from confirmation event ${event.id}.`
      : 'Auto-created with unknown status.';

  db.prepare(
    `INSERT INTO job_applications
      (id, user_id, company, role, status, status_source, company_name, company_confidence,
       company_source, company_explanation, job_title, job_location, source, external_req_id, applied_at,
       current_status, status_confidence, status_explanation, status_updated_at, role_confidence,
       role_source, role_explanation, last_activity_at, archived, user_override, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    identity.companyName,
    jobTitle,
    status,
    'inferred',
    identity.companyName,
    Number.isFinite(companyCandidate?.confidence) ? companyCandidate.confidence : null,
    companyCandidate?.source || null,
    companyCandidate?.explanation || null,
    jobTitle,
    null,
    identity.senderDomain,
    externalReqId,
    appliedAt,
    status,
    statusConfidence,
    statusExplanation,
    createdAt,
    Number.isFinite(roleCandidate?.confidence) ? roleCandidate.confidence : null,
    roleCandidate?.source || null,
    roleCandidate?.explanation || null,
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
    if (identity.isPlatformEmail) {
      if (identity.bodyTextAvailable) {
        return {
          reason: 'missing_identity',
          detail: 'Missing company (platform sender, signature/body parse failed).'
        };
      }
      return {
        reason: 'missing_identity',
        detail: 'Missing company (platform sender, body unavailable).'
      };
    }
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
  const externalReqId = getExternalReqId(event);
  const isRejection = event.detected_type === 'rejection';
  const roleForMatch = identity.jobTitle || event.role_title || null;
  let existing = null;
  let ambiguous = false;

  if (isRejection) {
    if (externalReqId) {
      existing = findMatchingApplication(db, userId, identity, externalReqId);
    }
    if (!existing && roleForMatch) {
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
          roleForMatch,
          roleForMatch
        );
      if (matches.length === 1) {
        existing = matches[0];
      } else if (matches.length > 1) {
        ambiguous = true;
      }
    }
    if (!existing && !ambiguous) {
      const domainMatches = identity.senderDomain
        ? findCompanyMatches(db, userId, identity, identity.senderDomain)
        : [];
      if (domainMatches.length === 1) {
        existing = domainMatches[0];
      } else if (domainMatches.length > 1) {
        ambiguous = true;
      }
    }
    if (!existing && !ambiguous) {
      const companyMatches = findCompanyMatches(db, userId, identity, null);
      if (companyMatches.length === 1) {
        existing = companyMatches[0];
      } else if (companyMatches.length > 1) {
        ambiguous = true;
      }
    }
    if (!existing && ambiguous) {
      return {
        action: 'unassigned',
        reason: 'ambiguous_match',
        reasonDetail: 'Multiple applications match this rejection email.',
        identity
      };
    }
  }

  if (!existing && matchConfidence >= MIN_MATCH_CONFIDENCE) {
    existing = findMatchingApplication(db, userId, identity, externalReqId);
    if (
      !existing &&
      !externalReqId &&
      AUTO_CREATE_TYPES.has(event.detected_type) &&
      identity.companyName &&
      (identity.companyConfidence || 0) >= MIN_COMPANY_CONFIDENCE &&
      getClassificationConfidence(event) >= MIN_CLASSIFICATION_CONFIDENCE
    ) {
      existing = findLooseMatchingApplication(db, userId, identity, externalReqId);
    }
  } else if (
    !existing &&
    !externalReqId &&
    AUTO_CREATE_TYPES.has(event.detected_type) &&
    identity.companyName &&
    (identity.companyConfidence || 0) >= MIN_COMPANY_CONFIDENCE &&
    getClassificationConfidence(event) >= MIN_CLASSIFICATION_CONFIDENCE
  ) {
    existing = findLooseMatchingApplication(db, userId, identity, externalReqId);
  }
  if (existing) {
    attachEventToApplication(db, event.id, existing.id);
    updateApplicationActivity(db, existing, event);
    applyCompanyCandidate(db, existing, selectCompanyCandidate(identity));
    applyRoleCandidate(db, existing, selectRoleCandidate(identity, event));
    applyExternalReqId(db, existing, externalReqId);
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
  toIsoFromInternalDate,
  applyRoleCandidate,
  selectRoleCandidate,
  applyCompanyCandidate,
  selectCompanyCandidate,
  applyExternalReqId
};
