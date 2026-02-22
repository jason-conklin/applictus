const crypto = require('crypto');
const { ApplicationStatus } = require('../../shared/types');
const {
  extractThreadIdentity,
  isProviderName,
  isInvalidCompanyCandidate,
  normalizeExternalReqId,
  normalizeJobIdentity,
  sanitizeJobTitle,
  normalizeRole,
  normalizeCompany,
  normalizeRoleTokens,
  roleStrength,
  extractRoleTail,
  extractProgramTail,
  isProgramRole,
  tailSimilarity,
  STRONG_REJECTION_PATTERNS
} = require('../../shared/matching');
const { logDebug } = require('./logger');
const { TERMINAL_STATUSES, STATUS_PRIORITY } = require('../../shared/statusInference');
const { coalesceTimestamps } = require('./sqlHelpers');

const AUTO_CREATE_TYPES = new Set([
  'confirmation',
  'interview',
  'interview_requested',
  'interview_scheduled',
  'meeting_requested',
  'offer',
  'rejection',
  'under_review'
]);

const HIGH_SIGNAL_EVENT_TYPES = new Set([
  'offer',
  'interview',
  'interview_requested',
  'interview_scheduled',
  'meeting_requested'
]);
const UNKNOWN_ROLE = 'Unknown role';
const MIN_COMPANY_CONFIDENCE = 0.85;
const MIN_CLASSIFICATION_CONFIDENCE = 0.85;
const MIN_MATCH_CONFIDENCE = 0.85;
const MIN_DOMAIN_CONFIDENCE = 0.4;
const MIN_ROLE_CONFIDENCE = 0.8;
const DEDUPE_RECENCY_DAYS = 7;
const FUZZY_CONFIRMATION_WINDOW_HOURS = 6;
const LINKEDIN_MATCH_WINDOW_DAYS = 21;
const APPLICATION_METADATA_WINDOW_DAYS = 180;
const SYSTEM_INBOX_COMPANY_TERMS = new Set([
  'talentacquisition',
  'recruiting',
  'recruitment',
  'careers',
  'jobs',
  'noreply',
  'donotreply',
  'notifications'
]);

async function awaitMaybe(value) {
  return value && typeof value.then === 'function' ? await value : value;
}

function dbDialect(db) {
  return db && db.isAsync ? 'postgres' : 'sqlite';
}

function isLinkedInMatchDebugEnabled() {
  return String(process.env.DEBUG_INGEST_LINKEDIN_MATCH || '').trim() === '1';
}

function logLinkedInMatchDebug(meta) {
  if (!isLinkedInMatchDebugEnabled()) {
    return;
  }
  logDebug('matching.linkedin_fallback', meta);
}

function normalizeBindValue(value, dialect) {
  if (value === undefined) return null;
  if (value === null) return null;

  if (typeof value === 'boolean') {
    return dialect === 'sqlite' ? (value ? 1 : 0) : value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (typeof value === 'bigint' || typeof value === 'number' || typeof value === 'string') {
    return value;
  }

  // better-sqlite3 cannot bind objects/arrays; pg will otherwise stringify them poorly.
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (err) {
      return String(value);
    }
  }

  return value;
}

function normalizeBindParams(params, dialect) {
  return (params || []).map((value) => normalizeBindValue(value, dialect));
}

function normalizeRowList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.rows)) return value.rows;
  // Sometimes a caller accidentally uses .get() instead of .all(); tolerate single-row objects.
  if (value && typeof value === 'object' && (value.id || value.job_title || value.role)) return [value];
  return [];
}

function extractSenderDomain(sender) {
  if (!sender) return null;
  const match = String(sender).match(/@([^> ]+)/);
  return match ? match[1].toLowerCase() : null;
}

function extractSenderEmail(sender) {
  if (!sender) return null;
  const text = String(sender).trim();
  const angle = text.match(/<([^>]+)>/);
  const raw = angle && angle[1] ? angle[1] : text;
  const email = String(raw).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return email ? email[0].toLowerCase() : null;
}

function looksLikeEmailOrDomain(text) {
  const normalized = String(text || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.includes('@')) {
    return true;
  }
  if (/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i.test(normalized)) {
    return true;
  }
  if (/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(normalized)) {
    return true;
  }
  return false;
}

function isLowQualityCompanyCandidate(value) {
  const text = normalizeCompany(value) || String(value || '').trim();
  if (!text) {
    return true;
  }
  if (looksLikeEmailOrDomain(text)) {
    return true;
  }
  const compact = text.toLowerCase().replace(/[^a-z]/g, '');
  if (SYSTEM_INBOX_COMPANY_TERMS.has(compact)) {
    return true;
  }
  return isInvalidCompanyCandidate(text);
}

function isLowQualityRoleCandidate(value) {
  const text = normalizeRole(value) || String(value || '').trim();
  if (!text) {
    return true;
  }
  if (text.length > 80 && /\b(thank you|time and effort|we regret|after careful consideration)\b/i.test(text)) {
    return true;
  }
  if (
    /^(thank you for|we regret to inform|after careful consideration|unfortunately)\b/i.test(text)
  ) {
    return true;
  }
  return false;
}

