const crypto = require('crypto');
const { google } = require('googleapis');
const { getAuthorizedClient } = require('./email');
const {
  classifyEmail,
  isLinkedInJobsUpdateEmail,
  isLinkedInJobsApplicationSentEmail
} = require('../../shared/emailClassifier');
const { matchAndAssignEvent } = require('./matching');
const {
  extractThreadIdentity,
  extractJobTitle,
  extractExternalReqId,
  normalizeJobIdentity
} = require('../../shared/matching');
const { runStatusInferenceForApplication } = require('./statusInferenceRunner');
const { logInfo, logDebug } = require('./logger');
const { runLlmExtraction, getConfig: getLlmConfig } = require('./llmClient');
const { shouldInvokeLlm } = require('./llmGate');
const { getEmailEventColumns } = require('./db');

async function awaitMaybe(value) {
  return value && typeof value.then === 'function' ? await value : value;
}

function normalizeRowList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.rows)) return value.rows;
  if (value && typeof value === 'object') return [value];
  return [];
}

function boolBind(db, value) {
  if (db && db.isAsync) {
    return Boolean(value);
  }
  return value ? 1 : 0;
}

const REASON_KEYS = [
  'classified_not_job_related',
  'denylisted',
  'missing_identity',
  'low_confidence',
  'not_confident_for_create',
  'ambiguous_sender',
  'ambiguous_match',
  'ambiguous_match_rejection',
  'ambiguous_linkedin_match',
  'below_threshold',
  'provider_filtered',
  'parse_error',
  'duplicate',
  'duplicate_provider_message_id',
  'duplicate_rfc_message_id',
  'matched_existing',
  'auto_created',
  'unsorted_created'
];

const HIGH_SIGNAL_TYPES = new Set([
  'offer',
  'interview',
  'interview_requested',
  'interview_scheduled',
  'meeting_requested'
]);

const GENERIC_MAIL_BASES = new Set([
  'gmail',
  'yahoo',
  'outlook',
  'hotmail',
  'protonmail',
  'icloud'
]);

