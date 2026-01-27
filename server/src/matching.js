const crypto = require('crypto');
const { ApplicationStatus } = require('../../shared/types');
const {
  extractThreadIdentity,
  isProviderName,
  isInvalidCompanyCandidate,
  normalizeExternalReqId,
  sanitizeJobTitle
} = require('../../shared/matching');
const { logDebug } = require('./logger');
const { TERMINAL_STATUSES, STATUS_PRIORITY } = require('../../shared/statusInference');

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
const DEDUPE_RECENCY_DAYS = 7;
const FUZZY_CONFIRMATION_WINDOW_HOURS = 24;

function extractSenderDomain(sender) {
  if (!sender) return null;
  const match = String(sender).match(/@([^> ]+)/);
  return match ? match[1].toLowerCase() : null;
}

function normalizeSlug(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeRoleSlug(text) {
  let cleaned = sanitizeJobTitle(text);
  if (!cleaned) return null;
  cleaned = cleaned
    .replace(/\bjr\.?\b/gi, 'junior')
    .replace(/\bsr\.?\b/gi, 'senior')
    .replace(/\bswe\b/gi, 'software engineer')
    .replace(/\bengineer\b/gi, 'engineer')
    .replace(/\bdev\b/gi, 'developer')
    .replace(/\bposition\b/gi, '')
    .replace(/\brole\b/gi, '')
    .replace(/\bjob\b/gi, '');
  return normalizeSlug(cleaned);
}

function roleTokens(slug) {
  if (!slug) return [];
  return slug.split(/\s+/).filter(Boolean);
}

function jaccardSimilarity(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const setA = new Set(aTokens);
  const setB = new Set(bTokens);
  let intersect = 0;
  for (const t of setA) {
    if (setB.has(t)) intersect += 1;
  }
  const union = setA.size + setB.size - intersect;
  if (union === 0) return 0;
  return intersect / union;
}

function normalizeLocation(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildConfirmationDedupeKey(identity, externalReqId, roleTitle = null) {
  if (!identity?.companyName) return null;
  const companySlug = normalizeSlug(identity.companyName);
  const roleSource = roleTitle || identity.jobTitle;
  const roleSlug =
    roleSource && roleSource !== UNKNOWN_ROLE ? normalizeSlug(roleSource) : null;
  const domainSlug = identity.senderDomain ? normalizeSlug(identity.senderDomain) : null;
  const reqSlug = externalReqId ? normalizeSlug(externalReqId) : null;
  if (!companySlug) return null;
  return { companySlug, roleSlug, domainSlug, reqSlug };
}

function findDedupeApplication(db, userId, dedupeKey, eventTimestamp) {
  if (!dedupeKey) return null;
  const since = new Date(eventTimestamp || Date.now());
  since.setDate(since.getDate() - DEDUPE_RECENCY_DAYS);
  const query = `SELECT * FROM job_applications
       WHERE user_id = ?
         AND company_name IS NOT NULL
         AND archived = 0
         AND last_activity_at >= ?`;
  const rows = db.prepare(query).all(userId, since.toISOString());

  const checkMatch = (app) => {
    const appCompany = normalizeSlug(app.company_name);
    if (!appCompany || appCompany !== dedupeKey.companySlug) {
      return false;
    }
    const appReq = app.external_req_id ? normalizeSlug(app.external_req_id) : null;
    if (dedupeKey.reqSlug) {
      if (appReq) {
        if (dedupeKey.reqSlug === appReq) {
          return true;
        }
        return false;
      }
      // app missing req id; fall through to role/company match
    }
    const appRole =
      app.job_title && app.job_title !== UNKNOWN_ROLE ? normalizeSlug(app.job_title) : null;
    if (dedupeKey.roleSlug && appRole && dedupeKey.roleSlug === appRole) {
      return true;
    }
    if (!dedupeKey.roleSlug || !appRole) {
      // allow match when one side lacks role but company matches
      return true;
    }
    return false;
  };

  for (const app of rows) {
    if (checkMatch(app)) return app;
  }

  // As a relaxed fallback (in case last_activity_at filtering or missing timestamps),
  // scan all non-archived applications for a matching company/role/req.
  const allRows = db
    .prepare(
      `SELECT * FROM job_applications
         WHERE user_id = ?
           AND company_name IS NOT NULL
           AND archived = 0`
    )
    .all(userId);
  for (const app of allRows) {
    if (checkMatch(app)) return app;
  }
  return null;
}

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

function shouldBlockAutoStatus(application, nextStatus, confidence) {
  const current = application.current_status || ApplicationStatus.UNKNOWN;
  if (application.user_override && nextStatus !== current) {
    return 'user_override';
  }
  if (TERMINAL_STATUSES.has(current) && nextStatus !== current) {
    if (
      current === ApplicationStatus.OFFER_RECEIVED &&
      nextStatus === ApplicationStatus.REJECTED
    ) {
      const currentConfidence = application.status_confidence || 0;
      if ((confidence || 0) >= currentConfidence) {
        return null;
      }
    }
    return 'terminal';
  }
  const currentOrder = STATUS_PRIORITY[current] || 0;
  const nextOrder = STATUS_PRIORITY[nextStatus] || 0;
  if (nextOrder < currentOrder) {
    return 'regression';
  }
  return null;
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
  const isRejected = event.detected_type === 'rejection' && classificationConfidence >= 0.9;
  if (isRejected) {
    return {
      status: ApplicationStatus.REJECTED,
      statusConfidence: classificationConfidence,
      appliedAt: null
    };
  }
  if (isApplied) {
    return {
      status: ApplicationStatus.APPLIED,
      statusConfidence: classificationConfidence,
      appliedAt: timestamp
    };
  }
  return {
    status: ApplicationStatus.UNKNOWN,
    statusConfidence: null,
    appliedAt: null
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
  if (
    !identity.isAtsDomain &&
    !identity.isPlatformEmail &&
    domainConfidence < MIN_DOMAIN_CONFIDENCE &&
    event.detected_type !== 'rejection'
  ) {
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

function findCompanyMatches(db, userId, identity, senderDomain, recencyDays = null) {
  if (!identity.companyName) {
    return [];
  }
  const baseQuery = [
    `SELECT * FROM job_applications`,
    `WHERE user_id = ?`,
    `AND (company_name = ? OR company = ?)`,
    senderDomain ? `AND source = ?` : null,
    `AND archived = 0`,
    recencyDays
      ? `AND COALESCE(last_activity_at, updated_at, created_at) >= date('now', ?)`
      : null
  ]
    .filter(Boolean)
    .join(' ');
  const params = [userId, identity.companyName, identity.companyName];
  if (senderDomain) {
    params.push(senderDomain);
  }
  if (recencyDays) {
    params.push(`-${recencyDays} days`);
  }
  return db.prepare(baseQuery).all(...params);
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
  const senderDomain = identity.senderDomain || extractSenderDomain(event.sender) || null;
  const base = senderDomain ? (senderDomain.split('@').pop() || senderDomain) : null;

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
    logDebug('matching.ambiguous_sender_domain', {
      senderDomain,
      baseDomain: base,
      isAtsDomain: identity.isAtsDomain,
      companyName: identity.companyName,
      companyConfidence,
      matchConfidence,
      subject: event.subject || null
    });
    return { reason: 'ambiguous_sender', detail: 'Ambiguous sender domain.' };
  }
  if (identity.isAtsDomain && !identity.companyName && !identity.bodyTextAvailable) {
    return {
      reason: 'missing_identity',
      detail: 'Missing company and body for ATS sender.'
    };
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
  const externalReqId = getExternalReqId(event);
  const roleForMatch = identity.jobTitle || event.role_title || null;
  const isConfirmation = event.detected_type === 'confirmation';

  const logDedupe = (label, payload) => {
    if (process.env.NODE_ENV === 'production') return;
    logDebug(label, payload);
  };

  const canonicalizeCompanyForConfirmation = () => {
    let candidate = identity.companyName;
    if (!candidate || isInvalidCompanyCandidate(candidate) || (identity.companyConfidence || 0) < MIN_COMPANY_CONFIDENCE) {
      const subject = String(event.subject || '');
      const subjectMatch =
        subject.match(/thank you for (?:your )?(?:application|applying) to\s+([A-Z][A-Za-z0-9 &'./-]{2,80})/i) ||
        subject.match(/^([A-Z][A-Za-z0-9 &'./-]{2,80})\s+recruiting\s+[-–—]\s+thank you for applying/i);
      if (subjectMatch && subjectMatch[1]) {
        candidate = subjectMatch[1].trim();
      }
    }
    if ((!candidate || isInvalidCompanyCandidate(candidate)) && identity.senderDomain) {
      const base = identity.senderDomain.split('.')[0] || '';
      if (base && !ATS_BASE_DOMAINS.has(base)) {
        candidate = base.charAt(0).toUpperCase() + base.slice(1);
      }
    }
    if (!candidate || isInvalidCompanyCandidate(candidate)) {
      return null;
    }
    return candidate;
  };

  const canonicalizeRole = () => {
    if (!roleForMatch) return null;
    const text = String(roleForMatch).trim();
    if (!text) return null;
    const cleaned = sanitizeJobTitle(text);
    return cleaned || text;
  };

  logDedupe('matching.confirmation_identity', {
    eventId: event.id,
    subject: event.subject,
    sender: event.sender,
    company: identity.companyName,
    companyConf: identity.companyConfidence,
    role: identity.jobTitle,
    roleConf: identity.roleConfidence,
    senderDomain: identity.senderDomain,
    explanation: identity.explanation
  });
  if (!identity.companyName) {
    if (isConfirmation && roleForMatch) {
      const recentRoleMatch = db
        .prepare(
          `SELECT * FROM job_applications
           WHERE user_id = ?
             AND archived = 0
             AND (job_title = ? OR role = ?)
             AND COALESCE(last_activity_at, updated_at, created_at) >= date('now', '-7 days')
           ORDER BY COALESCE(last_activity_at, updated_at, created_at) DESC
           LIMIT 1`
        )
        .get(userId, roleForMatch, roleForMatch);
      if (recentRoleMatch) {
        attachEventToApplication(db, event.id, recentRoleMatch.id);
        updateApplicationActivity(db, recentRoleMatch, event);
        applyRoleCandidate(db, recentRoleMatch, selectRoleCandidate(identity, event));
        applyExternalReqId(db, recentRoleMatch, externalReqId);
        logDebug('matching.dedupe_matched_recent_confirmation', {
          eventId: event.id,
          applicationId: recentRoleMatch.id,
          company: identity.companyName || null,
          role: roleForMatch || null,
          reqId: externalReqId || null,
          reason: 'role_only_recent'
        });
        return { action: 'matched_existing', applicationId: recentRoleMatch.id, identity };
      }
    }
    const unassigned = buildUnassignedReason(event, identity);
    return { action: 'unassigned', reason: unassigned.reason, reasonDetail: unassigned.detail, identity };
  }

  const matchConfidence = identity.matchConfidence || 0;
  const isRejection = event.detected_type === 'rejection';
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
        ? findCompanyMatches(db, userId, identity, identity.senderDomain, 60)
        : [];
      if (domainMatches.length === 1) {
        existing = domainMatches[0];
      } else if (domainMatches.length > 1) {
        ambiguous = true;
      }
    }
    if (!existing && !ambiguous) {
      const companyMatches = findCompanyMatches(db, userId, identity, null, 60);
      if (companyMatches.length === 1) {
        existing = companyMatches[0];
      } else if (companyMatches.length > 1) {
        ambiguous = true;
      }
    }
    if (!existing && ambiguous) {
      return {
        action: 'unassigned',
        reason: 'ambiguous_match_rejection',
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
    if (isRejection && getClassificationConfidence(event) >= 0.9) {
      const blocked = shouldBlockAutoStatus(
        existing,
        ApplicationStatus.REJECTED,
        getClassificationConfidence(event)
      );
      if (!blocked) {
        db.prepare(
          `UPDATE job_applications
             SET current_status = ?, status = ?, status_source = ?, status_confidence = ?, status_explanation = ?, status_updated_at = ?, last_activity_at = ?
           WHERE id = ?`
        ).run(
          ApplicationStatus.REJECTED,
          ApplicationStatus.REJECTED,
          'inferred',
          getClassificationConfidence(event),
          `Rejection detected from event ${event.id}.`,
          new Date().toISOString(),
          toIsoFromInternalDate(event.internal_date, new Date(event.created_at)),
          existing.id
        );
      }
    }
    return { action: 'matched_existing', applicationId: existing.id, identity };
  }

  if (!shouldAutoCreate(event, identity)) {
    const unassigned = buildUnassignedReason(event, identity);
    return { action: 'unassigned', reason: unassigned.reason, reasonDetail: unassigned.detail, identity };
  }

  if (event.detected_type === 'confirmation') {
    const canonicalCompany = canonicalizeCompanyForConfirmation();
    const dedupeIdentity =
      canonicalCompany && !isInvalidCompanyCandidate(canonicalCompany)
        ? { ...identity, companyName: canonicalCompany }
        : identity;
    const dedupeRole = canonicalizeRole() || roleForMatch;
    const dedupeKey = buildConfirmationDedupeKey(dedupeIdentity, null, dedupeRole);
    logDedupe('matching.confirmation_dedupe_start', {
      eventId: event.id,
      subject: event.subject,
      sender: event.sender,
      dedupeKey,
      canonicalCompany,
      dedupeRole
    });
    let candidate = findDedupeApplication(
      db,
      userId,
      dedupeKey,
      toIsoFromInternalDate(event.internal_date, new Date(event.created_at))
    );
    if (!candidate && dedupeKey) {
      // Relax domain requirement to catch ATS/corporate double confirmations
      candidate = findDedupeApplication(
        db,
        userId,
        { ...dedupeKey, domainSlug: null },
        toIsoFromInternalDate(event.internal_date, new Date(event.created_at))
      );
    }
    if (!candidate && dedupeKey && dedupeKey.companySlug && dedupeKey.roleSlug) {
      const rows = db
        .prepare(
          `SELECT * FROM job_applications
           WHERE user_id = ?
             AND archived = 0`
        )
        .all(userId);
      for (const app of rows) {
        const appCompany = normalizeSlug(app.company_name || app.company || '');
        const appRole = normalizeSlug(app.job_title || app.role || '');
        if (appCompany === dedupeKey.companySlug && appRole === dedupeKey.roleSlug) {
          candidate = app;
          break;
        }
      }
    }
    if (!candidate && dedupeKey && dedupeKey.companySlug && dedupeKey.roleSlug) {
      const direct = db
        .prepare(
          `SELECT * FROM job_applications
           WHERE user_id = ?
             AND archived = 0
             AND lower(replace(company_name, ' ', '')) = ?
             AND lower(replace(job_title, ' ', '')) = ?`
        )
        .get(userId, dedupeKey.companySlug, dedupeKey.roleSlug);
      if (direct) {
        candidate = direct;
      }
    }
    if (candidate) {
      attachEventToApplication(db, event.id, candidate.id);
      updateApplicationActivity(db, candidate, event);
      applyCompanyCandidate(db, candidate, selectCompanyCandidate(identity));
      applyRoleCandidate(db, candidate, selectRoleCandidate(identity, event));
      applyExternalReqId(db, candidate, externalReqId);
      logDebug('matching.dedupe_matched_recent_confirmation', {
        eventId: event.id,
        applicationId: candidate.id,
        company: identity.companyName || null,
        role: roleForMatch || null,
        reqId: externalReqId || null
      });
      return { action: 'matched_existing', applicationId: candidate.id, identity };
    }
    // Final cross-channel dedupe without domain constraint
    if (canonicalCompany && dedupeRole) {
      const companySlug = normalizeSlug(canonicalCompany);
      const roleSlug = normalizeSlug(dedupeRole);
      const recent = db
        .prepare(
          `SELECT * FROM job_applications
           WHERE user_id = ?
             AND archived = 0
             AND lower(replace(company_name, ' ', '')) = ?
             AND lower(replace(job_title, ' ', '')) = ?
             AND COALESCE(last_activity_at, updated_at, created_at) >= date('now', '-7 days')`
        )
        .all(userId, companySlug, roleSlug);
      logDedupe('matching.final_confirmation_dedupe', {
        eventId: event.id,
        canonicalCompany,
        canonicalRole: dedupeRole,
        candidates: recent.length
      });
      if (recent.length === 1) {
        const candidate = recent[0];
        attachEventToApplication(db, event.id, candidate.id);
        updateApplicationActivity(db, candidate, event);
        applyCompanyCandidate(db, candidate, selectCompanyCandidate(identity));
        applyRoleCandidate(db, candidate, selectRoleCandidate(identity, event));
        applyExternalReqId(db, candidate, externalReqId);
        return { action: 'matched_existing', applicationId: candidate.id, identity };
      }
    }
    if ((!identity.companyName || isInvalidCompanyCandidate(identity.companyName)) && dedupeRole && (identity.isAtsDomain || identity.isPlatformEmail)) {
      const roleSlug = normalizeSlug(dedupeRole);
      const recentRole = db
        .prepare(
          `SELECT * FROM job_applications
           WHERE user_id = ?
             AND archived = 0
             AND lower(replace(job_title, ' ', '')) = ?
             AND COALESCE(last_activity_at, updated_at, created_at) >= date('now', '-1 days')`
        )
        .all(userId, roleSlug);
      logDedupe('matching.role_only_confirmation_dedupe', {
        eventId: event.id,
        canonicalRole: dedupeRole,
        candidates: recentRole.length
      });
      if (recentRole.length === 1) {
        const candidate = recentRole[0];
        attachEventToApplication(db, event.id, candidate.id);
        updateApplicationActivity(db, candidate, event);
        applyCompanyCandidate(db, candidate, selectCompanyCandidate(identity));
        const roleCandidate = selectRoleCandidate(identity, event);
        const currentTitle = candidate.job_title || candidate.role || '';
        if (roleCandidate?.title && roleCandidate.title.length >= currentTitle.length) {
          applyRoleCandidate(db, candidate, roleCandidate);
        }
        applyExternalReqId(db, candidate, externalReqId);
        return { action: 'matched_existing', applicationId: candidate.id, identity };
      }
    }

    // Fuzzy cross-source confirmation dedupe (LinkedIn -> ATS)
    if (canonicalCompany) {
      const companySlug = normalizeSlug(canonicalCompany);
      const roleBase = dedupeRole || roleForMatch || identity.jobTitle || event.role_title || null;
      const incomingRoleSlug = normalizeRoleSlug(roleBase);
      const incomingTokens = roleTokens(incomingRoleSlug);
      const classificationConfidence = getClassificationConfidence(event);
      const companyConf = identity.companyConfidence || 0;
      if (companySlug && incomingRoleSlug && incomingTokens.length) {
        const since = new Date(Date.now() - FUZZY_CONFIRMATION_WINDOW_HOURS * 3600000).toISOString();
        const candidates = db
          .prepare(
            `SELECT * FROM job_applications
             WHERE user_id = ?
               AND archived = 0
               AND company_name IS NOT NULL
               AND lower(replace(company_name, ' ', '')) = ?
               AND COALESCE(last_activity_at, updated_at, created_at) >= ?`
          )
          .all(userId, companySlug, since);

        const locationsCompatible = (incoming, candidateLoc) => {
          if (!incoming || !candidateLoc) return true;
          const a = normalizeLocation(incoming);
          const b = normalizeLocation(candidateLoc);
          if (!a || !b) return true;
          if (a === b) return true;
          const aTokens = a.split(' ').filter(Boolean);
          const bTokens = b.split(' ').filter(Boolean);
          const overlap = aTokens.some((t) => bTokens.includes(t));
          return overlap || a.includes(b) || b.includes(a);
        };

        const weakIncoming = incomingTokens.length < 2;

        for (const app of candidates) {
          const appRoleSlug = normalizeRoleSlug(app.job_title || app.role || '');
          const appTokens = roleTokens(appRoleSlug);
          if (!appRoleSlug || !appTokens.length) continue;

          const prefixMatch =
            incomingRoleSlug.startsWith(appRoleSlug) || appRoleSlug.startsWith(incomingRoleSlug);
          const jaccard = jaccardSimilarity(incomingTokens, appTokens);
          const subset =
            incomingTokens.length &&
            incomingTokens.every((t) => appTokens.includes(t)) &&
            appTokens.length >= 2;

          const roleMatch =
            prefixMatch || jaccard >= 0.7 || subset || (weakIncoming && subset && appTokens.length >= 2);

          const locOk = locationsCompatible(identity.jobLocation || identity.location || null, app.job_location);

          if (
            roleMatch &&
            locOk &&
            companyConf >= MIN_COMPANY_CONFIDENCE &&
            classificationConfidence >= MIN_CLASSIFICATION_CONFIDENCE
          ) {
            attachEventToApplication(db, event.id, app.id);
            updateApplicationActivity(db, app, event);
            applyCompanyCandidate(db, app, selectCompanyCandidate(identity));
            const roleCandidate = selectRoleCandidate(identity, event);
            const currentTitle = app.job_title || app.role || '';
            if (roleCandidate?.title && roleCandidate.title.length >= (currentTitle || '').length) {
              applyRoleCandidate(db, app, roleCandidate);
            }
            applyExternalReqId(db, app, externalReqId);
            logDebug('matching.dedupe_fuzzy_confirmation', {
              company: canonicalCompany,
              roleIncoming: roleBase,
              roleCandidate: app.job_title || app.role || '',
              similarityScore: Number(jaccard.toFixed ? jaccard.toFixed(3) : jaccard),
              timeDeltaHours: FUZZY_CONFIRMATION_WINDOW_HOURS,
              locationIncoming: identity.jobLocation || identity.location || null,
              locationCandidate: app.job_location || null
            });
            return { action: 'matched_existing', applicationId: app.id, identity };
          }
        }
      }
    }
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