function buildEventText(event = {}) {
  const parts = [
    event.subject,
    event.snippet,
    event.bodyText,
    event.body_text,
    event.bodyPlain,
    event.body_plain
  ];
  return parts
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
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

function isWeakRoleText(text) {
  if (!text) return true;
  const tokens = normalizeRoleTokens(text);
  return tokens.length < 2;
}

function getProgramParts(text) {
  const key = normalizeRoleKey(text);
  if (!key) return { prefix: null, tail: null, tailTokens: [] };
  const idx = key.lastIndexOf(' - ');
  if (idx === -1) return { prefix: null, tail: null, tailTokens: [] };
  const prefix = key.slice(0, idx).trim();
  const tail = key.slice(idx + 3).trim();
  const tailInfo = extractProgramTail(text || '');
  return { prefix, tail, tailTokens: tailInfo.tailTokens || [] };
}

function shouldAllowAutoAttach({ incomingIdentity, candidateApplication, incomingEvent }) {
  const incomingRole = incomingIdentity.jobTitle || incomingEvent.role_title || '';
  const candidateRole = candidateApplication.job_title || candidateApplication.role || '';
  const incomingWeak = isWeakRoleText(incomingRole) || normalizeDisplayTitle(incomingRole) === UNKNOWN_ROLE;
  const candidateWeak = isWeakRoleText(candidateRole) || normalizeDisplayTitle(candidateRole) === UNKNOWN_ROLE;
  const incomingReq = getExternalReqId(incomingEvent);
  const candidateReq = candidateApplication.external_req_id
    ? normalizeExternalReqId(candidateApplication.external_req_id)
    : null;

  if (incomingReq && candidateReq) {
    return {
      allowed: incomingReq === candidateReq,
      reason: incomingReq === candidateReq ? 'req_match' : 'req_mismatch'
    };
  }

  const candidateAts =
    (candidateApplication.source &&
      /(workday|myworkday|greenhouse|lever|icims|workable|jobvite|applytojob|smartrecruiters)/i.test(
        candidateApplication.source
      )) ||
    false;
  const atsInvolved = incomingIdentity.isAtsDomain || incomingIdentity.isPlatformEmail || candidateAts;

  if (incomingWeak || candidateWeak) {
    if (incomingWeak && candidateWeak) {
      if (atsInvolved) {
        return { allowed: true, reason: 'both_weak_ats_ok' };
      }
      return { allowed: false, reason: 'both_roles_weak' };
    }
    if (atsInvolved) {
      return { allowed: true, reason: 'weak_strong_ats_ok' };
    }
    return { allowed: false, reason: 'weak_no_ats' };
  }

  const incomingKey = normalizeRoleKey(incomingRole);
  const candidateKey = normalizeRoleKey(candidateRole);
  if (incomingKey && candidateKey && incomingKey === candidateKey) {
    return { allowed: true, reason: 'role_key_match' };
  }

  const incProgram = isProgramRole(incomingRole);
  const candProgram = isProgramRole(candidateRole);
  if (incProgram && candProgram) {
    const incParts = getProgramParts(incomingRole);
    const candParts = getProgramParts(candidateRole);
    if (incParts.prefix && candParts.prefix && incParts.prefix !== candParts.prefix) {
      return { allowed: false, reason: 'program_prefix_mismatch' };
    }
    const tailSim = tailSimilarity(incParts.tailTokens, candParts.tailTokens);
    if (tailSim >= 0.8) {
      return { allowed: true, reason: 'program_tail_match' };
    }
    return { allowed: false, reason: 'program_tail_mismatch' };
  }

  return { allowed: false, reason: 'strong_roles_mismatch' };
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

function canonicalRoleKey(role) {
  if (!role) return null;
  return String(role).toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeRoleKey(text) {
  if (!text) return null;
  let t = String(text).toLowerCase();
  t = t.replace(/\s*-\s*/g, ' - ');
  t = t.replace(/\s+/g, ' ').trim();
  return t || null;
}

function isDivergentStrongRoles(incomingTitle, candidateTitle) {
  const inTokens = normalizeRoleTokens(incomingTitle);
  const candTokens = normalizeRoleTokens(candidateTitle);
  const inStrength = roleStrength(inTokens);
  const candStrength = roleStrength(candTokens);
  if (!inStrength.strong || !candStrength.strong) {
    return false;
  }
  // Specialization sets
  const specialization = new Set([
    'data',
    'cloud',
    'full',
    'stack',
    'frontend',
    'backend',
    'ios',
    'android',
    'ml',
    'ai',
    'security',
    'devops',
    'qa',
    'sre',
    'analytics',
    'analyst'
  ]);
  const inSpecs = new Set(inTokens.filter((t) => specialization.has(t)));
  const candSpecs = new Set(candTokens.filter((t) => specialization.has(t)));
  const specOverlap = [...inSpecs].some((t) => candSpecs.has(t));
  if (inSpecs.size && candSpecs.size && !specOverlap) {
    return true;
  }
  // Divergence by token symmetric difference
  const setIn = new Set(inTokens);
  const setCand = new Set(candTokens);
  let diff = 0;
  for (const t of setIn) {
    if (!setCand.has(t)) diff++;
  }
  for (const t of setCand) {
    if (!setIn.has(t)) diff++;
  }
  return diff >= 2;
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

async function findDedupeApplication(db, userId, dedupeKey, eventTimestamp) {
  if (!dedupeKey) return null;
  const since = new Date(eventTimestamp || Date.now());
  since.setDate(since.getDate() - DEDUPE_RECENCY_DAYS);
  const query = `SELECT * FROM job_applications
       WHERE user_id = ?
         AND company_name IS NOT NULL
         AND archived = false
         AND last_activity_at >= ?`;
  const rows = normalizeRowList(await awaitMaybe(db.prepare(query).all(userId, since.toISOString())));

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
  const allRows = normalizeRowList(
    await awaitMaybe(
      db
        .prepare(
          `SELECT * FROM job_applications
             WHERE user_id = ?
               AND company_name IS NOT NULL
               AND archived = false`
        )
        .all(userId)
    )
  );
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

function isHighSignalEvent(event) {
  const type = String(event?.detected_type || '').toLowerCase();
  const confidence = getClassificationConfidence(event);
  const reason = String(event?.classification_reason || event?.reason || '').toLowerCase();
  if (HIGH_SIGNAL_EVENT_TYPES.has(type)) {
    return true;
  }
  if (type === 'rejection' && (confidence >= 0.95 || reason === 'rejection_override' || reason === 'rejection_strong')) {
    return true;
  }
  return false;
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

function normalizeRoleForApplication(value) {
  if (!value) {
    return null;
  }
  let candidate = normalizeRole(value) || sanitizeJobTitle(value);
  if (!candidate) {
    return null;
  }
  candidate = String(candidate)
    .replace(/\s*\|\s*-\s*#?\d{2,}\s*$/i, '')
    .replace(/\s+(?:-|–|—|\|)\s*(?:req(?:uisition)?\s*(?:id)?\s*)?#?\d{2,}\s*$/i, '')
    .trim();
  candidate = normalizeRole(candidate) || candidate;
  if (!candidate || isLowQualityRoleCandidate(candidate)) {
    return null;
  }
  return candidate;
}

function selectRoleCandidate(identity, event) {
  const eventRole = getRoleFromEvent(event);
  if (eventRole?.title && (eventRole.confidence ?? 0) >= MIN_ROLE_CONFIDENCE) {
    const normalizedTitle = normalizeRoleForApplication(eventRole.title);
    if (!normalizedTitle) {
      return null;
    }
    return {
      title: normalizedTitle,
      confidence: eventRole.confidence,
      source: eventRole.source || 'snippet',
      explanation: eventRole.explanation || 'Derived role from email.'
    };
  }
  if (identity?.jobTitle) {
    const normalizedTitle = normalizeRoleForApplication(identity.jobTitleRaw || identity.jobTitle);
    if (!normalizedTitle) {
      return null;
    }
    return {
      title: normalizedTitle,
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
  const normalizedName = normalizeCompany(identity.companyName) || identity.companyName;
  if (!normalizedName || isLowQualityCompanyCandidate(normalizedName)) {
    return null;
  }
  return {
    name: normalizedName,
    confidence: Number.isFinite(identity.companyConfidence) ? identity.companyConfidence : null,
    source: 'email',
    explanation: identity.explanation || 'Derived company from email.'
  };
}

function shouldUpdateCompany(application, candidate) {
  if (!candidate?.name) {
    return false;
  }
  if (isLowQualityCompanyCandidate(candidate.name)) {
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
  const currentInvalid = !currentName || isProviderName(currentName) || isLowQualityCompanyCandidate(currentName);

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
  const stmt = db.prepare(
    `UPDATE job_applications
     SET company_name = ?, company = ?, company_confidence = ?, company_source = ?, company_explanation = ?, updated_at = ?
     WHERE id = ?`
  );
  const dialect = dbDialect(db);
  stmt.run(
    ...normalizeBindParams(
      [
        candidate.name,
        candidate.name,
        Number.isFinite(candidate.confidence) ? candidate.confidence : null,
        candidate.source || null,
        candidate.explanation || null,
        new Date().toISOString(),
        application.id
      ],
      dialect
    )
  );
  return true;
}

function shouldUpdateRole(application, candidate) {
  if (!candidate?.title) {
    return false;
  }
  if (isLowQualityRoleCandidate(candidate.title)) {
    return false;
  }
  if (application.role_source === 'manual') {
    return false;
  }
  const currentTitle = application.job_title || application.role || null;
  const currentDisplay = currentTitle ? normalizeDisplayTitle(currentTitle) : null;
  const incomingDisplay = normalizeDisplayTitle(candidate.title);
  const currentConfidence = Number.isFinite(application.role_confidence)
    ? application.role_confidence
    : 0;
  const nextConfidence = Number.isFinite(candidate.confidence) ? candidate.confidence : 0;
  if (!currentTitle || currentTitle === UNKNOWN_ROLE || isLowQualityRoleCandidate(currentTitle)) {
    return true;
  }
  if (incomingDisplay === currentDisplay) {
    return nextConfidence > currentConfidence;
  }
  // Prefer strictly longer/more-informative titles
  if (incomingDisplay.length > currentDisplay.length + 2) {
    return true;
  }
  return nextConfidence > currentConfidence + 0.05;
}

function applyRoleCandidate(db, application, candidate) {
  if (!shouldUpdateRole(application, candidate)) {
    return false;
  }
  const displayTitle = normalizeDisplayTitle(candidate.title);
  const stmt = db.prepare(
    `UPDATE job_applications
     SET job_title = ?, role = ?, role_confidence = ?, role_source = ?, role_explanation = ?, updated_at = ?
     WHERE id = ?`
  );
  const dialect = dbDialect(db);
  stmt.run(
    ...normalizeBindParams(
      [
        displayTitle,
        displayTitle,
        Number.isFinite(candidate.confidence) ? candidate.confidence : null,
        candidate.source || null,
        candidate.explanation || null,
        new Date().toISOString(),
        application.id
      ],
      dialect
    )
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
  const stmt = db.prepare(
    `UPDATE job_applications
     SET external_req_id = ?, updated_at = ?
     WHERE id = ?`
  );
  const dialect = dbDialect(db);
  stmt.run(
    ...normalizeBindParams([normalized, new Date().toISOString(), application.id], dialect)
  );
  return true;
}

function parseEventTimestampMs(row) {
  if (!row) {
    return Date.now();
  }
  const internalRaw = row.internal_date;
  if (internalRaw !== null && internalRaw !== undefined && internalRaw !== '') {
    const numeric = Number(internalRaw);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
    const internalMs = new Date(internalRaw).getTime();
    if (Number.isFinite(internalMs) && internalMs > 0) {
      return internalMs;
    }
  }
  const createdMs = row.created_at ? new Date(row.created_at).getTime() : null;
  if (Number.isFinite(createdMs) && createdMs > 0) {
    return createdMs;
  }
  return Date.now();
}

function metadataCandidateScore(row, confidence, { type } = {}) {
  const base = Number.isFinite(confidence) ? confidence : 0;
  const detectedType = String(row?.detected_type || '').toLowerCase();
  const subject = String(row?.subject || '');
  let score = base;
  const isSubmittedSignal =
    /application submitted/i.test(subject) ||
    /your recent job application for/i.test(subject) ||
    /thank you for (?:your )?application/i.test(subject);
  if (detectedType === 'confirmation') {
    score += 0.12;
  } else if (detectedType === 'rejection') {
    score -= 0.08;
  }
  if (isSubmittedSignal) {
    score += 0.08;
  }
  if (type === 'role' && /your recent job application for/i.test(subject)) {
    score += 0.06;
  }
  return score;
}

function pickBestTimelineCandidate(candidates) {
  if (!Array.isArray(candidates) || !candidates.length) {
    return null;
  }
  return [...candidates].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (a.isConfirmation !== b.isConfirmation) {
      return a.isConfirmation ? -1 : 1;
    }
    return a.eventMs - b.eventMs;
  })[0];
}

async function refreshApplicationMetadataFromTimeline(db, applicationId) {
  if (!applicationId) {
    return;
  }
  const application = await awaitMaybe(
    db.prepare('SELECT * FROM job_applications WHERE id = ?').get(applicationId)
  );
  if (!application) {
    return;
  }

  const sinceIso = new Date(Date.now() - APPLICATION_METADATA_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const events = normalizeRowList(
    await awaitMaybe(
      db
        .prepare(
          `SELECT id, detected_type, subject, snippet, internal_date, created_at,
                  identity_company_name, identity_company_confidence,
                  identity_job_title, role_title, role_confidence
           FROM email_events
           WHERE application_id = ?
             AND created_at >= ?
           ORDER BY created_at ASC`
        )
        .all(applicationId, sinceIso)
    )
  );
  if (!events.length) {
    return;
  }

  const companyCandidates = [];
  const roleCandidates = [];
  for (const row of events) {
    const eventMs = parseEventTimestampMs(row);
    const isConfirmation = String(row.detected_type || '').toLowerCase() === 'confirmation';
    const companyName = normalizeCompany(row.identity_company_name || null);
    if (companyName && !isLowQualityCompanyCandidate(companyName)) {
      const confidence = Number.isFinite(row.identity_company_confidence)
        ? row.identity_company_confidence
        : isConfirmation
        ? 0.88
        : 0.8;
      companyCandidates.push({
        name: companyName,
        confidence,
        score: metadataCandidateScore(row, confidence, { type: 'company' }),
        source: 'timeline',
        explanation: `Best company selected from matched event ${row.id}.`,
        isConfirmation,
        eventMs
      });
    }

    const roleText = normalizeRoleForApplication(row.role_title || row.identity_job_title || null);
    if (roleText && !isLowQualityRoleCandidate(roleText)) {
      const confidence = Number.isFinite(row.role_confidence)
        ? row.role_confidence
        : isConfirmation
        ? 0.9
        : 0.82;
      roleCandidates.push({
        title: roleText,
        confidence,
        score: metadataCandidateScore(row, confidence, { type: 'role' }),
        source: 'timeline',
        explanation: `Best role selected from matched event ${row.id}.`,
        isConfirmation,
        eventMs
      });
    }
  }

  const bestCompany = pickBestTimelineCandidate(companyCandidates);
  if (bestCompany) {
    applyCompanyCandidate(db, application, bestCompany);
  }
  const bestRole = pickBestTimelineCandidate(roleCandidates);
  if (bestRole) {
    applyRoleCandidate(db, application, bestRole);
  }
}

async function applyBestMetadataForMatchedApplication(db, application, identity, event, externalReqId) {
  applyCompanyCandidate(db, application, selectCompanyCandidate(identity));
  applyRoleCandidate(db, application, selectRoleCandidate(identity, event));
  applyExternalReqId(db, application, externalReqId);
  await refreshApplicationMetadataFromTimeline(db, application.id);
}

function toIsoFromInternalDate(internalDate, fallback = new Date()) {
  const safeIso = (value) => {
    if (value === undefined || value === null) return null;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  };
  const fromInternal = safeIso(Number(internalDate));
  if (fromInternal) return fromInternal;
  const fromFallback = safeIso(fallback);
  if (fromFallback) return fromFallback;
  return new Date().toISOString();
}

function formatDisplayJobTitle(rawTitle) {
  if (rawTitle === null || rawTitle === undefined) return UNKNOWN_ROLE;
  const text = String(rawTitle).trim();
  return text || UNKNOWN_ROLE;
}

function normalizeDisplayTitle(rawTitle) {
  if (rawTitle === null || rawTitle === undefined) return UNKNOWN_ROLE;
  let text = String(rawTitle).trim();
  text = text.replace(/\s+(role|position|opening)\s*$/i, '').trim();
  return text || UNKNOWN_ROLE;
}

function inferInitialStatus(event, eventTimestamp) {
  const timestamp = eventTimestamp || toIsoFromInternalDate(event.internal_date, new Date(event.created_at));
  const classificationConfidence = getClassificationConfidence(event);
  const isApplied = event.detected_type === 'confirmation' && classificationConfidence >= 0.9;
  const isRejected = event.detected_type === 'rejection' && classificationConfidence >= 0.9;
  const isInterviewRequested =
    ['interview', 'interview_requested', 'interview_scheduled', 'meeting_requested'].includes(
      String(event.detected_type || '').toLowerCase()
    ) && classificationConfidence >= 0.85;
  const isOffer = event.detected_type === 'offer' && classificationConfidence >= 0.85;
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
  if (isOffer) {
    return {
      status: ApplicationStatus.OFFER_RECEIVED,
      statusConfidence: classificationConfidence,
      appliedAt: null
    };
  }
  if (isInterviewRequested) {
    return {
      status: ApplicationStatus.INTERVIEW_REQUESTED,
      statusConfidence: classificationConfidence,
      appliedAt: null
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

async function findMatchingApplication(db, userId, identity, externalReqId) {
  if (!identity.companyName) {
    return null;
  }
  if (externalReqId) {
    const row = await awaitMaybe(
      db
        .prepare(
          `SELECT * FROM job_applications
           WHERE user_id = ?
             AND (LOWER(company_name) = LOWER(?) OR LOWER(company) = LOWER(?))
             AND external_req_id = ?
             AND archived = false
           LIMIT 1`
        )
        .get(userId, identity.companyName, identity.companyName, externalReqId)
    );
    return row || null;
  }
  if (identity.senderDomain && identity.jobTitle) {
    const row = await awaitMaybe(
      db
        .prepare(
          `SELECT * FROM job_applications
           WHERE user_id = ?
             AND (company_name = ? OR company = ?)
             AND (job_title = ? OR role = ?)
             AND source = ?
             AND archived = false
           LIMIT 1`
        )
        .get(
          userId,
          identity.companyName,
          identity.companyName,
          identity.jobTitle,
          identity.jobTitle,
          identity.senderDomain
        )
    );
    return row || null;
  }
  if (identity.senderDomain) {
    const matches = normalizeRowList(
      await awaitMaybe(
        db
          .prepare(
            `SELECT * FROM job_applications
             WHERE user_id = ?
               AND (company_name = ? OR company = ?)
               AND source = ?
               AND archived = false`
          )
          .all(userId, identity.companyName, identity.companyName, identity.senderDomain)
      )
    );
    if (matches.length === 1) {
      return matches[0];
    }
    return null;
  }
  if (identity.jobTitle) {
    const matches = normalizeRowList(
      await awaitMaybe(
        db
          .prepare(
            `SELECT * FROM job_applications
             WHERE user_id = ?
               AND (company_name = ? OR company = ?)
               AND (job_title = ? OR role = ?)
               AND archived = false`
          )
          .all(
            userId,
            identity.companyName,
            identity.companyName,
            identity.jobTitle,
            identity.jobTitle
          )
      )
    );
    if (matches.length === 1) {
      return matches[0];
    }
    return null;
  }
  const matches = normalizeRowList(
    await awaitMaybe(
      db
        .prepare(
          `SELECT * FROM job_applications
           WHERE user_id = ?
             AND (company_name = ? OR company = ?)
             AND archived = false`
        )
        .all(userId, identity.companyName, identity.companyName)
    )
  );
  if (matches.length === 1) {
    return matches[0];
  }
  return null;
}

async function findLooseMatchingApplication(db, userId, identity, externalReqId) {
  if (!identity.companyName) {
    return null;
  }
  if (externalReqId) {
    return null;
  }
  if (identity.jobTitle) {
    const match = await awaitMaybe(
      db
        .prepare(
          `SELECT * FROM job_applications
           WHERE user_id = ?
             AND (company_name = ? OR company = ?)
             AND (job_title = ? OR role = ?)
             AND archived = false
           ORDER BY ${coalesceTimestamps(['last_activity_at', 'updated_at', 'created_at'])} DESC
           LIMIT 1`
        )
        .get(
          userId,
          identity.companyName,
          identity.companyName,
          identity.jobTitle,
          identity.jobTitle
        )
    );
    return match || null;
  }
  const match = await awaitMaybe(
    db
      .prepare(
        `SELECT * FROM job_applications
         WHERE user_id = ?
           AND (company_name = ? OR company = ?)
           AND archived = false
         ORDER BY ${coalesceTimestamps(['last_activity_at', 'updated_at', 'created_at'])} DESC
         LIMIT 1`
      )
      .get(userId, identity.companyName, identity.companyName)
  );
  return match || null;
}

async function findCompanyMatches(db, userId, identity, senderDomain, recencyDays = null) {
  if (!identity.companyName) {
    return [];
  }
  const baseQuery = [
    `SELECT * FROM job_applications`,
    `WHERE user_id = ?`,
    `AND (company_name = ? OR company = ?)`,
    senderDomain ? `AND source = ?` : null,
    `AND archived = false`,
    recencyDays
      ? `AND ${coalesceTimestamps(['last_activity_at', 'updated_at', 'created_at'])} >= ?`
      : null
  ]
    .filter(Boolean)
    .join(' ');
  const params = [userId, identity.companyName, identity.companyName];
  if (senderDomain) {
    params.push(senderDomain);
  }
  if (recencyDays) {
    const windowStart = new Date(Date.now() - recencyDays * 24 * 60 * 60 * 1000).toISOString();
    params.push(windowStart);
  }
  const rows = await awaitMaybe(db.prepare(baseQuery).all(...params));
  return normalizeRowList(rows);
}

function isLinkedInJobsEnvelope(event) {
  const sender = extractSenderEmail(event?.sender || '');
  const subject = String(event?.subject || '');
  if (sender !== 'jobs-noreply@linkedin.com') {
    return false;
  }
  if (/^\s*your application to\s+/i.test(subject)) {
    return true;
  }
  return /(?:^|\s),?\s*your application was sent to\s+/i.test(subject);
}

function getEventTimestampMs(event) {
  const fromInternal = event?.internal_date ? Number(event.internal_date) : null;
  if (Number.isFinite(fromInternal) && fromInternal > 0) {
    return fromInternal;
  }
  const fromCreated = event?.created_at ? new Date(event.created_at).getTime() : null;
  if (Number.isFinite(fromCreated) && fromCreated > 0) {
    return fromCreated;
  }
  return Date.now();
}

function getLinkedInCandidateAnchor(candidate) {
  if (candidate?.applied_at) {
    const appliedMs = new Date(candidate.applied_at).getTime();
    if (Number.isFinite(appliedMs) && appliedMs > 0) {
      return { ts: appliedMs, source: 'applied_at' };
    }
  }
  const fallbackIso = candidate?.last_activity_at || candidate?.updated_at || candidate?.created_at || null;
  if (!fallbackIso) {
    return { ts: null, source: 'none' };
  }
  const fallbackMs = new Date(fallbackIso).getTime();
  if (!Number.isFinite(fallbackMs) || fallbackMs <= 0) {
    return { ts: null, source: 'none' };
  }
  return { ts: fallbackMs, source: 'last_activity' };
}

function getLinkedInNormalizedRole(identity, event) {
  return normalizeJobIdentity(identity?.jobTitle || event?.role_title || null);
}

async function findLinkedInStrictFallbackMatch(db, userId, identity, event) {
  const normalizedCompany = normalizeJobIdentity(identity?.companyName || null);
  const normalizedRole = getLinkedInNormalizedRole(identity, event);
  const eventKey =
    normalizedCompany && normalizedRole ? `${normalizedCompany}|${normalizedRole}` : null;
  const eventMs = getEventTimestampMs(event);
  const eventIso = new Date(eventMs).toISOString();
  if (!normalizedCompany || !normalizedRole) {
    return {
      match: null,
      ambiguous: false,
      reason: 'missing_identity',
      candidateCount: 0,
      normalizedCompany,
      normalizedRole,
      eventKey,
      eventTimestamp: eventIso,
      rawCompany: identity?.companyName || null,
      rawRole: identity?.jobTitle || event?.role_title || null,
      dbCandidateCount: 0,
      keyMatchCount: 0
    };
  }

  const lookbackIso = new Date(eventMs - 45 * 24 * 60 * 60 * 1000).toISOString();
  const archivedFalse = dbDialect(db) === 'postgres' ? false : 0;
  const rows = normalizeRowList(
    await awaitMaybe(
      db
        .prepare(
          `SELECT * FROM job_applications
           WHERE user_id = ?
             AND archived = ?
             AND created_at >= ?
           ORDER BY created_at DESC
           LIMIT 200`
        )
        .all(userId, archivedFalse, lookbackIso)
    )
  );

  const keyMatched = [];
  for (const app of rows) {
    const candidateCompany = normalizeJobIdentity(app.company_name || app.company || null);
    const candidateRole = normalizeJobIdentity(app.job_title || app.role || app.role_title || null);
    if (!candidateCompany || !candidateRole) {
      continue;
    }
    const appKey = `${candidateCompany}|${candidateRole}`;
    if (appKey !== eventKey) {
      continue;
    }
    keyMatched.push({
      app,
      appKey
    });
  }

  const matchingCandidates = [];
  for (const matched of keyMatched) {
    const app = matched.app;
    const anchor = getLinkedInCandidateAnchor(app);
    if (!anchor.ts) {
      continue;
    }
    const ageDays = (eventMs - anchor.ts) / (24 * 60 * 60 * 1000);
    if (!Number.isFinite(ageDays) || ageDays < 0 || ageDays > LINKEDIN_MATCH_WINDOW_DAYS) {
      continue;
    }
    matchingCandidates.push({
      app,
      appKey: matched.appKey,
      anchorSource: anchor.source,
      ageDays
    });
  }

  if (matchingCandidates.length === 1) {
    return {
      match: matchingCandidates[0].app,
      ambiguous: false,
      reason: 'matched',
      candidateCount: 1,
      normalizedCompany,
      normalizedRole,
      eventKey,
      eventTimestamp: eventIso,
      rawCompany: identity?.companyName || null,
      rawRole: identity?.jobTitle || event?.role_title || null,
      dbCandidateCount: rows.length,
      keyMatchCount: keyMatched.length,
      anchorSource: matchingCandidates[0].anchorSource,
      ageDays: matchingCandidates[0].ageDays
    };
  }

  return {
    match: null,
    ambiguous: matchingCandidates.length > 1,
    reason: matchingCandidates.length > 1 ? 'multiple_candidates' : 'no_candidate',
    candidateCount: matchingCandidates.length,
    normalizedCompany,
    normalizedRole,
    eventKey,
    eventTimestamp: eventIso,
    rawCompany: identity?.companyName || null,
    rawRole: identity?.jobTitle || event?.role_title || null,
    dbCandidateCount: rows.length,
    keyMatchCount: keyMatched.length
  };
}

async function updateApplicationActivity(db, application, event) {
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
    await awaitMaybe(
      db
        .prepare(`UPDATE job_applications SET ${setClause} WHERE id = ?`)
        .run(...normalizeBindParams(values, dbDialect(db)))
    );
  }
}

async function createApplicationFromEvent(db, userId, identity, event) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const eventTimestamp = toIsoFromInternalDate(event.internal_date, new Date(event.created_at));
  const companyCandidate = selectCompanyCandidate(identity);
  const roleCandidate = selectRoleCandidate(identity, event);
  const externalReqId = getExternalReqId(event);
  const displaySource =
    event.detected_type === 'confirmation' && identity?.jobTitleRaw
      ? identity.jobTitleRaw
      : roleCandidate?.title || UNKNOWN_ROLE;
  const jobTitle = normalizeDisplayTitle(displaySource);

  const { status, statusConfidence, appliedAt } = inferInitialStatus(event, eventTimestamp);
  const statusExplanation =
    status === ApplicationStatus.APPLIED
      ? `Auto-applied from confirmation event ${event.id}.`
      : 'Auto-created with unknown status.';

  const dialect = dbDialect(db);
  const insertParams = [
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
    false,
    false,
    createdAt,
    createdAt
  ];

  if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
    // eslint-disable-next-line no-console
    console.debug('[matching] createApplicationFromEvent bind params', {
      dialect,
      types: insertParams.map((value) => (value === null ? 'null' : typeof value))
    });
  }

  await awaitMaybe(
    db
      .prepare(
    `INSERT INTO job_applications
      (id, user_id, company, role, status, status_source, company_name, company_confidence,
       company_source, company_explanation, job_title, job_location, source, external_req_id, applied_at,
       current_status, status_confidence, status_explanation, status_updated_at, role_confidence,
       role_source, role_explanation, last_activity_at, archived, user_override, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(...normalizeBindParams(insertParams, dialect))
  );

  return await awaitMaybe(db.prepare('SELECT * FROM job_applications WHERE id = ?').get(id));
}

async function attachEventToApplication(db, eventId, applicationId) {
  await awaitMaybe(
    db
      .prepare('UPDATE email_events SET application_id = ? WHERE id = ?')
      .run(...normalizeBindParams([applicationId, eventId], dbDialect(db)))
  );
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

async function matchAndAssignEvent({ db, userId, event, identity: providedIdentity }) {
  let identity =
    providedIdentity ||
    extractThreadIdentity({ subject: event.subject, sender: event.sender, snippet: event.snippet });
  const highSignalEvent = isHighSignalEvent(event);
  const STRONG_REJECTION_LIST = Array.isArray(STRONG_REJECTION_PATTERNS) ? STRONG_REJECTION_PATTERNS : [];
  const eventText = buildEventText(event);
  const externalReqId = getExternalReqId(event);
  const roleForMatch = identity.jobTitle || event.role_title || null;
  const isConfirmation = event.detected_type === 'confirmation';
  const isRejectionEvent =
    event.detected_type === 'rejection' ||
    STRONG_REJECTION_LIST.some((p) => p.test(eventText));
  const eventTsIso = toIsoFromInternalDate(event.internal_date, new Date(event.created_at));
  const eventTimeMs = eventTsIso ? new Date(eventTsIso).getTime() : Date.now();

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
  if (!identity.companyName && highSignalEvent) {
    const highSignalFallbackRole = /\b(technical|engineer|developer|coding|projects?)\b/i.test(
      buildEventText(event)
    )
      ? 'Technical opportunity'
      : 'Intro call';
    const fallbackRoleText = normalizeRoleForApplication(
      event.role_title ||
        identity.jobTitle ||
        highSignalFallbackRole
    );
    identity = {
      ...identity,
      companyName: 'Direct Outreach',
      companyConfidence: Math.max(identity.companyConfidence || 0, 0.74),
      roleConfidence:
        Number.isFinite(identity.roleConfidence) && identity.roleConfidence > 0
          ? identity.roleConfidence
          : fallbackRoleText
          ? 0.68
          : null,
      domainConfidence: Math.max(identity.domainConfidence || 0, 0.35),
      matchConfidence: Math.max(identity.matchConfidence || 0, 0.74),
      explanation: `${identity.explanation || 'No identity match.'} High-signal fallback identity applied.`,
      jobTitle: identity.jobTitle || fallbackRoleText || null
    };
  }

  if (!identity.companyName) {
    if (isConfirmation && roleForMatch) {
      const recentWindowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const recentRoleMatch = await awaitMaybe(
        db
        .prepare(
          `SELECT * FROM job_applications
           WHERE user_id = ?
             AND archived = false
             AND (job_title = ? OR role = ?)
          AND ${coalesceTimestamps(['last_activity_at', 'updated_at', 'created_at'])} >= ?
          ORDER BY ${coalesceTimestamps(['last_activity_at', 'updated_at', 'created_at'])} DESC
           LIMIT 1`
        )
        .get(userId, roleForMatch, roleForMatch, recentWindowStart)
      );
      if (recentRoleMatch) {
        await attachEventToApplication(db, event.id, recentRoleMatch.id);
        await updateApplicationActivity(db, recentRoleMatch, event);
        await applyBestMetadataForMatchedApplication(db, recentRoleMatch, identity, event, externalReqId);
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

  // Hard identity boundary for confirmations: company + normalized role must match
  if (isConfirmation && !isRejectionEvent && roleForMatch) {
    const incomingWeak = isWeakRoleText(roleForMatch) || normalizeDisplayTitle(roleForMatch) === UNKNOWN_ROLE;
    if (!incomingWeak) {
      const existingAppsRaw = await awaitMaybe(
        db
          .prepare(
            `SELECT id, job_title, role FROM job_applications
             WHERE user_id = ?
               AND archived = false
               AND (company_name = ? OR company = ?)`
          )
          .all(userId, identity.companyName, identity.companyName)
      );
      const existingApps = normalizeRowList(existingAppsRaw);
      if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
        logDebug('matching.existing_apps_loaded', {
          rawType: typeof existingAppsRaw,
          isArray: Array.isArray(existingAppsRaw),
          hasRows: Boolean(existingAppsRaw && existingAppsRaw.rows),
          normalizedLength: existingApps.length
        });
      }
      const conflict = existingApps.some((app) => {
        const appRole = app.job_title || app.role;
        if (isWeakRoleText(appRole) || normalizeDisplayTitle(appRole) === UNKNOWN_ROLE) {
          return false;
        }
        return isDivergentStrongRoles(roleForMatch, appRole);
      });
      if (conflict) {
        const application = await createApplicationFromEvent(db, userId, identity, event);
        await attachEventToApplication(db, event.id, application.id);
        logDebug('matching.confirmation_role_boundary', {
          eventId: event.id,
          applicationId: application.id,
          company: identity.companyName,
          role: roleForMatch,
          reason: 'strong_role_divergence'
        });
        return { action: 'created_application', applicationId: application.id, identity };
      }
    }
  }

  const matchConfidence = identity.matchConfidence || 0;
  const isRejection = event.detected_type === 'rejection';
  // For confirmations, handle req-id match early and skip generic matching paths
  if (isConfirmation && !isRejectionEvent && externalReqId) {
    const reqMatch = await findMatchingApplication(db, userId, identity, externalReqId);
    if (reqMatch) {
      await attachEventToApplication(db, event.id, reqMatch.id);
      await updateApplicationActivity(db, reqMatch, event);
      await applyBestMetadataForMatchedApplication(db, reqMatch, identity, event, externalReqId);
      logDebug('matching.confirmation_path', { path: 'req_id_match', eventId: event.id, applicationId: reqMatch.id });
      return { action: 'matched_existing', applicationId: reqMatch.id, identity };
    }
  }

  let existing = null;
  let ambiguous = false;

  if (isRejection) {
    if (externalReqId) {
      existing = await findMatchingApplication(db, userId, identity, externalReqId);
    }
    if (!existing && roleForMatch) {
      const companySlug = normalizeSlug(identity.companyName);
      const roleSlug = normalizeSlug(roleForMatch);
      const matches = normalizeRowList(
        await awaitMaybe(
          db
            .prepare(
              `SELECT * FROM job_applications
               WHERE user_id = ?
                 AND archived = false
                 AND (
                   (company_name = ? OR company = ?) AND (job_title = ? OR role = ?)
                   OR (lower(replace(company_name, ' ', '')) = ? AND lower(replace(job_title, ' ', '')) = ?)
                   OR (lower(replace(company, ' ', '')) = ? AND lower(replace(role, ' ', '')) = ?)
                 )`
            )
            .all(
              userId,
              identity.companyName,
              identity.companyName,
              roleForMatch,
              roleForMatch,
              companySlug,
              roleSlug,
              companySlug,
              roleSlug
            )
        )
      );
      if (matches.length === 1) {
        existing = matches[0];
      } else if (matches.length > 1) {
        ambiguous = true;
      }
    }
    if (!existing && !ambiguous) {
      const domainMatches = identity.senderDomain
        ? await findCompanyMatches(db, userId, identity, identity.senderDomain, 60)
        : [];
      if (domainMatches.length === 1) {
        existing = domainMatches[0];
      } else if (domainMatches.length > 1) {
        ambiguous = true;
      }
    }
    if (!existing && !ambiguous) {
      const companyMatches = await findCompanyMatches(db, userId, identity, null, 60);
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

  if (!isConfirmation) {
    if (!existing && matchConfidence >= MIN_MATCH_CONFIDENCE) {
      existing = await findMatchingApplication(db, userId, identity, externalReqId);
      if (
        !existing &&
        !externalReqId &&
        AUTO_CREATE_TYPES.has(event.detected_type) &&
        identity.companyName &&
        (identity.companyConfidence || 0) >= MIN_COMPANY_CONFIDENCE &&
        getClassificationConfidence(event) >= MIN_CLASSIFICATION_CONFIDENCE
      ) {
        existing = await findLooseMatchingApplication(db, userId, identity, externalReqId);
      }
    } else if (
      !existing &&
      !externalReqId &&
      AUTO_CREATE_TYPES.has(event.detected_type) &&
      identity.companyName &&
      (identity.companyConfidence || 0) >= MIN_COMPANY_CONFIDENCE &&
      getClassificationConfidence(event) >= MIN_CLASSIFICATION_CONFIDENCE
    ) {
      existing = await findLooseMatchingApplication(db, userId, identity, externalReqId);
    }
  }

  // For confirmations, bail out of an early company match if roles are divergent or too far apart in time
  if (existing && isConfirmation) {
    const incomingRole = roleForMatch || identity.jobTitle || event.role_title || '';
    const candidateRole = existing.job_title || existing.role || '';
    if (isDivergentStrongRoles(incomingRole, candidateRole)) {
      existing = null;
    } else {
      const eventTsIso = toIsoFromInternalDate(event.internal_date, new Date(event.created_at));
      const eventTs = eventTsIso ? new Date(eventTsIso).getTime() : Date.now();
      const candidateTsIso =
        existing.last_activity_at || existing.updated_at || existing.created_at || null;
      const candidateTs = candidateTsIso ? new Date(candidateTsIso).getTime() : null;
      if (
        candidateTs &&
        !externalReqId &&
        Math.abs(eventTs - candidateTs) / 3600000 > FUZZY_CONFIRMATION_WINDOW_HOURS
      ) {
        const incomingStrength = roleStrength(normalizeRoleTokens(incomingRole));
        const candidateStrength = roleStrength(normalizeRoleTokens(candidateRole));
        if (incomingStrength.strong && candidateStrength.strong) {
          logDebug('matching.confirmation_fuzzy_window_check', {
            eventId: event.id,
            candidateId: existing.id,
            deltaHours: Math.abs(eventTs - candidateTs) / 3600000,
            incomingRole,
            candidateRole,
            externalReqIdPresent: Boolean(externalReqId)
          });
          existing = null;
        }
      }
    }
    if (existing) {
      const guard = shouldAllowAutoAttach({
        incomingIdentity: identity,
        candidateApplication: existing,
        incomingEvent: event
      });
      if (!guard.allowed) {
        logDebug('matching.auto_attach_blocked', {
          eventId: event.id,
          candidateId: existing.id,
          reason: guard.reason
        });
        existing = null;
      }
    }
  }

  const linkedInEnvelope = isLinkedInJobsEnvelope(event);
  if (!existing && linkedInEnvelope) {
    const fallback = await findLinkedInStrictFallbackMatch(db, userId, identity, event);
    logLinkedInMatchDebug({
      eventId: event.id,
      subject: event.subject || null,
      detectedType: event.detected_type,
      eventTimestamp: fallback.eventTimestamp || null,
      rawCompany: fallback.rawCompany || null,
      rawRole: fallback.rawRole || null,
      eventKey: fallback.eventKey || null,
      dbCandidateCount: fallback.dbCandidateCount || 0,
      keyMatchCount: fallback.keyMatchCount || 0,
      normalizedCompany: fallback.normalizedCompany,
      normalizedRole: fallback.normalizedRole,
      candidateCount: fallback.candidateCount,
      reason: fallback.reason,
      matchedApplicationId: fallback.match ? fallback.match.id : null,
      anchorSource: fallback.anchorSource || null,
      ageDays: Number.isFinite(fallback.ageDays) ? Number(fallback.ageDays.toFixed(3)) : null
    });

    if (fallback.match) {
      existing = fallback.match;
    } else if (fallback.ambiguous && isRejection) {
      return {
        action: 'unassigned',
        reason: 'ambiguous_linkedin_match',
        reasonDetail: 'Multiple LinkedIn applications match this rejection update.',
        identity
      };
    }
  }

  if (existing) {
    await attachEventToApplication(db, event.id, existing.id);
    await updateApplicationActivity(db, existing, event);
    await applyBestMetadataForMatchedApplication(db, existing, identity, event, externalReqId);
    if (isRejection && getClassificationConfidence(event) >= 0.9) {
      const blocked = shouldBlockAutoStatus(
        existing,
        ApplicationStatus.REJECTED,
        getClassificationConfidence(event)
      );
      if (!blocked) {
        const statusUpdateParams = [
          ApplicationStatus.REJECTED,
          ApplicationStatus.REJECTED,
          'inferred',
          getClassificationConfidence(event),
          `Rejection detected from event ${event.id}.`,
          new Date().toISOString(),
          toIsoFromInternalDate(event.internal_date, new Date(event.created_at)),
          existing.id
        ];
        await awaitMaybe(
          db
            .prepare(
              `UPDATE job_applications
                 SET current_status = ?, status = ?, status_source = ?, status_confidence = ?, status_explanation = ?, status_updated_at = ?, last_activity_at = ?
               WHERE id = ?`
            )
            .run(...normalizeBindParams(statusUpdateParams, dbDialect(db)))
        );
      }
    }
    return { action: 'matched_existing', applicationId: existing.id, identity };
  }

  if (!shouldAutoCreate(event, identity)) {
    if (highSignalEvent && identity.companyName) {
      const highSignalFallbackRole = /\b(technical|engineer|developer|coding|projects?)\b/i.test(
        buildEventText(event)
      )
        ? 'Technical opportunity'
        : 'Intro call';
      const fallbackRole = normalizeRoleForApplication(
        event.role_title ||
          identity.jobTitle ||
          highSignalFallbackRole
      );
      const highSignalEventPayload = fallbackRole
        ? {
            ...event,
            role_title: fallbackRole,
            role_confidence: Number.isFinite(event.role_confidence) ? event.role_confidence : 0.68,
            role_source: event.role_source || 'fallback',
            role_explanation: event.role_explanation || 'High-signal scheduling fallback role.'
          }
        : event;
      const application = await createApplicationFromEvent(db, userId, identity, highSignalEventPayload);
      await attachEventToApplication(db, event.id, application.id);
      return { action: 'created_application', applicationId: application.id, identity };
    }
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
    let candidate = await findDedupeApplication(
      db,
      userId,
      dedupeKey,
      toIsoFromInternalDate(event.internal_date, new Date(event.created_at))
    );
    if (!candidate && dedupeKey) {
      // Relax domain requirement to catch ATS/corporate double confirmations
      candidate = await findDedupeApplication(
        db,
        userId,
        { ...dedupeKey, domainSlug: null },
        toIsoFromInternalDate(event.internal_date, new Date(event.created_at))
      );
    }
    if (!candidate && dedupeKey && dedupeKey.companySlug && dedupeKey.roleSlug) {
      const rows = normalizeRowList(
        await awaitMaybe(
          db
            .prepare(
              `SELECT * FROM job_applications
               WHERE user_id = ?
                 AND archived = false`
            )
            .all(userId)
        )
      );
      for (const app of rows) {
        const appCompany = normalizeSlug(app.company_name || app.company || '');
        const appRole = normalizeSlug(app.job_title || app.role || '');
        if (appCompany === dedupeKey.companySlug && appRole === dedupeKey.roleSlug) {
          if (isDivergentStrongRoles(dedupeRole || roleForMatch, app.job_title || app.role)) {
            continue;
          }
          candidate = app;
          break;
        }
      }
    }
    if (!candidate && dedupeKey && dedupeKey.companySlug && dedupeKey.roleSlug) {
      const direct = await awaitMaybe(
        db
          .prepare(
            `SELECT * FROM job_applications
             WHERE user_id = ?
               AND archived = false
               AND lower(replace(company_name, ' ', '')) = ?
               AND lower(replace(job_title, ' ', '')) = ?`
          )
          .get(userId, dedupeKey.companySlug, dedupeKey.roleSlug)
      );
      if (direct) {
        candidate = direct;
      }
    }
    if (candidate) {
      // Enforce confirmation recency window unless req id provided
      const candidateTsIso = candidate.last_activity_at || candidate.updated_at || candidate.created_at || null;
      const candidateMs = candidateTsIso ? new Date(candidateTsIso).getTime() : null;
      const deltaHours =
        candidateMs !== null ? Math.abs(eventTimeMs - candidateMs) / 3600000 : Infinity;
      if (!externalReqId && deltaHours > FUZZY_CONFIRMATION_WINDOW_HOURS) {
        candidate = null;
      }
    }
    if (candidate) {
      if (isDivergentStrongRoles(dedupeRole || roleForMatch, candidate.job_title || candidate.role)) {
        candidate = null;
      }
    }
    if (candidate) {
      const guard = shouldAllowAutoAttach({
        incomingIdentity: identity,
        candidateApplication: candidate,
        incomingEvent: event
      });
      if (!guard.allowed) {
        logDebug('matching.auto_attach_blocked', {
          eventId: event.id,
          candidateId: candidate.id,
          reason: guard.reason
        });
        candidate = null;
      }
    }
      if (candidate) {
        await attachEventToApplication(db, event.id, candidate.id);
        await updateApplicationActivity(db, candidate, event);
        await applyBestMetadataForMatchedApplication(db, candidate, identity, event, externalReqId);
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
      const windowStart = new Date(eventTimeMs - FUZZY_CONFIRMATION_WINDOW_HOURS * 3600000).toISOString();
      const recent = normalizeRowList(
        await awaitMaybe(
          db
            .prepare(
              `SELECT * FROM job_applications
               WHERE user_id = ?
                 AND archived = false
                 AND lower(replace(company_name, ' ', '')) = ?
                 AND lower(replace(job_title, ' ', '')) = ?
                AND ${coalesceTimestamps(['last_activity_at', 'updated_at', 'created_at'])} >= ?`
            )
            .all(userId, companySlug, roleSlug, windowStart)
        )
      );
      logDedupe('matching.final_confirmation_dedupe', {
        eventId: event.id,
        canonicalCompany,
        canonicalRole: dedupeRole,
        candidates: recent.length
      });
      if (recent.length === 1) {
        const candidate = recent[0];
        if (isDivergentStrongRoles(dedupeRole || roleForMatch, candidate.job_title || candidate.role)) {
          // Roles diverge; do not dedupe/attach.
        } else {
          await attachEventToApplication(db, event.id, candidate.id);
          await updateApplicationActivity(db, candidate, event);
          await applyBestMetadataForMatchedApplication(db, candidate, identity, event, externalReqId);
          return { action: 'matched_existing', applicationId: candidate.id, identity };
        }
      }
    }
    if ((!identity.companyName || isInvalidCompanyCandidate(identity.companyName)) && dedupeRole && (identity.isAtsDomain || identity.isPlatformEmail)) {
      const roleSlug = normalizeSlug(dedupeRole);
      const roleWindowStart = new Date(eventTimeMs - 24 * 3600000).toISOString();
      const recentRole = normalizeRowList(
        await awaitMaybe(
          db
            .prepare(
              `SELECT * FROM job_applications
               WHERE user_id = ?
                 AND archived = false
                 AND lower(replace(job_title, ' ', '')) = ?
                AND ${coalesceTimestamps(['last_activity_at', 'updated_at', 'created_at'])} >= ?`
            )
            .all(userId, roleSlug, roleWindowStart)
        )
      );
      logDedupe('matching.role_only_confirmation_dedupe', {
        eventId: event.id,
        canonicalRole: dedupeRole,
        candidates: recentRole.length
      });
      if (recentRole.length === 1) {
        const candidate = recentRole[0];
        const guard = shouldAllowAutoAttach({
          incomingIdentity: identity,
          candidateApplication: candidate,
          incomingEvent: event
        });
        if (!guard.allowed) {
          logDebug('matching.auto_attach_blocked', {
            eventId: event.id,
            candidateId: candidate.id,
            reason: guard.reason
          });
        } else {
          await attachEventToApplication(db, event.id, candidate.id);
          await updateApplicationActivity(db, candidate, event);
          applyCompanyCandidate(db, candidate, selectCompanyCandidate(identity));
          const roleCandidate = selectRoleCandidate(identity, event);
          const currentTitle = candidate.job_title || candidate.role || '';
          if (roleCandidate?.title && roleCandidate.title.length >= currentTitle.length) {
            applyRoleCandidate(db, candidate, roleCandidate);
          }
          applyExternalReqId(db, candidate, externalReqId);
          await refreshApplicationMetadataFromTimeline(db, candidate.id);
          return { action: 'matched_existing', applicationId: candidate.id, identity };
        }
      }
    }

    // Fuzzy cross-source confirmation dedupe (LinkedIn -> ATS)
    if (canonicalCompany) {
      const companySlug = normalizeSlug(canonicalCompany);
      const roleBase = dedupeRole || roleForMatch || identity.jobTitle || event.role_title || null;
      const incomingRoleSlug = normalizeRoleSlug(roleBase);
  const incomingTokens = roleTokens(incomingRoleSlug);
  const incomingStrength = roleStrength(normalizeRoleTokens(roleBase));
  const incomingTail = extractRoleTail(roleBase || '');
  const incomingTailTokens = incomingTail.tailTokens.length ? incomingTail.tailTokens : incomingTokens;
      const classificationConfidence = getClassificationConfidence(event);
      const companyConf = identity.companyConfidence || 0;
      if (companySlug && incomingRoleSlug && incomingTokens.length) {
        const eventTime = event.internal_date
          ? new Date(Number(event.internal_date))
          : event.created_at
          ? new Date(event.created_at)
          : new Date();
      const windowHours =
        externalReqId && identity.externalReqId
          ? Math.max(FUZZY_CONFIRMATION_WINDOW_HOURS, 24)
          : FUZZY_CONFIRMATION_WINDOW_HOURS;
      const windowStart = new Date(eventTime.getTime() - windowHours * 3600000).toISOString();
      const candidates = normalizeRowList(
        await awaitMaybe(
          db
            .prepare(
              `SELECT * FROM job_applications
               WHERE user_id = ?
                 AND archived = false
                 AND company_name IS NOT NULL
                 AND lower(replace(company_name, ' ', '')) = ?
                AND ${coalesceTimestamps(['last_activity_at', 'updated_at', 'created_at'])} >= ?`
            )
            .all(userId, companySlug, windowStart)
        )
      );

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

        const specializationSet = new Set([
          'data',
          'cloud',
          'full',
          'stack',
          'frontend',
          'backend',
          'ios',
          'android',
          'ml',
          'ai',
          'security',
          'devops',
          'qa',
          'sre',
          'analytics',
          'analyst'
        ]);

        for (const app of candidates) {
          const candReq = app.external_req_id ? normalizeExternalReqId(app.external_req_id) : null;
          if (externalReqId && candReq && externalReqId !== candReq) {
            logDebug('matching.confirmation_skip_req_mismatch', {
              eventId: event.id,
              candidateId: app.id,
              inReq: externalReqId,
              candReq
            });
            continue;
          }
          const appRoleRaw = app.job_title || app.role || '';
          const appRoleSlug = normalizeRoleSlug(appRoleRaw);
          const appTokens = roleTokens(appRoleSlug);
          const appTail = extractRoleTail(appRoleRaw);
        const appTailTokens = appTail.tailTokens.length ? appTail.tailTokens : appTokens;
        const appStrength = roleStrength(normalizeRoleTokens(appRoleRaw));
        if (!appRoleSlug || !appTokens.length) continue;

        const incomingProgram = isProgramRole(roleBase);
        const appProgram = isProgramRole(appRoleRaw);
        const incomingProgramTail = extractProgramTail(roleBase);
        const appProgramTail = extractProgramTail(appRoleRaw);

        // If both roles are strong and diverge materially, skip immediately
        if (isDivergentStrongRoles(roleBase, appRoleRaw)) {
          continue;
        }

        const compareTokens =
          incomingTailTokens.length && appTailTokens.length ? [incomingTailTokens, appTailTokens] : [incomingTokens, appTokens];
        const jaccard = jaccardSimilarity(compareTokens[0], compareTokens[1]);
        const prefixMatch =
          incomingRoleSlug.startsWith(appRoleSlug) || appRoleSlug.startsWith(incomingRoleSlug);
        const rawIncomingSlug = normalizeSlug(roleBase);
        const rawPrefixMatch =
          rawIncomingSlug &&
          (appRoleSlug.startsWith(rawIncomingSlug) || rawIncomingSlug.startsWith(appRoleSlug));
        const subset =
          incomingTokens.length &&
          incomingTokens.every((t) => appTokens.includes(t)) &&
          appTokens.length >= 2;

          const incomingSpecs = new Set(compareTokens[0].filter((t) => specializationSet.has(t)));
          const appSpecs = new Set(compareTokens[1].filter((t) => specializationSet.has(t)));
          const specOverlap = [...incomingSpecs].some((t) => appSpecs.has(t));
          const specDiverge =
            incomingSpecs.size && appSpecs.size && !specOverlap;

          const bothStrong = incomingStrength.strong && appStrength.strong;
          const eitherWeak = incomingStrength.weak || appStrength.weak;

          // Divergence on tails for strong roles
          let divergent = false;
          if (bothStrong) {
            const setIncoming = new Set(compareTokens[0]);
            const setApp = new Set(compareTokens[1]);
            let diff = 0;
            for (const t of setIncoming) {
              if (!setApp.has(t)) diff++;
            }
            for (const t of setApp) {
              if (!setIncoming.has(t)) diff++;
            }
            if (diff >= 2) divergent = true;
          }

          // Hard block when both roles are strong but specializations diverge or tokens diverge
          if (bothStrong && (specDiverge || divergent)) {
            continue;
          }

          // If both strong and only one side carries specialization signals, treat as divergent
          if (bothStrong && !specOverlap && (incomingSpecs.size || appSpecs.size)) {
            continue;
          }

          logDedupe('matching.dedupe_fuzzy_eval', {
            eventId: event.id,
            incomingRole: roleBase,
            incomingSlug: incomingRoleSlug,
            incomingTail: incomingTail.tail || null,
            incomingWeak: incomingStrength.weak,
            incomingStrong: incomingStrength.strong,
            candidateRole: appRoleRaw,
            candidateSlug: appRoleSlug,
            candidateTail: appTail.tail || null,
            candidateWeak: appStrength.weak,
            candidateStrong: appStrength.strong,
            jaccard: Number(jaccard.toFixed ? jaccard.toFixed(3) : jaccard),
            prefixMatch,
            subset,
            specDiverge,
            divergent,
            timeWindowHours: windowHours
          });

          // Program-tail guard: if both are program roles with strong tails, require tail similarity
          if (
            incomingProgram &&
            appProgram &&
            incomingProgramTail.tailStrength &&
            appProgramTail.tailStrength
          ) {
            const tailSim = tailSimilarity(
              incomingProgramTail.tailTokens,
              appProgramTail.tailTokens
            );
            logDedupe('matching.dedupe_fuzzy_eval', {
              eventId: event.id,
              incomingRole: roleBase,
              incomingSlug: incomingRoleSlug,
              incomingTail: incomingProgramTail.tailSlug,
              candidateRole: appRoleRaw,
              candidateSlug: appRoleSlug,
              candidateTail: appProgramTail.tailSlug,
              tailSim,
              program: true
            });
            if (tailSim < 0.8) {
              continue;
            }
          }

        let roleMatch = false;
        if (eitherWeak) {
          roleMatch = prefixMatch || rawPrefixMatch || subset || jaccard >= 0.7;
        } else {
          roleMatch = jaccard >= 0.85 && !divergent && !specDiverge;
        }

          const locOk = locationsCompatible(identity.jobLocation || identity.location || null, app.job_location);

          // Enforce time window for fuzzy confirmation
          const candidateTsIso = app.last_activity_at || app.updated_at || app.created_at || null;
          const candidateMs = candidateTsIso ? new Date(candidateTsIso).getTime() : null;
          const deltaHours =
            candidateMs !== null ? Math.abs(eventTimeMs - candidateMs) / 3600000 : Infinity;
          if (!externalReqId && deltaHours > windowHours) {
            continue;
          }

        if (
          roleMatch &&
          locOk &&
          companyConf >= MIN_COMPANY_CONFIDENCE &&
          classificationConfidence >= MIN_CLASSIFICATION_CONFIDENCE
        ) {
            const guard = shouldAllowAutoAttach({
              incomingIdentity: identity,
              candidateApplication: app,
              incomingEvent: event
            });
            if (!guard.allowed) {
              logDebug('matching.auto_attach_blocked', {
                eventId: event.id,
                candidateId: app.id,
                reason: guard.reason
              });
              continue;
            }
            await attachEventToApplication(db, event.id, app.id);
            await updateApplicationActivity(db, app, event);
            applyCompanyCandidate(db, app, selectCompanyCandidate(identity));
            const roleCandidate = selectRoleCandidate(identity, event);
            const currentTitle = app.job_title || app.role || '';
            if (roleCandidate?.title && roleCandidate.title.length >= (currentTitle || '').length) {
              applyRoleCandidate(db, app, roleCandidate);
            }
            applyExternalReqId(db, app, externalReqId);
            await refreshApplicationMetadataFromTimeline(db, app.id);
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

    // Weak-role ATS/company fallback to merge corporate + ATS confirmations
    if (canonicalCompany) {
      const companySlug = normalizeSlug(canonicalCompany);
      const windowStart = new Date(eventTimeMs - FUZZY_CONFIRMATION_WINDOW_HOURS * 3600000).toISOString();
      const weakIncoming =
        isWeakRoleText(roleForMatch || identity.jobTitle || event.role_title) ||
        normalizeDisplayTitle(roleForMatch || identity.jobTitle || event.role_title) === UNKNOWN_ROLE;
      const candidates = normalizeRowList(
        await awaitMaybe(
          db
            .prepare(
              `SELECT * FROM job_applications
               WHERE user_id = ?
                 AND archived = false
                 AND lower(replace(company_name, ' ', '')) = ?
                AND ${coalesceTimestamps(['last_activity_at', 'updated_at', 'created_at'])} >= ?`
            )
            .all(userId, companySlug, windowStart)
        )
      );
      for (const app of candidates) {
        const candReq = app.external_req_id ? normalizeExternalReqId(app.external_req_id) : null;
        if (externalReqId && candReq && externalReqId !== candReq) {
          logDebug('matching.confirmation_skip_req_mismatch', {
            eventId: event.id,
            candidateId: app.id,
            inReq: externalReqId,
            candReq
          });
          continue;
        }
        const appWeak = isWeakRoleText(app.job_title || app.role);
        const atsRegex = /(workday|myworkday|greenhouse|lever|icims|workable|jobvite|applytojob|smartrecruiters)/i;
        const atsInvolved =
          identity.isAtsDomain ||
          (app.source && atsRegex.test(app.source)) ||
          (app.company && atsRegex.test(app.company));
        const appCompanyConf = Number.isFinite(app.company_confidence) ? app.company_confidence : 1;
        const identityCompanyConf = identity.companyConfidence || 0;
        if (!atsInvolved) continue;
        if (identityCompanyConf < MIN_COMPANY_CONFIDENCE || appCompanyConf < MIN_COMPANY_CONFIDENCE) continue;
        if (weakIncoming && appWeak) continue;

        const guard = shouldAllowAutoAttach({
          incomingIdentity: identity,
          candidateApplication: app,
          incomingEvent: event
        });
        if (!guard.allowed) {
          logDebug('matching.auto_attach_blocked', {
            eventId: event.id,
            candidateId: app.id,
            reason: guard.reason
          });
          continue;
        }
        await attachEventToApplication(db, event.id, app.id);
        await updateApplicationActivity(db, app, event);
        applyCompanyCandidate(db, app, selectCompanyCandidate(identity));
        const roleCandidate = selectRoleCandidate(identity, event);
        const currentTitle = app.job_title || app.role || '';
        const incomingStrong = !weakIncoming;
        if (incomingStrong && roleCandidate?.title && (appWeak || roleCandidate.title.length > currentTitle.length)) {
          applyRoleCandidate(db, app, roleCandidate);
        }
        applyExternalReqId(db, app, externalReqId);
        await refreshApplicationMetadataFromTimeline(db, app.id);
        logDebug('matching.confirmation_weak_role_dedupe', {
          eventId: event.id,
          applicationId: app.id,
          weakIncoming,
          appWeak,
          atsInvolved
        });
        return { action: 'matched_existing', applicationId: app.id, identity };
      }
    }
  }

  const application = await createApplicationFromEvent(db, userId, identity, event);
  await attachEventToApplication(db, event.id, application.id);
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