function initReasonCounters() {
  return REASON_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

function isHighSignalClassification(classification) {
  const type = String(classification?.detectedType || '').toLowerCase();
  const reason = String(classification?.reason || '').toLowerCase();
  const confidence = Number.isFinite(classification?.confidenceScore) ? classification.confidenceScore : 0;
  if (HIGH_SIGNAL_TYPES.has(type)) {
    return true;
  }
  if (type === 'rejection' && (confidence >= 0.95 || reason === 'rejection_override' || reason === 'rejection_strong')) {
    return true;
  }
  return false;
}

function extractSenderEmail(sender) {
  const text = String(sender || '').trim();
  if (!text) {
    return null;
  }
  const angled = text.match(/<([^>]+)>/);
  const candidate = angled && angled[1] ? angled[1] : text;
  const direct = String(candidate).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return direct ? direct[0].toLowerCase() : null;
}

function inferCompanyFromSenderDomain(sender) {
  const senderEmail = extractSenderEmail(sender);
  if (!senderEmail) {
    return null;
  }
  const parts = senderEmail.split('@');
  if (parts.length !== 2) {
    return null;
  }
  const domain = String(parts[1] || '').toLowerCase();
  if (!domain) {
    return null;
  }
  const domainParts = domain.split('.').filter(Boolean);
  if (domainParts.length < 2) {
    return null;
  }
  const base = domainParts[domainParts.length - 2];
  if (!base || GENERIC_MAIL_BASES.has(base)) {
    return null;
  }
  const words = base
    .split(/[-_]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
  if (!words.length) {
    return null;
  }
  return words.join(' ');
}

function inferFallbackRole(subject, snippet, bodyText) {
  const text = `${String(subject || '')}\n${String(snippet || '')}\n${String(bodyText || '')}`;
  if (/\b(technical|software|engineer|developer|coding|projects?|resume|transcript)\b/i.test(text)) {
    return 'Technical opportunity';
  }
  return 'Intro call';
}

function applyHighSignalFallbackIdentity({
  classification,
  identity,
  rolePayload,
  sender,
  subject,
  snippet,
  bodyText
}) {
  if (!isHighSignalClassification(classification)) {
    return {
      identity,
      rolePayload,
      fallbackApplied: false
    };
  }

  const nextIdentity = { ...(identity || {}) };
  let nextRolePayload = rolePayload;
  let fallbackApplied = false;

  if (String(nextIdentity.companyName || '').includes('@')) {
    nextIdentity.companyName = null;
  }

  if (!nextIdentity.companyName) {
    const inferredFromDomain = inferCompanyFromSenderDomain(sender);
    if (inferredFromDomain) {
      nextIdentity.companyName = inferredFromDomain;
      nextIdentity.companyConfidence = Math.max(nextIdentity.companyConfidence || 0, 0.78);
      nextIdentity.explanation = `${nextIdentity.explanation || 'No identity match.'} Derived company from sender domain for high-signal event.`;
      fallbackApplied = true;
    }
  }

  if (!nextIdentity.companyName) {
    nextIdentity.companyName = 'Direct Outreach';
    nextIdentity.companyConfidence = Math.max(nextIdentity.companyConfidence || 0, 0.72);
    nextIdentity.explanation = `${nextIdentity.explanation || 'No identity match.'} Applied Direct Outreach fallback for high-signal event.`;
    fallbackApplied = true;
  }

  if (!nextRolePayload?.jobTitle) {
    const roleFallback = inferFallbackRole(subject, snippet, bodyText);
    nextRolePayload = {
      jobTitle: roleFallback,
      confidence: 0.66,
      source: 'fallback',
      explanation: 'High-signal scheduling fallback role.'
    };
    fallbackApplied = true;
  }

  if (!nextIdentity.jobTitle && nextRolePayload?.jobTitle) {
    nextIdentity.jobTitle = nextRolePayload.jobTitle;
  }
  if (!Number.isFinite(nextIdentity.roleConfidence) && Number.isFinite(nextRolePayload?.confidence)) {
    nextIdentity.roleConfidence = nextRolePayload.confidence;
  }
  if (!Number.isFinite(nextIdentity.domainConfidence)) {
    nextIdentity.domainConfidence = 0.35;
  }
  if (!Number.isFinite(nextIdentity.matchConfidence)) {
    const companyConf = Number.isFinite(nextIdentity.companyConfidence) ? nextIdentity.companyConfidence : 0;
    const roleConf = Number.isFinite(nextRolePayload?.confidence) ? nextRolePayload.confidence : companyConf;
    nextIdentity.matchConfidence = Math.min(companyConf || 0.72, roleConf || 0.66);
  }

  return {
    identity: nextIdentity,
    rolePayload: nextRolePayload,
    fallbackApplied
  };
}

// Simple in-memory sync progress tracker keyed by sync_id
const syncProgressStore = new Map();
const SYNC_PROGRESS_TTL_MS = 10 * 60 * 1000; // keep completed records around briefly for UI polling

function pruneSyncProgressStore(now = Date.now()) {
  for (const [syncId, entry] of syncProgressStore.entries()) {
    if (!entry) continue;
    if (entry.status === 'running') continue;
    const updatedAt = entry.updatedAt ? Date.parse(entry.updatedAt) : NaN;
    if (!Number.isNaN(updatedAt) && now - updatedAt > SYNC_PROGRESS_TTL_MS) {
      syncProgressStore.delete(syncId);
    }
  }
}

function setSyncProgress(syncId, payload) {
  if (!syncId) return;
  pruneSyncProgressStore();
  const existing = syncProgressStore.get(syncId) || {};
  const total =
    payload.total !== undefined ? payload.total : existing.total !== undefined ? existing.total : null;
  syncProgressStore.set(syncId, {
    syncId,
    status: payload.status || existing.status || 'running',
    phase: payload.phase || existing.phase || 'listing',
    processed: payload.processed ?? existing.processed ?? 0,
    total,
    pagesFetched: payload.pagesFetched ?? existing.pagesFetched ?? 0,
    createdApplications: payload.createdApplications ?? existing.createdApplications ?? 0,
    matchedExisting: payload.matchedExisting ?? existing.matchedExisting ?? 0,
    llmCalls: payload.llmCalls ?? existing.llmCalls ?? 0,
    error: payload.error || null,
    updatedAt: new Date().toISOString()
  });
}

function getSyncProgress(syncId) {
  if (!syncId) return null;
  pruneSyncProgressStore();
  return syncProgressStore.get(syncId) || null;
}

function truncateSnippet(snippet, max = 140) {
  if (!snippet) {
    return null;
  }
  const clean = String(snippet).replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) : clean;
}

function decodeBase64Url(value) {
  if (!value) {
    return '';
  }
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function decodeQuotedPrintable(value) {
  const source = String(value || '');
  if (!source || !/(=\r?\n|=[0-9A-Fa-f]{2})/.test(source)) {
    return source;
  }
  const cleaned = source.replace(/=\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    const hex = cleaned.slice(i + 1, i + 3);
    if (ch === '=' && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(cleaned.charCodeAt(i));
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

function decodeHtmlEntities(value) {
  const named = {
    nbsp: ' ',
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    '#39': "'"
  };
  return String(value || '').replace(/&([a-zA-Z0-9#]+);/g, (match, entity) => {
    const key = String(entity).toLowerCase();
    if (named[key] !== undefined) {
      return named[key];
    }
    if (key.startsWith('#x')) {
      const codePoint = parseInt(key.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (key.startsWith('#')) {
      const codePoint = parseInt(key.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return match;
  });
}

function normalizeExtractedText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripHtml(value) {
  const withBreaks = String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return normalizeExtractedText(decodeHtmlEntities(withBreaks));
}

function collectTextParts(payload, list = []) {
  if (!payload) {
    return list;
  }
  const mimeType = String(payload.mimeType || '').toLowerCase();
  const body = payload.body || {};
  if (
    mimeType.startsWith('text/plain') ||
    mimeType.startsWith('text/html')
  ) {
    list.push({
      mimeType,
      data: body.data || null,
      attachmentId: body.attachmentId || null
    });
  }
  const parts = payload.parts || [];
  for (const part of parts) {
    collectTextParts(part, list);
  }
  return list;
}

async function loadPartBodyText(part, { gmail, messageId, fetchAttachmentBodies = false } = {}) {
  if (!part) {
    return '';
  }
  let raw = '';
  if (part.data) {
    raw = decodeBase64Url(part.data);
  } else if (part.attachmentId && fetchAttachmentBodies && gmail && messageId) {
    try {
      const attachment = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: part.attachmentId
      });
      raw = decodeBase64Url(attachment?.data?.data);
    } catch (err) {
      if (process.env.DEBUG_INGEST_LINKEDIN === '1') {
        logDebug('ingest.attachment_fetch_failed', {
          messageId,
          attachmentId: part.attachmentId,
          error: err && err.message ? String(err.message) : String(err)
        });
      }
      raw = '';
    }
  }
  if (!raw) {
    return '';
  }
  const decoded = decodeQuotedPrintable(raw);
  if (part.mimeType.startsWith('text/html')) {
    return stripHtml(decoded);
  }
  return normalizeExtractedText(decodeHtmlEntities(decoded));
}

async function extractEmailBodyText(payload, options = {}) {
  if (!payload) {
    return '';
  }
  const parts = collectTextParts(payload, []);
  if (!parts.length) {
    const rootMime = String(payload.mimeType || '').toLowerCase();
    const rootData = payload?.body?.data || null;
    const rootAttachmentId = payload?.body?.attachmentId || null;
    if (rootMime.startsWith('text/plain') || rootMime.startsWith('text/html')) {
      parts.push({ mimeType: rootMime, data: rootData, attachmentId: rootAttachmentId });
    }
  }
  const bodyChunks = [];
  for (const part of parts) {
    const partText = await loadPartBodyText(part, options);
    if (partText) {
      bodyChunks.push(partText);
    }
  }
  return truncateBodyText(bodyChunks.join('\n\n'));
}

function truncateBodyText(text, max = 4000) {
  if (!text) {
    return '';
  }
  const clean = String(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return clean.length > max ? clean.slice(0, max) : clean;
}

async function extractMessageMetadata(details, options = {}) {
  const headers = details?.payload?.headers || [];
  const sender = parseHeader(headers, 'From');
  const subject = parseHeader(headers, 'Subject');
  const rfcMessageId = parseHeader(headers, 'Message-ID') || null;
  const snippet = details?.snippet || '';
  const internalDate = details?.internalDate ? Number(details.internalDate) : null;
  const bodyText = await extractEmailBodyText(details?.payload, options);
  return { sender, subject, rfcMessageId, snippet, internalDate, bodyText };
}

function parseHeader(headers, name) {
  const header = (headers || []).find(
    (entry) => entry.name && entry.name.toLowerCase() === name.toLowerCase()
  );
  return header?.value || '';
}

function categorizeSenderDomain(sender = '') {
  const domain = sender.includes('@') ? sender.split('@')[1].replace(/[> ]/g, '').toLowerCase() : '';
  if (!domain) return 'unknown';
  if (domain.includes('indeed')) return 'indeed';
  if (domain.includes('greenhouse')) return 'greenhouse';
  if (domain.includes('myworkday') || domain.includes('workday')) return 'workday';
  if (domain.includes('icims')) return 'icims';
  if (domain.includes('workable')) return 'workable';
  if (domain.includes('breezy')) return 'breezy';
  if (domain.includes('applytojob')) return 'applytojob';
  if (domain.includes('lever')) return 'lever';
  if (domain.includes('smartrecruiters')) return 'smartrecruiters';
  if (domain.includes('taleo') || domain.includes('talemetry')) return 'taleo';
  if (domain.includes('ashby')) return 'ashby';
  if (domain.includes('gmail')) return 'gmail';
  return domain;
}

async function recordSkipSample({ db, userId, provider, messageId, sender, subject, reasonCode }) {
  try {
    const res = db
      .prepare(
        `INSERT INTO email_skip_samples
         (id, user_id, provider, provider_message_id, sender, subject, reason_code, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        crypto.randomUUID(),
        userId,
        provider,
        messageId,
        sender || null,
        subject || null,
        reasonCode,
        new Date().toISOString()
      );
    await awaitMaybe(res);
  } catch (err) {
    logDebug('ingest.skip_sample_failed', { userId, messageId, reasonCode });
  }
}

const COLUMN_TO_PAYLOAD = {
  id: 'id',
  user_id: 'userId',
  provider: 'provider',
  message_id: 'messageId',
  provider_message_id: 'providerMessageId',
  rfc_message_id: 'rfcMessageId',
  sender: 'sender',
  subject: 'subject',
  internal_date: 'internalDate',
  snippet: 'snippet',
  detected_type: 'detectedType',
  confidence_score: 'confidenceScore',
  classification_confidence: 'classificationConfidence',
  identity_confidence: 'identityConfidence',
  identity_company_name: 'identityCompanyName',
  identity_job_title: 'identityJobTitle',
  identity_company_confidence: 'identityCompanyConfidence',
  identity_explanation: 'identityExplanation',
  explanation: 'explanation',
  reason_code: 'reasonCode',
  reason_detail: 'reasonDetail',
  role_title: 'roleTitle',
  role_confidence: 'roleConfidence',
  role_source: 'roleSource',
  role_explanation: 'roleExplanation',
  external_req_id: 'externalReqId',
  ingest_decision: 'ingestDecision',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  llm_ran: 'llmRan',
  llm_status: 'llmStatus',
  llm_error: 'llmError',
  llm_model: 'llmModel',
  llm_latency_ms: 'llmLatency',
  llm_event_type: 'llmEventType',
  llm_confidence: 'llmConfidence',
  llm_company_name: 'llmCompanyName',
  llm_job_title: 'llmJobTitle',
  llm_external_req_id: 'llmExternalReqId',
  llm_provider_guess: 'llmProviderGuess',
  llm_reason_codes: 'llmReasonCodes',
  llm_raw_json: 'llmRawJson'
};

function normalizeSqliteValue(v) {
  if (v === undefined) return null;
  if (v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (Array.isArray(v)) return JSON.stringify(v);
  if (Buffer.isBuffer(v)) return v;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

function insertEmailEventRecord(db, payload) {
  const now = new Date().toISOString();
  const createdAt = payload.createdAt || now;
  const updatedAt = payload.updatedAt || createdAt;

  // SQLite evolves via ALTER TABLE migrations; we probe columns at runtime.
  // Postgres schema is migration-managed; avoid SQLite PRAGMA queries.
  const columnsAvailable = db && db.isAsync ? null : getEmailEventColumns(db);
  const cols = [];
  const placeholders = [];
  const values = [];
  for (const [column, prop] of Object.entries(COLUMN_TO_PAYLOAD)) {
    if (columnsAvailable && !columnsAvailable.has(column)) {
      continue;
    }
    cols.push(column);
    placeholders.push('?');
    if (column === 'llm_ran') {
      values.push(normalizeSqliteValue(payload.llmRan ?? (payload.llmStatus ? 1 : 0)));
    } else if (column === 'created_at') {
      values.push(createdAt);
    } else if (column === 'updated_at') {
      values.push(updatedAt);
    } else if (db && db.isAsync && column === 'internal_date') {
      const raw = payload[prop];
      values.push(raw === null || raw === undefined ? null : new Date(Number(raw)).toISOString());
    } else {
      values.push(normalizeSqliteValue(payload[prop]));
    }
  }
  const sql = `INSERT INTO email_events (${cols.join(',')}) VALUES (${placeholders.join(',')})`;
  if (process.env.NODE_ENV !== 'production') {
    values.forEach((val, idx) => {
      const col = cols[idx];
      const t = typeof val;
      const ok = val === null || t === 'number' || t === 'string' || t === 'bigint' || Buffer.isBuffer(val);
      if (!ok) {
        throw new Error(`Unsupported SQLite bind for column ${col}: ${t}`);
      }
    });
  }
  return db.prepare(sql).run(...values);
}

function updateEmailEventRecord(db, eventId, payload) {
  const now = new Date().toISOString();
  const updatedAt = payload.updatedAt || now;
  const columnsAvailable = db && db.isAsync ? null : getEmailEventColumns(db);
  const assignments = [];
  const values = [];
  for (const [column, prop] of Object.entries(COLUMN_TO_PAYLOAD)) {
    if (column === 'id' || column === 'created_at') {
      continue;
    }
    if (columnsAvailable && !columnsAvailable.has(column)) {
      continue;
    }
    assignments.push(`${column} = ?`);
    if (column === 'llm_ran') {
      values.push(normalizeSqliteValue(payload.llmRan ?? (payload.llmStatus ? 1 : 0)));
    } else if (column === 'updated_at') {
      values.push(updatedAt);
    } else if (db && db.isAsync && column === 'internal_date') {
      const raw = payload[prop];
      values.push(raw === null || raw === undefined ? null : new Date(Number(raw)).toISOString());
    } else {
      values.push(normalizeSqliteValue(payload[prop]));
    }
  }
  if (!assignments.length) {
    return { changes: 0 };
  }
  values.push(eventId);
  const sql = `UPDATE email_events SET ${assignments.join(', ')} WHERE id = ?`;
  return db.prepare(sql).run(...values);
}

function isLinkedInDuplicateReprocessCandidate(existingEvent) {
  if (!existingEvent || !existingEvent.id) {
    return false;
  }
  const linkedInRejectionEnvelope = isLinkedInJobsUpdateEmail({
    sender: existingEvent.sender || '',
    subject: existingEvent.subject || '',
    snippet: existingEvent.snippet || '',
    body: ''
  });
  const linkedInConfirmationEnvelope = isLinkedInJobsApplicationSentEmail({
    sender: existingEvent.sender || '',
    subject: existingEvent.subject || '',
    snippet: existingEvent.snippet || '',
    body: ''
  });
  if (!linkedInRejectionEnvelope && !linkedInConfirmationEnvelope) {
    return false;
  }
  const detectedType = String(existingEvent.detected_type || '').toLowerCase();
  const reasonCode = String(existingEvent.reason_code || '').toLowerCase();
  const storedRole = String(existingEvent.role_title || existingEvent.identity_job_title || '').toLowerCase();
  const malformedLinkedInRole =
    !storedRole ||
    /your application was sent to/i.test(storedRole) ||
    /linkedin/i.test(storedRole) ||
    storedRole === 'unknown role';
  if (linkedInConfirmationEnvelope) {
    if (!detectedType) {
      return true;
    }
    if (reasonCode && ['classified_not_job_related', 'denylisted', 'below_threshold'].includes(reasonCode)) {
      return true;
    }
    if (detectedType !== 'confirmation') {
      return true;
    }
    return malformedLinkedInRole;
  }
  if (!detectedType) {
    return true;
  }
  return detectedType !== 'rejection';
}

function hasLinkedInRejectionPhrase(text) {
  return /(?:unfortunately,\s*)?we will not be moving forward with your application/i.test(
    String(text || '')
  );
}

function toValidMs(value) {
  if (!value) {
    return null;
  }
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function pickApplicationAnchorMs(app) {
  return (
    toValidMs(app.applied_at) ||
    toValidMs(app.last_activity_at) ||
    toValidMs(app.updated_at) ||
    toValidMs(app.created_at)
  );
}

function normalizeLinkedInIdentityKey(companyName, roleTitle) {
  const companyKey = normalizeJobIdentity(companyName || null);
  const roleKey = normalizeJobIdentity(roleTitle || null);
  if (!companyKey || !roleKey) {
    return null;
  }
  return `${companyKey}|${roleKey}`;
}

function pickLinkedInMergeWinner(candidates) {
  const scored = [...candidates].sort((a, b) => {
    const scoreA = (a.rejectionCount > 0 ? 2 : 0) + (a.confirmationCount > 0 ? 1 : 0);
    const scoreB = (b.rejectionCount > 0 ? 2 : 0) + (b.confirmationCount > 0 ? 1 : 0);
    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }
    const anchorA = pickApplicationAnchorMs(a);
    const anchorB = pickApplicationAnchorMs(b);
    if (anchorA && anchorB) {
      return anchorA - anchorB;
    }
    if (anchorA && !anchorB) return -1;
    if (!anchorA && anchorB) return 1;
    return String(a.id).localeCompare(String(b.id));
  });
  return scored[0] || null;
}

async function repairLinkedInSplitApplications(db, userId, { syncStart, syncEnd } = {}) {
  const startIso = syncStart ? new Date(syncStart).toISOString() : new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  const endIso = syncEnd ? new Date(syncEnd).toISOString() : new Date().toISOString();
  const archivedFalse = boolBind(db, false);
  const archivedTrue = boolBind(db, true);

  const rows = normalizeRowList(
    await awaitMaybe(
      db
        .prepare(
          `SELECT
             a.id,
             a.company,
             a.company_name,
             a.role,
             a.job_title,
             a.applied_at,
             a.last_activity_at,
             a.updated_at,
             a.created_at,
             a.current_status,
             SUM(CASE WHEN e.detected_type = 'rejection' THEN 1 ELSE 0 END) AS rejection_count,
             SUM(CASE WHEN e.detected_type = 'confirmation' THEN 1 ELSE 0 END) AS confirmation_count,
             COUNT(e.id) AS event_count
           FROM job_applications a
           JOIN email_events e ON e.application_id = a.id
           WHERE a.user_id = ?
             AND a.archived = ?
             AND e.user_id = ?
             AND e.created_at >= ?
             AND e.created_at <= ?
             AND lower(e.sender) LIKE ?
           GROUP BY a.id`
        )
        .all(userId, archivedFalse, userId, startIso, endIso, '%jobs-noreply@linkedin.com%')
    )
  );

  const candidates = rows
    .map((row) => {
      const key = normalizeLinkedInIdentityKey(row.company_name || row.company, row.job_title || row.role);
      return {
        ...row,
        identityKey: key,
        rejectionCount: Number(row.rejection_count || 0),
        confirmationCount: Number(row.confirmation_count || 0),
        eventCount: Number(row.event_count || 0)
      };
    })
    .filter((row) => row.identityKey && row.eventCount > 0 && row.eventCount <= 5);

  const byKey = new Map();
  for (const row of candidates) {
    if (!byKey.has(row.identityKey)) {
      byKey.set(row.identityKey, []);
    }
    byKey.get(row.identityKey).push(row);
  }

  let mergedPairs = 0;
  let movedEvents = 0;
  let archivedApps = 0;
  for (const [identityKey, group] of byKey.entries()) {
    if (group.length !== 2) {
      continue;
    }
    const hasRejection = group.some((g) => g.rejectionCount > 0 || String(g.current_status || '').toUpperCase() === 'REJECTED');
    const hasConfirmation = group.some((g) => g.confirmationCount > 0 || String(g.current_status || '').toUpperCase() === 'APPLIED');
    if (!hasRejection || !hasConfirmation) {
      continue;
    }

    const anchors = group.map((g) => pickApplicationAnchorMs(g)).filter((ms) => Number.isFinite(ms));
    if (anchors.length < 2) {
      continue;
    }
    const spanDays = Math.abs(Math.max(...anchors) - Math.min(...anchors)) / (24 * 60 * 60 * 1000);
    if (spanDays > 21) {
      continue;
    }

    const winner = pickLinkedInMergeWinner(group);
    if (!winner) {
      continue;
    }
    const losers = group.filter((g) => g.id !== winner.id);
    if (losers.length !== 1) {
      continue;
    }
    const loser = losers[0];

    const moved = await awaitMaybe(
      db
        .prepare('UPDATE email_events SET application_id = ? WHERE user_id = ? AND application_id = ?')
        .run(winner.id, userId, loser.id)
    );
    const movedCount = Number(moved?.changes || moved?.rowCount || 0);
    if (movedCount <= 0) {
      continue;
    }
    movedEvents += movedCount;

    await awaitMaybe(
      db
        .prepare('UPDATE job_applications SET archived = ?, user_override = ?, updated_at = ? WHERE user_id = ? AND id = ?')
        .run(archivedTrue, archivedTrue, new Date().toISOString(), userId, loser.id)
    );
    archivedApps += 1;
    mergedPairs += 1;

    await awaitMaybe(runStatusInferenceForApplication(db, userId, winner.id));

    if (process.env.DEBUG_INGEST_LINKEDIN_MATCH === '1') {
      logDebug('ingest.linkedin_repair_merge_applied', {
        userId,
        identityKey,
        winnerId: winner.id,
        loserId: loser.id,
        movedEvents: movedCount,
        spanDays: Number(spanDays.toFixed(3))
      });
    }
  }

  if (process.env.DEBUG_INGEST_LINKEDIN_MATCH === '1') {
    logDebug('ingest.linkedin_repair_merge_summary', {
      userId,
      syncStart: startIso,
      syncEnd: endIso,
      candidateCount: candidates.length,
      mergedPairs,
      movedEvents,
      archivedApps
    });
  }

  return {
    mergedPairs,
    movedEvents,
    archivedApps
  };
}

async function syncGmailMessages({
  db,
  userId,
  days = 30,
  maxResults = 100,
  syncId = null,
  mode = 'days',
  timeWindowStart = null,
  timeWindowEnd = null
}) {
  const authClient = await getAuthorizedClient(db, userId);
  if (!authClient) {
    return { status: 'not_connected' };
  }

  const gmail = google.gmail({ version: 'v1', auth: authClient });
  let pageToken;
  let fetched = 0;
  let pagesFetched = 0;
  let totalMessagesListed = 0;
  let created = 0;
  let skippedDuplicate = 0;
  let skippedNotJob = 0;
  let matchedExisting = 0;
  let createdApplications = 0;
  let unsortedCreated = 0;
  let jobRelatedCandidates = 0;
  let filteredOutDenylist = 0;
  let classifiedConfirmation = 0;
  let classifiedRejection = 0;
  let storedEventsTotal = 0;
  let storedEventsConfirmation = 0;
  let storedEventsRejection = 0;
  let matchedEventsConfirmation = 0;
  let matchedEventsRejection = 0;
  let createdAppsConfirmation = 0;
  let createdAppsRejectionOnly = 0;
  let unsortedConfirmationTotal = 0;
  let updatedRejectedTotal = 0;
  let updatedAppliedTotal = 0;
  let unsortedRejectionTotal = 0;
  let skippedDuplicatesProvider = 0;
  let skippedDuplicatesRfc = 0;
  let linkedInRepairMergedPairs = 0;
  let linkedInRepairMovedEvents = 0;
  let linkedInRepairArchivedApps = 0;
  let llmCalls = 0;
  let llmCacheHits = 0;
  let llmFailures = 0;
  let llmUpgradedConfirmations = 0;
  let llmUpgradedRejections = 0;
  let llmAgreements = 0;
  let llmDisagreements = 0;
  let llmUsedIdentity = 0;
  let llmUsedType = 0;
  let llmUsedReqId = 0;
  let llmUsedRole = 0;
  let stoppedReason = 'completed';
  const messageSourceCounts = {};
  const reasons = initReasonCounters();

  const requestedDays = Math.max(1, Math.min(days, 365));
  const parsedWindowEnd = new Date(timeWindowEnd || new Date());
  const safeWindowEnd = Number.isNaN(parsedWindowEnd.getTime()) ? new Date() : parsedWindowEnd;
  const parsedWindowStart = new Date(
    timeWindowStart || new Date(safeWindowEnd.getTime() - requestedDays * 24 * 60 * 60 * 1000)
  );
  let safeWindowStart = Number.isNaN(parsedWindowStart.getTime())
    ? new Date(safeWindowEnd.getTime() - requestedDays * 24 * 60 * 60 * 1000)
    : parsedWindowStart;
  if (safeWindowStart.getTime() >= safeWindowEnd.getTime()) {
    safeWindowStart = new Date(safeWindowEnd.getTime() - 60 * 1000);
  }
  const queryDays = Math.max(
    1,
    Math.round((safeWindowEnd.getTime() - safeWindowStart.getTime()) / (24 * 60 * 60 * 1000))
  );
  const afterSeconds = Math.floor(safeWindowStart.getTime() / 1000);
  const beforeSeconds = Math.max(afterSeconds + 1, Math.ceil(safeWindowEnd.getTime() / 1000));
  const gmailQuery = `after:${afterSeconds} before:${beforeSeconds}`;
  logInfo('ingest.start', {
    userId,
    mode,
    days: queryDays,
    maxResults,
    syncId,
    timeWindowStart: safeWindowStart.toISOString(),
    timeWindowEnd: safeWindowEnd.toISOString()
  });
  const limit = Math.max(1, Math.min(maxResults, 500));

  setSyncProgress(syncId, {
    status: 'running',
    phase: 'listing',
    processed: 0,
    total: limit,
    pagesFetched: 0
  });

  do {
    if (fetched >= limit) {
      break;
    }
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: gmailQuery,
      maxResults: Math.min(100, limit - fetched),
      pageToken
    });

    pagesFetched += 1;
    const messages = list.data.messages || [];
    const estimate = list.data.resultSizeEstimate;
    // Treat limit as total so progress is determinate even before all pages are known
    const totalForRun = limit;
    if (Number.isFinite(estimate)) {
      setSyncProgress(syncId, { total: estimate });
    }
    totalMessagesListed += messages.length;
    setSyncProgress(syncId, {
      phase: 'fetching',
      pagesFetched,
      processed: fetched,
      total: Number.isFinite(estimate) ? estimate : totalForRun
    });
    for (const message of messages) {
      if (fetched >= limit) {
        break;
      }
      const existingProvider = await awaitMaybe(
        db
          .prepare(
            `SELECT id, application_id, sender, subject, snippet, detected_type, reason_code, ingest_decision,
                    role_title, identity_job_title, created_at
             FROM email_events
             WHERE user_id = ? AND provider = ? AND (provider_message_id = ? OR message_id = ?)`
          )
          .get(userId, 'gmail', message.id, message.id)
      );
      const shouldReprocessLinkedInDuplicate = isLinkedInDuplicateReprocessCandidate(existingProvider);
      if (
        shouldReprocessLinkedInDuplicate &&
        process.env.DEBUG_INGEST_LINKEDIN === '1' &&
        /jobs-noreply@linkedin\.com/i.test(String(existingProvider?.sender || ''))
      ) {
        logDebug('ingest.linkedin_jobs_reprocess_duplicate', {
          providerMessageId: message.id,
          subject: existingProvider.subject || null,
          sender: existingProvider.sender || null,
          existingDetectedType: existingProvider.detected_type || null,
          existingReasonCode: existingProvider.reason_code || null,
          existingDecision: existingProvider.ingest_decision || null
        });
      }
      if (existingProvider && !shouldReprocessLinkedInDuplicate) {
        skippedDuplicate += 1;
        reasons.duplicate += 1;
        reasons.duplicate_provider_message_id += 1;
        skippedDuplicatesProvider += 1;
        fetched += 1;
        if (
          process.env.DEBUG_INGEST_LINKEDIN === '1' &&
          /jobs-noreply@linkedin\.com/i.test(String(existingProvider.sender || ''))
        ) {
          logDebug('ingest.linkedin_jobs_duplicate_skipped', {
            providerMessageId: message.id,
            subject: existingProvider.subject || null,
            sender: existingProvider.sender || null,
            duplicateReason: 'existing_email_event',
            existingDetectedType: existingProvider.detected_type || null,
            existingReasonCode: existingProvider.reason_code || null,
            existingDecision: existingProvider.ingest_decision || null
          });
        }
        logDebug('ingest.skip_duplicate', {
          userId,
          messageId: message.id,
          reason: 'duplicate_provider_message_id'
        });
        continue;
      }

      const details = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'full'
      });

      const previewHeaders = details.data?.payload?.headers || [];
      const previewSender = parseHeader(previewHeaders, 'From');
      const previewSubject = parseHeader(previewHeaders, 'Subject');
      const shouldFetchLinkedInAttachments = isLinkedInJobsUpdateEmail({
        sender: previewSender,
        subject: previewSubject,
        snippet: details.data?.snippet || '',
        body: ''
      });

      const {
        sender,
        subject,
        rfcMessageId,
        snippet,
        internalDate,
        bodyText
      } = await extractMessageMetadata(details.data, {
        gmail,
        messageId: message.id,
        fetchAttachmentBodies: shouldFetchLinkedInAttachments
      });
      const sourceBucket = categorizeSenderDomain(sender);
      messageSourceCounts[sourceBucket] = (messageSourceCounts[sourceBucket] || 0) + 1;

      if (rfcMessageId) {
        const existingRfc = await awaitMaybe(
          db
            .prepare('SELECT id FROM email_events WHERE user_id = ? AND provider = ? AND rfc_message_id = ?')
            .get(userId, 'gmail', rfcMessageId)
        );
        const isSameLinkedInReprocessEvent =
          shouldReprocessLinkedInDuplicate &&
          existingProvider &&
          existingRfc &&
          String(existingRfc.id) === String(existingProvider.id);
        if (existingRfc && !isSameLinkedInReprocessEvent) {
          skippedDuplicate += 1;
          reasons.duplicate += 1;
          reasons.duplicate_rfc_message_id += 1;
          skippedDuplicatesRfc += 1;
          fetched += 1;
          logDebug('ingest.skip_duplicate', {
            userId,
            messageId: message.id,
            reason: 'duplicate_rfc_message_id'
          });
          continue;
        }
      }

      const linkedInJobsUpdate = isLinkedInJobsUpdateEmail({ subject, snippet, sender, body: bodyText });
      if (process.env.DEBUG_INGEST_LINKEDIN === '1' && /jobs-noreply@linkedin\.com/i.test(String(sender || ''))) {
        logDebug('ingest.linkedin_jobs_fetched', {
          providerMessageId: message.id,
          subject: subject || null,
          sender: sender || null,
          isLinkedInJobsUpdate: linkedInJobsUpdate,
          reprocessingDuplicate: Boolean(shouldReprocessLinkedInDuplicate),
          snippetLength: String(snippet || '').length,
          snippetPreview: truncateSnippet(snippet, 120),
          bodyTextLength: String(bodyText || '').length,
          bodyHasRejectionPhrase: hasLinkedInRejectionPhrase(bodyText),
          fetchedAttachmentBodies: shouldFetchLinkedInAttachments
        });
      }
      const classification = classifyEmail({ subject, snippet, sender, body: bodyText });
      if (
        process.env.DEBUG_INGEST_LINKEDIN === '1' &&
        linkedInJobsUpdate &&
        (!classification.isJobRelated || classification.detectedType === 'confirmation')
      ) {
        const linkedInText = `${subject || ''}\n${snippet || ''}\n${bodyText || ''}`;
        const linkedInIdentity = extractThreadIdentity({ subject, sender, snippet, bodyText });
        const hasUnfortunatelyMovingForward =
          /unfortunately,\s*we will not be moving forward with your application/i.test(linkedInText);
        const hasMovingForwardExact =
          /we will not be moving forward with your application/i.test(linkedInText);
        const hasNotBeMovingForward =
          /not be moving forward with your application/i.test(linkedInText);
        const snippetHasRejectionPhrase = hasLinkedInRejectionPhrase(snippet);
        const bodyHasRejectionPhrase = hasLinkedInRejectionPhrase(bodyText);
        logDebug('ingest.linkedin_jobs_classification_debug', {
          providerMessageId: message.id,
          subject: subject || null,
          sender: sender || null,
          hasSubjectPattern: /^your application to\s+.+\s+at\s+.+/i.test(String(subject || '')),
          hasUpdateFromPattern: /your update from\s+.+/i.test(linkedInText),
          hasUnfortunatelyMovingForward,
          hasMovingForwardExact,
          hasNotBeMovingForward,
          snippetHasRejectionPhrase,
          bodyHasRejectionPhrase,
          extractedCompany: linkedInIdentity?.companyName || null,
          extractedRole: linkedInIdentity?.jobTitle || null,
          classification: classification.detectedType || null,
          isJobRelated: Boolean(classification.isJobRelated),
          reason: classification.reason || null
        });
      }
      if (!classification.isJobRelated) {
        skippedNotJob += 1;
        let reasonCode = 'classified_not_job_related';
        if (classification.reason === 'denylisted') {
          reasonCode = 'denylisted';
          filteredOutDenylist += 1;
        } else if (classification.reason === 'below_threshold') {
          reasonCode = 'below_threshold';
        }
        if (reasonCode === 'denylisted') {
          reasons.denylisted += 1;
        } else if (reasonCode === 'below_threshold') {
          reasons.below_threshold += 1;
        } else {
          reasons.classified_not_job_related += 1;
        }
        if (process.env.DEBUG_INGEST_LINKEDIN === '1' && linkedInJobsUpdate) {
          logDebug('ingest.linkedin_jobs_dropped', {
            providerMessageId: message.id,
            subject: subject || null,
            sender: sender || null,
            reasonCode,
            classifierReason: classification.reason || null,
            classifierType: classification.detectedType || null
          });
        }
        await recordSkipSample({
          db,
          userId,
          provider: 'gmail',
          messageId: message.id,
          sender,
          subject,
          reasonCode
        });
        fetched += 1;
        logDebug('ingest.skip_not_job', {
          userId,
          messageId: message.id,
          explanation: classification.explanation
        });
        continue;
      }
      jobRelatedCandidates += 1;
      if (classification.detectedType === 'confirmation') {
        classifiedConfirmation += 1;
      }
      if (classification.detectedType === 'rejection') {
        classifiedRejection += 1;
      }

      setSyncProgress(syncId, {
        phase: 'classifying',
        processed: fetched,
        pagesFetched,
        total: Number.isFinite(estimate) ? estimate : totalForRun
      });

      const identity = extractThreadIdentity({ subject, sender, snippet, bodyText });
      const indeedApplyDebugEnabled =
        process.env.JOBTRACK_LOG_LEVEL === 'debug' || String(process.env.DEBUG_INGEST_INDEED_MATCH || '') === '1';
      if (indeedApplyDebugEnabled && /indeedapply@indeed\.com/i.test(String(sender || ''))) {
        logDebug('ingest.indeed_apply_identity', {
          providerMessageId: message.id,
          subject: subject || null,
          sender: sender || null,
          providerHint: identity?.providerHint || null,
          extractedCompany: identity?.companyName || null,
          extractedRole: identity?.jobTitle || null,
          companyConfidence: identity?.companyConfidence || 0,
          roleConfidence: identity?.roleConfidence || 0,
          explanation: identity?.explanation || null
        });
      }
      const roleResult = extractJobTitle({
        subject,
        snippet,
        bodyText,
        sender,
        companyName: identity.companyName
      });
      const rolePayload = roleResult && roleResult.jobTitle ? roleResult : null;
      const reqResult = extractExternalReqId({ subject, snippet, bodyText });
      let externalReqId = reqResult.externalReqId || null;
      let effectiveClassification = { ...classification };
      let effectiveIdentity = { ...identity };
      let effectiveRole = rolePayload;
      let llmStatus = 'skipped';
      let llmError = null;
      let llmModel = null;
      let llmLatency = null;
      let llmReasonCodes = [];
      let llmRaw = null;

      const gate = shouldInvokeLlm({
        classification,
        extracted: identity,
        matchResult: null,
        reason: null
      });
      const llmConfig = getLlmConfig();
      const maxCalls = llmConfig.maxCallsPerSync || 20;
      if (gate.invoke && llmCalls < maxCalls) {
        llmCalls += 1;
        llmReasonCodes = gate.why;
        const llmResponse = await runLlmExtraction({
          subject,
          snippet,
          from: sender,
          to: null,
          date: internalDate ? new Date(internalDate).toISOString() : null,
          headers: { rfcMessageId },
          provider: 'gmail',
          messageId: message.id,
          bodyText
        });
        llmModel = llmResponse.model || null;
        llmLatency = llmResponse.latencyMs || null;
        llmStatus = llmResponse.ok ? 'ok' : llmResponse.skipped ? 'skipped' : 'failed';
        if (llmResponse.ok && llmResponse.data) {
          llmRaw = JSON.stringify(llmResponse.data);
          const llmData = llmResponse.data;
          const agreeType = llmData.event_type === classification.detectedType;
          if (agreeType) {
            llmAgreements += 1;
          } else {
            llmDisagreements += 1;
          }
          const llmConf = llmData.confidence || 0;
          const safeUse = llmConf >= 0.85;
          if (safeUse && (!effectiveIdentity.companyName || effectiveIdentity.companyConfidence < 0.85)) {
            if (llmData.company_name) {
              effectiveIdentity = {
                ...effectiveIdentity,
                companyName: llmData.company_name,
                companyConfidence: llmConf,
                explanation: 'LLM'
              };
              llmUsedIdentity += 1;
            }
          }
          if (safeUse && (!effectiveRole || !effectiveRole.jobTitle) && llmData.job_title) {
            effectiveRole = {
              jobTitle: llmData.job_title,
              confidence: llmConf,
              source: 'llm',
              explanation: 'LLM'
            };
            llmUsedRole += 1;
          }
          if (safeUse && llmData.external_req_id && !externalReqId) {
            externalReqId = llmData.external_req_id;
            llmUsedReqId += 1;
          }
          if (safeUse && !classification.isJobRelated && llmData.is_job_related) {
            effectiveClassification = {
              isJobRelated: true,
              detectedType: llmData.event_type === 'non_job' ? 'other_job_related' : llmData.event_type,
              confidenceScore: llmConf,
              explanation: 'LLM',
              reason: 'llm'
            };
            llmUsedType += 1;
          }
        } else {
          llmError = llmResponse.error || llmResponse.reason || null;
          if (!llmResponse.skipped) {
            llmFailures += 1;
          }
        }
      }

      const highSignalFallback = applyHighSignalFallbackIdentity({
        classification: effectiveClassification,
        identity: effectiveIdentity,
        rolePayload: effectiveRole,
        sender,
        subject,
        snippet,
        bodyText
      });
      effectiveIdentity = highSignalFallback.identity;
      effectiveRole = highSignalFallback.rolePayload;

      if (process.env.JOBTRACK_LOG_LEVEL === 'debug' && isHighSignalClassification(effectiveClassification)) {
        logDebug('ingest.high_signal_classification', {
          providerMessageId: message.id,
          sender: sender || null,
          subject: subject || null,
          detectedType: effectiveClassification.detectedType || null,
          confidenceScore: effectiveClassification.confidenceScore || null,
          reason: effectiveClassification.reason || null,
          extractedCompany: effectiveIdentity.companyName || null,
          extractedRole: effectiveRole?.jobTitle || effectiveIdentity.jobTitle || null,
          fallbackApplied: highSignalFallback.fallbackApplied
        });
      }

      const nowIso = new Date().toISOString();
      const eventId = shouldReprocessLinkedInDuplicate && existingProvider?.id
        ? existingProvider.id
        : crypto.randomUUID();
      const existingCreatedAtMs =
        shouldReprocessLinkedInDuplicate && existingProvider?.created_at
          ? Date.parse(String(existingProvider.created_at))
          : NaN;
      const createdAt =
        Number.isFinite(existingCreatedAtMs)
          ? new Date(existingCreatedAtMs).toISOString()
          : nowIso;
      const identityConfidence = effectiveIdentity.matchConfidence || 0;
      const eventPayload = {
        id: eventId,
        userId,
        provider: 'gmail',
        messageId: message.id,
        providerMessageId: message.id,
        rfcMessageId: rfcMessageId || null,
        sender: sender || null,
        subject: subject || null,
        internalDate,
        snippet: truncateSnippet(snippet),
        detectedType: effectiveClassification.detectedType,
        confidenceScore: effectiveClassification.confidenceScore,
        classificationConfidence: effectiveClassification.confidenceScore,
        identityConfidence,
        identityCompanyName: effectiveIdentity.companyName || null,
        identityJobTitle: effectiveIdentity.jobTitle || null,
        identityCompanyConfidence: effectiveIdentity.companyConfidence || null,
        identityExplanation: effectiveIdentity.explanation || null,
        explanation: effectiveClassification.explanation,
        reasonCode: null,
        reasonDetail: null,
        roleTitle: effectiveRole?.jobTitle || null,
        roleConfidence: Number.isFinite(effectiveRole?.confidence) ? effectiveRole.confidence : null,
        roleSource: effectiveRole?.source || null,
        roleExplanation: effectiveRole?.explanation || null,
        externalReqId,
        ingestDecision: null,
        createdAt,
        llmStatus,
        llmError,
        llmModel,
        llmLatency,
        llmEventType: llmStatus === 'ok' ? effectiveClassification.detectedType : null,
        llmConfidence: llmStatus === 'ok' ? effectiveClassification.confidenceScore : null,
        llmCompanyName: llmStatus === 'ok' ? effectiveIdentity.companyName : null,
        llmJobTitle: llmStatus === 'ok' ? effectiveRole?.jobTitle || null : null,
        llmExternalReqId: llmStatus === 'ok' ? externalReqId : null,
        llmReasonCodes: llmReasonCodes.length ? JSON.stringify(llmReasonCodes) : null,
        llmRawJson: llmRaw
      };
      if (shouldReprocessLinkedInDuplicate) {
        await awaitMaybe(updateEmailEventRecord(db, eventId, eventPayload));
      } else {
        await awaitMaybe(insertEmailEventRecord(db, eventPayload));
      }
      storedEventsTotal += 1;
      if (classification.detectedType === 'confirmation') {
        storedEventsConfirmation += 1;
      }
      if (classification.detectedType === 'rejection') {
        storedEventsRejection += 1;
      }

      const matchResult = await awaitMaybe(matchAndAssignEvent({
        db,
        userId,
        event: {
          id: eventId,
          sender,
          subject,
          snippet,
          internal_date: internalDate,
          detected_type: effectiveClassification.detectedType,
          confidence_score: effectiveClassification.confidenceScore,
          classification_confidence: effectiveClassification.confidenceScore,
          classification_reason: effectiveClassification.reason || null,
          bodyText,
          role_title: effectiveRole?.jobTitle || null,
          role_confidence: Number.isFinite(effectiveRole?.confidence) ? effectiveRole.confidence : null,
          role_source: effectiveRole?.source || null,
          role_explanation: effectiveRole?.explanation || null,
          external_req_id: externalReqId,
          created_at: createdAt
        },
        identity: effectiveIdentity
      }));
      const priorApplicationId =
        shouldReprocessLinkedInDuplicate && existingProvider?.application_id
          ? String(existingProvider.application_id)
          : null;
      const matchedApplicationId = matchResult?.applicationId ? String(matchResult.applicationId) : null;
      if (
        priorApplicationId &&
        matchedApplicationId &&
        priorApplicationId !== matchedApplicationId
      ) {
        try {
          const remaining = await awaitMaybe(
            db
              .prepare('SELECT COUNT(*) AS count FROM email_events WHERE user_id = ? AND application_id = ?')
              .get(userId, priorApplicationId)
          );
          const remainingCount = Number(remaining?.count || 0);
          if (remainingCount === 0) {
            await awaitMaybe(
              db
                .prepare('UPDATE job_applications SET archived = ?, updated_at = ? WHERE user_id = ? AND id = ?')
                .run(db && db.isAsync ? true : 1, new Date().toISOString(), userId, priorApplicationId)
            );
            if (process.env.DEBUG_INGEST_LINKEDIN === '1') {
              logDebug('ingest.linkedin_jobs_orphan_archived', {
                userId,
                priorApplicationId,
                reassignedTo: matchedApplicationId
              });
            }
          }
        } catch (err) {
          if (process.env.DEBUG_INGEST_LINKEDIN === '1') {
            logDebug('ingest.linkedin_jobs_orphan_archive_failed', {
              userId,
              priorApplicationId,
              error: err && err.message ? String(err.message) : String(err)
            });
          }
        }
      }
      let rejectionApplied = false;
      if (process.env.DEBUG_INGEST_LINKEDIN === '1' && linkedInJobsUpdate) {
        logDebug('ingest.linkedin_jobs_match_result', {
          providerMessageId: message.id,
          subject: subject || null,
          sender: sender || null,
          classification: classification.detectedType || null,
          classificationConfidence: classification.confidenceScore || null,
          companyName: effectiveIdentity.companyName || null,
          jobTitle: effectiveIdentity.jobTitle || effectiveRole?.jobTitle || null,
          matchAction: matchResult.action,
          matchReason: matchResult.reason || null
        });
      }

      logDebug('ingest.event_classified', {
        userId,
        eventId,
        detectedType: classification.detectedType,
        confidenceScore: classification.confidenceScore,
        matchAction: matchResult.action,
        matchReason: matchResult.reason || null
      });

      if (matchResult.action === 'matched_existing') {
        matchedExisting += 1;
        reasons.matched_existing += 1;
        if (classification.detectedType === 'confirmation') {
          matchedEventsConfirmation += 1;
        }
        if (classification.detectedType === 'rejection') {
          matchedEventsRejection += 1;
        }
        await awaitMaybe(
          db.prepare('UPDATE email_events SET ingest_decision = ? WHERE id = ?').run('matched', eventId)
        );
        const inference = await awaitMaybe(
          runStatusInferenceForApplication(db, userId, matchResult.applicationId)
        );
        if (inference?.applied && inference?.inferred_status === 'REJECTED') {
          updatedRejectedTotal += 1;
          rejectionApplied = true;
        }
        if (inference?.applied && inference?.inferred_status === 'APPLIED') {
          updatedAppliedTotal += 1;
        }
      }
      if (matchResult.action === 'created_application') {
        createdApplications += 1;
        reasons.auto_created += 1;
        if (classification.detectedType === 'confirmation') {
          createdAppsConfirmation += 1;
        }
        if (classification.detectedType === 'rejection') {
          createdAppsRejectionOnly += 1;
        }
        await awaitMaybe(
          db.prepare('UPDATE email_events SET ingest_decision = ? WHERE id = ?').run('auto_created', eventId)
        );
        const inference = await awaitMaybe(
          runStatusInferenceForApplication(db, userId, matchResult.applicationId)
        );
        if (inference?.applied && inference?.inferred_status === 'REJECTED') {
          updatedRejectedTotal += 1;
          rejectionApplied = true;
        }
        if (inference?.applied && inference?.inferred_status === 'APPLIED') {
          updatedAppliedTotal += 1;
        }
      }
      if (matchResult.action === 'unassigned') {
        unsortedCreated += 1;
        reasons.unsorted_created += 1;
        if (classification.detectedType === 'confirmation') {
          unsortedConfirmationTotal += 1;
        }
        if (classification.detectedType === 'rejection') {
          unsortedRejectionTotal += 1;
        }
        await awaitMaybe(
          db.prepare('UPDATE email_events SET ingest_decision = ? WHERE id = ?').run('unsorted', eventId)
        );
        if (matchResult.reason || matchResult.reasonDetail) {
          await awaitMaybe(
            db
              .prepare('UPDATE email_events SET reason_code = ?, reason_detail = ? WHERE id = ?')
              .run(matchResult.reason || null, matchResult.reasonDetail || null, eventId)
          );
        }
        if (matchResult.reason === 'missing_identity') {
          reasons.missing_identity += 1;
        } else if (matchResult.reason === 'low_confidence') {
          reasons.low_confidence += 1;
        } else if (matchResult.reason === 'not_confident_for_create') {
          reasons.not_confident_for_create += 1;
        } else if (matchResult.reason === 'ambiguous_sender') {
          reasons.ambiguous_sender += 1;
        } else if (matchResult.reason === 'ambiguous_match') {
          reasons.ambiguous_match += 1;
        } else if (matchResult.reason === 'ambiguous_match_rejection') {
          reasons.ambiguous_match_rejection += 1;
        } else if (matchResult.reason === 'ambiguous_linkedin_match') {
          reasons.ambiguous_linkedin_match += 1;
        }
      }
      created += 1;
      fetched += 1;
      setSyncProgress(syncId, {
        phase: 'matching',
        processed: fetched,
        pagesFetched,
        total: Number.isFinite(estimate) ? estimate : totalForRun,
        createdApplications,
        matchedExisting
      });

      if (effectiveClassification.detectedType === 'rejection') {
        const senderDomain = sender && sender.includes('@')
          ? sender.split('@')[1]?.replace(/[> ]/g, '').toLowerCase()
          : null;
        const companyPreview = (effectiveIdentity.companyName || '').slice(0, 80);
        const rolePreview = (effectiveIdentity.jobTitle || effectiveRole?.jobTitle || '').slice(0, 80);
        logInfo('ingest.rejection_trace', {
          userId,
          providerMessageId: message.id,
          senderDomain: senderDomain || null,
          classifierType: effectiveClassification.detectedType,
          confidence: effectiveClassification.confidenceScore,
          company: companyPreview || null,
          role: rolePreview || null,
          matchAction: matchResult.action,
          matchReason: matchResult.reason || null,
          rejectedApplied: rejectionApplied
        });
      }
    }

    pageToken = list.data.nextPageToken;
  } while (pageToken && fetched < limit);

  try {
    const repair = await repairLinkedInSplitApplications(db, userId, {
      syncStart: safeWindowStart,
      syncEnd: safeWindowEnd
    });
    linkedInRepairMergedPairs = Number(repair?.mergedPairs || 0);
    linkedInRepairMovedEvents = Number(repair?.movedEvents || 0);
    linkedInRepairArchivedApps = Number(repair?.archivedApps || 0);
  } catch (err) {
    if (process.env.DEBUG_INGEST_LINKEDIN_MATCH === '1') {
      logDebug('ingest.linkedin_repair_merge_failed', {
        userId,
        error: err && err.message ? String(err.message) : String(err)
      });
    }
  }

  setSyncProgress(syncId, {
    status: 'completed',
    phase: 'finalizing',
    processed: fetched,
    total: totalMessagesListed || fetched || limit,
    pagesFetched,
    createdApplications,
    matchedExisting,
    llmCalls,
    llmFailures
  });

  logInfo('ingest.complete', {
    userId,
    fetched,
    created,
    skippedDuplicate,
    skippedNotJob,
    matchedExisting,
    createdApplications,
    unsortedCreated,
    filteredOutDenylist,
    classifiedConfirmation,
    classifiedRejection,
    storedEventsTotal,
    storedEventsConfirmation,
    storedEventsRejection,
    matchedEventsConfirmation,
    matchedEventsRejection,
    createdAppsConfirmation,
    createdAppsRejectionOnly,
    updatedRejectedTotal,
    updatedAppliedTotal,
    unsortedConfirmationTotal,
    unsortedRejectionTotal,
    skippedDuplicatesProvider,
    skippedDuplicatesRfc,
    llmCalls,
    llmCacheHits,
    llmFailures,
    llmUpgradedConfirmations,
    llmUpgradedRejections,
    llmAgreements,
    llmDisagreements,
    llmUsedIdentity,
    llmUsedType,
    llmUsedReqId,
    llmUsedRole,
    pagesFetched,
    totalMessagesListed,
    messageSourceCounts,
    linkedInRepairMergedPairs,
    linkedInRepairMovedEvents,
    linkedInRepairArchivedApps,
    timeWindowStart: safeWindowStart.toISOString(),
    timeWindowEnd: safeWindowEnd.toISOString(),
    stoppedReason,
    reasons,
    days: queryDays,
    mode
  });

  return {
    status: 'ok',
    fetched,
    totalScanned: fetched,
    jobRelatedCandidates,
    created,
    skippedDuplicate,
    skippedNotJob,
    matchedExisting,
    createdApplications,
    unsortedCreated,
    reasons,
    fetched_total: fetched,
    filtered_out_denylist: filteredOutDenylist,
    classified_job_related_total: jobRelatedCandidates,
    classified_confirmation: classifiedConfirmation,
    classified_rejection: classifiedRejection,
    stored_events_total: storedEventsTotal,
    stored_events_confirmation_total: storedEventsConfirmation,
    stored_events_rejection: storedEventsRejection,
    matched_events_total: matchedExisting,
    matched_events_confirmation_total: matchedEventsConfirmation,
    matched_events_rejection: matchedEventsRejection,
    created_apps_total: createdApplications,
    created_apps_confirmation_total: createdAppsConfirmation,
    created_apps_rejection_only_total: createdAppsRejectionOnly,
    updated_status_to_rejected_total: updatedRejectedTotal,
    updated_status_to_applied_total: updatedAppliedTotal,
    unsorted_total: unsortedCreated,
    unsorted_confirmation_total: unsortedConfirmationTotal,
    unsorted_rejection_total: unsortedRejectionTotal,
    skipped_duplicates_provider: skippedDuplicatesProvider,
    skipped_duplicates_rfc: skippedDuplicatesRfc,
    llm_calls: llmCalls,
    llm_cache_hits: llmCacheHits,
    llm_failures: llmFailures,
    llm_upgraded_confirmations: llmUpgradedConfirmations,
    llm_upgraded_rejections: llmUpgradedRejections,
    llm_agree_total: llmAgreements,
    llm_disagree_total: llmDisagreements,
    llm_used_identity_total: llmUsedIdentity,
    llm_used_type_total: llmUsedType,
    llm_used_req_id_total: llmUsedReqId,
    llm_used_role_total: llmUsedRole,
    pages_fetched: pagesFetched,
    total_messages_listed: totalMessagesListed,
    message_source_counts: messageSourceCounts,
    linkedin_repair_merged_pairs: linkedInRepairMergedPairs,
    linkedin_repair_moved_events: linkedInRepairMovedEvents,
    linkedin_repair_archived_apps: linkedInRepairArchivedApps,
    time_window_start: safeWindowStart.toISOString(),
    time_window_end: safeWindowEnd.toISOString(),
    stopped_reason: stoppedReason,
    days: queryDays,
    mode
  };
}

module.exports = {
  syncGmailMessages,
  getSyncProgress,
  REASON_KEYS,
  initReasonCounters,
  extractMessageMetadata,
  insertEmailEventRecord,
  isLinkedInDuplicateReprocessCandidate,
  hasLinkedInRejectionPhrase,
  repairLinkedInSplitApplications
};
