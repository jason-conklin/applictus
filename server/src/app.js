require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');

const { openDb, migrate } = require('./db');
const { ApplicationStatus } = require('../../shared/types');
const { createRateLimiter } = require('./rateLimiter');
const {
  getOAuthClientConfig,
  getOAuthClient,
  getAuthUrl,
  GMAIL_SCOPES,
  upsertTokens,
  getStoredTokens,
  fetchConnectedEmail,
  isEncryptionReady
} = require('./email');
const {
  getGoogleAuthConfig,
  getGoogleOAuthClient,
  getGoogleAuthUrl,
  getGoogleProfileFromCode,
  GOOGLE_SIGNIN_SCOPES
} = require('./googleAuth');
const { syncGmailMessages, syncInboundForwardedMessages, getSyncProgress } = require('./ingest');
const { logInfo, logWarn, logError } = require('./logger');
const {
  extractInboundRecipient,
  extractSenderEmail: extractInboundSenderEmail,
  extractMessageIdHeader,
  buildInboundMessageSha256,
  normalizeText: normalizeInboundText,
  stripHtml: stripInboundHtml,
  toIsoDate,
  getActiveInboundAddress,
  getInboundAddressByLocal,
  getOrCreateInboundAddress,
  rotateInboundAddress
} = require('./inbound');
const {
  extractThreadIdentity,
  inferInitialStatus,
  toIsoFromInternalDate,
  applyRoleCandidate,
  selectRoleCandidate,
  applyCompanyCandidate,
  selectCompanyCandidate,
  applyExternalReqId
} = require('./matching');
const { runStatusInferenceForApplication } = require('./statusInferenceRunner');
const { createUserAction } = require('./userActions');
const { applyStatusOverride } = require('./overrides');
const { mergeApplications } = require('./merge');
const resumeCuratorRouter = require('./routes/resumeCurator');
const { coalesceTimestamps } = require('./sqlHelpers');
const { pgMigrate, assertPgSchema } = require('./pgMigrate');
const { getRuntimeDatabaseUrl } = require('./dbConfig');
const { buildApplicationKey } = require('./normalizeJobFields');
const { buildHintFingerprintFromEmail, upsertUserHint } = require('./hints');
const { validateInboxUsername, normalizeInboxUsername } = require('./inboxUsername');

function isProd() {
  return process.env.NODE_ENV === 'production';
}

const PORT = process.env.PORT || 3000;
const WEB_BASE_URL = process.env.APP_WEB_BASE_URL || (isProd() ? 'https://applictus.com' : 'http://localhost:3000');
const API_BASE_URL = process.env.APP_API_BASE_URL || WEB_BASE_URL;
const COOKIE_DOMAIN = process.env.APP_COOKIE_DOMAIN || '';
const ALLOWED_ORIGINS = new Set(
  [
    process.env.APP_WEB_BASE_URL,
    'https://applictus.com',
    'http://localhost:3000',
    'http://localhost:5173'
  ].filter(Boolean)
);

// Stack choice: Express + SQLite keeps the backend lightweight and easy to ship locally.
const app = express();
const db = openDb();
app.locals.db = db;

migrate(db);

if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, X-Applictus-Inbound-Secret');
    res.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    res.set('Access-Control-Expose-Headers', 'Location');
    res.set('Vary', 'Origin');
    if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
      // eslint-disable-next-line no-console
      console.debug('[cors] allowed origin', { origin, path: req.path });
    }
  } else if (process.env.JOBTRACK_LOG_LEVEL === 'debug' && origin) {
    // eslint-disable-next-line no-console
    console.debug('[cors] blocked origin', { origin, path: req.path });
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  return next();
});
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  res.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'"
  );
  return next();
});
if (!isProd()) {
  app.use('/public', express.static(path.join(__dirname, '..', '..', 'public')));
  app.use(express.static(path.join(__dirname, '..', '..', 'public')));
  app.use('/web', express.static(path.join(__dirname, '..', '..', 'web')));
}

const SESSION_COOKIE = 'jt_session';
const CSRF_COOKIE = 'jt_csrf';
const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const PASSWORD_MIN_LENGTH = 12;
const CONTACT_NAME_MAX = 120;
const CONTACT_EMAIL_MAX = 254;
const CONTACT_MESSAGE_MAX = 4000;
const GOOGLE_STATE_COOKIE = 'jt_google_state';
const GOOGLE_STATE_TTL_MS = 10 * 60 * 1000;
const GMAIL_AUTO_CONNECT_STATE = 'auto_connect';
const GMAIL_SYNC_ACTION_TYPE = 'GMAIL_SYNC';
const INBOUND_SYNC_ACTION_TYPE = 'INBOUND_SYNC';
const FIRST_SYNC_DAYS = 30;
const INBOUND_CONNECTED_WINDOW_DAYS = 30;
const INBOUND_MESSAGE_COUNT_WINDOW_DAYS = 7;
const INBOUND_INACTIVE_WARNING_WINDOW_DAYS = 7;
const INBOUND_SUBJECT_MAX = 80;
const INBOUND_SYNC_LOCK_TTL_MS = 2 * 60 * 1000;
const VALID_STATUSES = new Set(Object.values(ApplicationStatus));
const CSRF_HEADER = 'x-csrf-token';
const INBOUND_SECRET_HEADER = 'x-applictus-inbound-secret';
const CSRF_TTL_MS = 2 * 60 * 60 * 1000;
const AUTH_DB_TIMEOUT_MS = 2_000;
const DB_HEALTH_TIMEOUT_MS = 2_000;
const preauthCsrfStore = new Map();
const CSRF_BYPASS_PATHS = new Set(['/api/inbound/postmark']);
const DB_UNAVAILABLE_CODES = new Set([
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  '57P01',
  '57P03',
  '53300'
]);
const inboundSyncLocks = new Map();

function nowIso() {
  return new Date().toISOString();
}

function sanitizeDbMessage(message) {
  return String(message || '')
    .replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, 'postgres://[REDACTED]@')
    .slice(0, 240);
}

function walkErrors(err, out = []) {
  if (!err || out.length >= 12) {
    return out;
  }
  out.push({
    code: err.code ? String(err.code).toUpperCase() : null,
    name: err.name ? String(err.name) : null,
    message: err.message ? String(err.message) : null
  });
  if (Array.isArray(err.errors)) {
    err.errors.forEach((child) => walkErrors(child, out));
  }
  if (err.cause && err.cause !== err) {
    walkErrors(err.cause, out);
  }
  return out;
}

function isDbUnavailableError(err) {
  const entries = walkErrors(err);
  if (!entries.length) {
    return false;
  }
  return entries.some((entry) => {
    if (entry.code && DB_UNAVAILABLE_CODES.has(entry.code)) {
      return true;
    }
    const text = `${entry.name || ''} ${entry.message || ''}`;
    return /(etimedout|timed out|aggregateerror|connection.*(terminated|closed|timeout)|getaddrinfo enotfound|econnrefused)/i.test(
      text
    );
  });
}

function buildDbUnavailableMeta(err, context) {
  const entries = walkErrors(err);
  const first = entries[0] || {};
  return {
    context,
    code: first.code || null,
    name: first.name || null,
    detail: sanitizeDbMessage(first.message || '')
  };
}

function respondDbUnavailable(res, err, context) {
  logError('db.unavailable', buildDbUnavailableMeta(err, context));
  return res.status(503).json({ error: 'DB_UNAVAILABLE' });
}

async function withTimeout(promise, timeoutMs, timeoutCode = 'ETIMEDOUT') {
  let timeout = null;
  const timer = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      const err = new Error(timeoutCode);
      err.code = timeoutCode;
      reject(err);
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timer]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function dbTimed(fn, timeoutMs = AUTH_DB_TIMEOUT_MS, timeoutCode = 'ETIMEDOUT') {
  return withTimeout(Promise.resolve().then(fn), timeoutMs, timeoutCode);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function getAdminEmailSet() {
  return new Set(
    String(process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((value) => normalizeEmail(value))
      .filter(Boolean)
  );
}

function isAdminUser(user) {
  const email = normalizeEmail(user?.email || '');
  if (!email) {
    return false;
  }
  return getAdminEmailSet().has(email);
}

function parseJsonSafe(value) {
  if (!value) {
    return null;
  }
  if (typeof value === 'object') {
    return value;
  }
  try {
    return JSON.parse(String(value));
  } catch (_) {
    return null;
  }
}

function isGmailForwardingConfirmationEnvelope({ subject, textBody, htmlBody }) {
  const subjectText = String(subject || '').toLowerCase();
  const text = String(textBody || '').toLowerCase();
  const html = String(htmlBody || '').toLowerCase();
  return (
    subjectText.includes('gmail forwarding confirmation') ||
    text.includes('gmail forwarding confirmation') ||
    text.includes('gmail forwarding confirmation code') ||
    html.includes('gmail forwarding confirmation')
  );
}

function extractUrlsFromText(value) {
  const text = String(value || '');
  if (!text) {
    return [];
  }
  const matches = text.match(/https?:\/\/[^\s<>"')]+/gi) || [];
  return Array.from(
    new Set(
      matches
        .map((url) => String(url || '').replace(/[),.;]+$/, '').trim())
        .filter(Boolean)
    )
  );
}

function extractForwardingConfirmationCode(value) {
  const text = String(value || '');
  if (!text) {
    return null;
  }
  const patterns = [
    /\bgmail forwarding confirmation code[:\s]+([a-z0-9-]{4,})\b/i,
    /\bconfirmation code[:\s]+([a-z0-9-]{4,})\b/i,
    /\bverification code[:\s]+([a-z0-9-]{4,})\b/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return String(match[1]).trim();
    }
  }
  return null;
}

function extractGmailForwardingVerificationInfo({ subject, bodyText, bodyHtml, rawPayload }) {
  const payload = parseJsonSafe(rawPayload) || {};
  const payloadText = String(payload.TextBody || '');
  const payloadHtml = String(payload.HtmlBody || '');
  const combinedText = [bodyText, payloadText, stripInboundHtml(bodyHtml), stripInboundHtml(payloadHtml)]
    .filter(Boolean)
    .join('\n');
  const combinedHtml = [bodyHtml, payloadHtml].filter(Boolean).join('\n');

  const detected = isGmailForwardingConfirmationEnvelope({
    subject,
    textBody: combinedText,
    htmlBody: combinedHtml
  });

  if (!detected) {
    return { detected: false, confirmation_url: null, confirmation_code: null };
  }

  const candidateUrls = Array.from(
    new Set([...extractUrlsFromText(combinedHtml), ...extractUrlsFromText(combinedText)])
  );
  const preferredUrl =
    candidateUrls.find((url) => /mail-settings\.google\.com|mail\.google\.com|accounts\.google\.com/i.test(url)) ||
    candidateUrls.find((url) => /verify|forward|confirm|fwd/i.test(url)) ||
    candidateUrls[0] ||
    null;
  const confirmationCode = extractForwardingConfirmationCode(combinedText) || null;

  return {
    detected: true,
    confirmation_url: preferredUrl,
    confirmation_code: confirmationCode
  };
}

function inferForwardingReadiness({
  hasAddress,
  setupState,
  lastReceivedAt,
  hasNonVerificationInbound,
  hasGmailVerification
}) {
  if (!hasAddress) {
    return 'not_started';
  }
  if (hasNonVerificationInbound) {
    return 'forwarding_active';
  }
  if (hasGmailVerification) {
    return 'gmail_verification_pending';
  }
  if (lastReceivedAt) {
    return 'address_reachable';
  }
  if (String(setupState || '') === 'awaiting_first_email') {
    return 'awaiting_first_email';
  }
  if (String(setupState || '') === 'awaiting_confirmation') {
    return 'awaiting_confirmation';
  }
  return 'not_started';
}

function extractDomainFromAddress(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) {
    return null;
  }
  const angleMatch = text.match(/<([^>]+)>/);
  const candidate = angleMatch && angleMatch[1] ? angleMatch[1] : text;
  const emailMatch = candidate.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  const email = emailMatch ? emailMatch[0] : candidate;
  const atIdx = email.lastIndexOf('@');
  if (atIdx === -1) {
    return null;
  }
  return email.slice(atIdx + 1);
}

function normalizeHintStatus(value) {
  const status = String(value || '')
    .trim()
    .toLowerCase();
  if (!status) {
    return null;
  }
  return VALID_STATUSES.has(status) ? status : null;
}

function extractProviderIdFromInboundDebug(debugJson) {
  if (!debugJson || typeof debugJson !== 'object') {
    return null;
  }
  if (debugJson.provider_id) {
    return String(debugJson.provider_id).toLowerCase();
  }
  if (debugJson.provider_hint) {
    const hint = String(debugJson.provider_hint).toLowerCase();
    if (hint === 'linkedin') return 'linkedin_jobs';
    if (hint === 'workable') return 'workable_candidates';
    if (hint === 'indeed') return 'indeed_apply';
    if (hint === 'workday') return 'workday';
  }
  return null;
}

async function resolveHintSourceContext({ userId, applicationId, lastInboundMessageId, lastEventId }) {
  const inboundColumns = `
    id,
    from_email,
    subject,
    body_text,
    body_html,
    derived_debug_json
  `;

  let inboundRow = null;
  const inboundId = String(lastInboundMessageId || '').trim();
  if (inboundId) {
    inboundRow = await db.prepare(
      `SELECT ${inboundColumns}
       FROM inbound_messages
       WHERE id = ? AND user_id = ?
       LIMIT 1`
    ).get(inboundId, userId);
  }

  const eventId = String(lastEventId || '').trim();
  if (!inboundRow && eventId) {
    inboundRow = await db.prepare(
      `SELECT ${inboundColumns}
       FROM inbound_messages
       WHERE user_id = ?
         AND derived_event_id = ?
       ORDER BY received_at DESC, created_at DESC
       LIMIT 1`
    ).get(userId, eventId);
  }

  if (!inboundRow && applicationId) {
    inboundRow = await db.prepare(
      `SELECT ${inboundColumns}
       FROM inbound_messages
       WHERE user_id = ?
         AND derived_application_id = ?
       ORDER BY received_at DESC, created_at DESC
       LIMIT 1`
    ).get(userId, applicationId);
  }

  if (inboundRow) {
    const debugJson = parseJsonSafe(inboundRow.derived_debug_json);
    const providerId = extractProviderIdFromInboundDebug(debugJson) || 'generic';
    const textBody =
      normalizeInboundText(inboundRow.body_text || '') ||
      normalizeInboundText(stripHtml(inboundRow.body_html || '')) ||
      '';
    return {
      sourceType: 'inbound_message',
      sourceId: inboundRow.id,
      providerId,
      fromDomain: extractDomainFromAddress(inboundRow.from_email),
      subject: String(inboundRow.subject || '').trim(),
      text: textBody
    };
  }

  let eventRow = null;
  if (eventId) {
    eventRow = await db.prepare(
      `SELECT id, provider, sender, subject, snippet
       FROM email_events
       WHERE id = ?
         AND user_id = ?
         AND application_id = ?
       LIMIT 1`
    ).get(eventId, userId, applicationId);
  }

  if (!eventRow && applicationId) {
    eventRow = await db.prepare(
      `SELECT id, provider, sender, subject, snippet
       FROM email_events
       WHERE user_id = ?
         AND application_id = ?
       ORDER BY internal_date DESC, created_at DESC
       LIMIT 1`
    ).get(userId, applicationId);
  }

  if (!eventRow) {
    return null;
  }

  const senderDomain = extractDomainFromAddress(eventRow.sender || '');
  let providerId = 'generic';
  if (eventRow.provider === 'inbound_forward') {
    if (senderDomain && senderDomain.includes('linkedin.com')) providerId = 'linkedin_jobs';
    else if (senderDomain && senderDomain.includes('workablemail.com')) providerId = 'workable_candidates';
    else if (senderDomain && senderDomain.includes('indeed.com')) providerId = 'indeed_apply';
    else if (senderDomain && senderDomain.includes('myworkday.com')) providerId = 'workday';
  }

  return {
    sourceType: 'email_event',
    sourceId: eventRow.id,
    providerId,
    fromDomain: senderDomain,
    subject: String(eventRow.subject || '').trim(),
    text: normalizeInboundText(eventRow.snippet || '')
  };
}

function acquireInboundSyncLock(userId, ttlMs = INBOUND_SYNC_LOCK_TTL_MS) {
  if (!userId) {
    return null;
  }
  const now = Date.now();
  const existing = inboundSyncLocks.get(userId);
  if (existing && existing.expiresAt > now) {
    return null;
  }
  const token = crypto.randomUUID();
  inboundSyncLocks.set(userId, {
    token,
    expiresAt: now + Math.max(5_000, ttlMs)
  });
  return token;
}

function releaseInboundSyncLock(userId, token) {
  const existing = inboundSyncLocks.get(userId);
  if (!existing) {
    return;
  }
  if (!token || existing.token !== token) {
    return;
  }
  inboundSyncLocks.delete(userId);
}

function safeCompareSecret(actual, expected) {
  const left = Buffer.from(String(actual || ''), 'utf8');
  const right = Buffer.from(String(expected || ''), 'utf8');
  if (!left.length || !right.length || left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function isUniqueConstraintError(err) {
  const code = String(err?.code || '').toUpperCase();
  if (code === '23505' || code.startsWith('SQLITE_CONSTRAINT')) {
    return true;
  }
  return /duplicate|unique/i.test(String(err?.message || ''));
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const raw =
    (typeof forwarded === 'string' && forwarded.split(',')[0].trim()) ||
    req.ip ||
    req.socket?.remoteAddress ||
    '';
  if (!raw) {
    return null;
  }
  if (raw === '::1') {
    return '127.0.0.1';
  }
  if (raw.startsWith('::ffff:')) {
    return raw.slice(7);
  }
  return raw;
}

function stripHtml(text) {
  return String(text || '').replace(/<[^>]*>/g, '');
}

function normalizeContactField(text) {
  return stripHtml(text).replace(/\s+/g, ' ').trim();
}

function normalizeContactMessage(text) {
  return stripHtml(text).replace(/\r\n/g, '\n').trim();
}

function isLikelyEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

async function getUserByEmail(email) {
  return dbTimed(async () => {
    const res = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    return res && typeof res.then === 'function' ? await res : res;
  });
}

async function getUserByInboxUsername(username) {
  const normalized = normalizeInboxUsername(username);
  if (!normalized) {
    return null;
  }
  return dbTimed(async () => {
    const res = db
      .prepare('SELECT * FROM users WHERE lower(inbox_username) = ? LIMIT 1')
      .get(normalized);
    return res && typeof res.then === 'function' ? await res : res;
  });
}

function buildInboxAddressEmailFromUsername(username, inboundDomain = process.env.INBOUND_DOMAIN) {
  const normalizedUsername = normalizeInboxUsername(username);
  const normalizedDomain = String(inboundDomain || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '');
  if (!normalizedUsername || !normalizedDomain) {
    return null;
  }
  return `${normalizedUsername}@${normalizedDomain}`;
}

function buildInboxUsernameSuggestionCandidates(base) {
  const normalizedBase = normalizeInboxUsername(base) || 'applicant';
  const out = [];
  for (let i = 1; i <= 12 && out.length < 5; i += 1) {
    const suffix = String(i);
    const raw =
      normalizedBase.length + suffix.length + 1 <= 30
        ? `${normalizedBase}-${suffix}`
        : `${normalizedBase.slice(0, Math.max(3, 30 - suffix.length))}${suffix}`;
    const validation = validateInboxUsername(raw, { allowEmpty: false });
    if (!validation.ok) {
      continue;
    }
    if (out.includes(validation.value)) {
      continue;
    }
    out.push(validation.value);
  }
  return out;
}

async function getInboundAddressRowByEmail(addressEmail) {
  const normalized = normalizeEmail(addressEmail);
  if (!normalized) {
    return null;
  }
  return dbTimed(async () => {
    const res = db
      .prepare(
        `SELECT id, user_id, address_email
         FROM inbound_addresses
         WHERE lower(address_email) = ?
         LIMIT 1`
      )
      .get(normalized);
    return res && typeof res.then === 'function' ? await res : res;
  });
}

async function checkInboxUsernameAvailability(username, { excludeUserId = null } = {}) {
  const validation = validateInboxUsername(username, { allowEmpty: false });
  if (!validation.ok) {
    return {
      available: false,
      valid: false,
      error: validation.code || 'INBOX_USERNAME_INVALID',
      inbox_username: validation.value || null,
      address_email: null,
      suggestions: []
    };
  }

  const normalizedUsername = validation.value;
  const addressEmail = buildInboxAddressEmailFromUsername(normalizedUsername);
  const userConflict = await getUserByInboxUsername(normalizedUsername);
  const inboundAddressConflict = addressEmail ? await getInboundAddressRowByEmail(addressEmail) : null;
  const normalizedExclude = excludeUserId ? String(excludeUserId) : null;
  const hasUserConflict = Boolean(userConflict && (!normalizedExclude || userConflict.id !== normalizedExclude));
  const hasAddressConflict = Boolean(
    inboundAddressConflict && (!normalizedExclude || inboundAddressConflict.user_id !== normalizedExclude)
  );
  if (!hasUserConflict && !hasAddressConflict) {
    return {
      available: true,
      valid: true,
      error: null,
      inbox_username: normalizedUsername,
      address_email: addressEmail,
      suggestions: []
    };
  }

  const suggestions = [];
  for (const candidate of buildInboxUsernameSuggestionCandidates(normalizedUsername)) {
    const candidateAddress = buildInboxAddressEmailFromUsername(candidate);
    const [candidateUser, candidateAddressRow] = await Promise.all([
      getUserByInboxUsername(candidate),
      candidateAddress ? getInboundAddressRowByEmail(candidateAddress) : Promise.resolve(null)
    ]);
    const userTaken = Boolean(candidateUser && (!normalizedExclude || candidateUser.id !== normalizedExclude));
    const addrTaken = Boolean(
      candidateAddressRow && (!normalizedExclude || candidateAddressRow.user_id !== normalizedExclude)
    );
    if (!userTaken && !addrTaken) {
      suggestions.push(candidate);
    }
    if (suggestions.length >= 3) {
      break;
    }
  }

  return {
    available: false,
    valid: true,
    error: 'INBOX_USERNAME_TAKEN',
    inbox_username: normalizedUsername,
    address_email: addressEmail,
    suggestions
  };
}

async function getUserById(id) {
  return dbTimed(async () => {
    const res = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return res && typeof res.then === 'function' ? await res : res;
  });
}

async function createUser({ email, name, passwordHash, authProvider, inboxUsername = null }) {
  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const provider = authProvider || 'password';
  const normalizedInboxUsername = normalizeInboxUsername(inboxUsername);
  await dbTimed(async () => {
    const runRes = db.prepare(
      `INSERT INTO users (id, email, name, password_hash, auth_provider, inbox_username, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      email,
      name || null,
      passwordHash || null,
      provider,
      normalizedInboxUsername,
      createdAt,
      createdAt
    );
    if (runRes && typeof runRes.then === 'function') {
      await runRes;
    }
  });
  return getUserById(id);
}

function toSessionUserPayload(user) {
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    auth_provider: user.auth_provider || 'password',
    has_password: Boolean(user.password_hash),
    inbox_username: user.inbox_username || null
  };
}

async function updateUser(userId, fields) {
  const keys = Object.keys(fields || {});
  if (!keys.length) {
    return;
  }
  const updatedAt = nowIso();
  const setClause = [...keys.map((key) => `${key} = ?`), 'updated_at = ?'].join(', ');
  const values = keys.map((key) => fields[key]);
  values.push(updatedAt, userId);
  await dbTimed(async () => {
    const res = db.prepare(`UPDATE users SET ${setClause} WHERE id = ?`).run(...values);
    if (res && typeof res.then === 'function') {
      await res;
    }
  });
}

function mergeAuthProvider(existing, incoming) {
  if (!existing) {
    return incoming;
  }
  if (!incoming || existing === incoming) {
    return existing;
  }
  if (existing === 'password+google') {
    return existing;
  }
  return 'password+google';
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 12);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function isPasswordValid(password) {
  return typeof password === 'string' && password.length >= PASSWORD_MIN_LENGTH;
}

async function createSession(userId) {
  if (!userId) {
    const err = new Error('Missing user_id for session creation');
    err.code = 'AUTH_USER_ID_MISSING';
    throw err;
  }
  await cleanupExpiredSessions();
  const token = crypto.randomUUID();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const csrfToken = crypto.randomBytes(32).toString('hex');
  await dbTimed(async () => {
    const res = db.prepare(
      'INSERT INTO sessions (id, user_id, created_at, expires_at, csrf_token) VALUES (?, ?, ?, ?, ?)'
    ).run(token, userId, createdAt, expiresAt, csrfToken);
    if (res && typeof res.then === 'function') {
      await res;
    }
  });
  if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
    // eslint-disable-next-line no-console
    console.debug('[auth] created session for user', userId);
  }
  return { token, expiresAt, csrfToken };
}

function cookieDomainOptions() {
  return COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {};
}

function isCrossSiteAuth() {
  try {
    const webOrigin = new URL(process.env.APP_WEB_BASE_URL || WEB_BASE_URL).origin;
    const apiOrigin = new URL(process.env.APP_API_BASE_URL || API_BASE_URL).origin;
    return webOrigin !== apiOrigin;
  } catch (err) {
    return false;
  }
}

function sessionCookieOptions({ isProd: isProdOverride } = {}) {
  return {
    httpOnly: true,
    sameSite: isCrossSiteAuth() ? 'none' : 'lax',
    secure: isCrossSiteAuth() || (isProdOverride ?? isProd()),
    maxAge: SESSION_TTL_MS,
    ...cookieDomainOptions()
  };
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: isCrossSiteAuth() ? 'none' : 'lax',
    secure: isCrossSiteAuth() || isProd(),
    ...cookieDomainOptions()
  });
}

async function getSession(token) {
  return dbTimed(async () => {
    const res = db.prepare('SELECT * FROM sessions WHERE id = ?').get(token);
    return res && typeof res.then === 'function' ? await res : res;
  });
}

async function deleteSession(token) {
  await dbTimed(async () => {
    const res = db.prepare('DELETE FROM sessions WHERE id = ?').run(token);
    if (res && typeof res.then === 'function') {
      await res;
    }
  });
}

async function cleanupExpiredSessions() {
  const now = nowIso();
  await dbTimed(async () => {
    const res = db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
    if (res && typeof res.then === 'function') {
      await res;
    }
  });
}

function setCsrfCookie(res, csrfId) {
  res.cookie(CSRF_COOKIE, csrfId, {
    httpOnly: true,
    sameSite: isCrossSiteAuth() ? 'none' : 'lax',
    secure: isCrossSiteAuth() || isProd(),
    maxAge: CSRF_TTL_MS,
    ...cookieDomainOptions()
  });
}

function clearCsrfCookie(res) {
  res.clearCookie(CSRF_COOKIE, {
    httpOnly: true,
    sameSite: isCrossSiteAuth() ? 'none' : 'lax',
    secure: isCrossSiteAuth() || isProd(),
    ...cookieDomainOptions()
  });
}

function getWebAuthErrorRedirect(errorCode) {
  const target = new URL(WEB_BASE_URL);
  target.pathname = '/app';
  target.searchParams.set('auth_error', errorCode);
  return target.toString();
}

function getWebRedirectWithParams(params = {}) {
  const target = new URL(WEB_BASE_URL);
  target.pathname = '/app';
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    target.searchParams.set(key, String(value));
  });
  return target.toString();
}

async function getStoredGmailTokenRow(userId) {
  const rowOrPromise = db
    .prepare('SELECT * FROM oauth_tokens WHERE provider = ? AND user_id = ?')
    .get('gmail', userId);
  return rowOrPromise && typeof rowOrPromise.then === 'function' ? await rowOrPromise : rowOrPromise;
}

async function clearStoredGmailConnection(userId) {
  const resultOrPromise = db
    .prepare('DELETE FROM oauth_tokens WHERE provider = ? AND user_id = ?')
    .run('gmail', userId);
  if (resultOrPromise && typeof resultOrPromise.then === 'function') {
    await resultOrPromise;
  }
}

async function hasStoredGmailConnection(userId) {
  const row = await getStoredGmailTokenRow(userId);
  if (!row) {
    return false;
  }
  return Boolean(
    row.connected_email ||
      row.access_token_enc ||
      row.refresh_token_enc ||
      row.access_token ||
      row.refresh_token
  );
}

function parseIsoDate(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function clampSyncDays(value, fallback = FIRST_SYNC_DAYS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.min(365, Math.floor(parsed)));
}

function computeApplicationsUpdated(result = {}) {
  const explicit = Number(result.applications_updated);
  if (Number.isFinite(explicit)) {
    return explicit;
  }
  const updatedRejected = Number(result.updated_status_to_rejected_total || 0);
  const updatedApplied = Number(result.updated_status_to_applied_total || 0);
  const createdApps = Number(
    result.createdApplications || result.created_apps_total || result.created_apps_confirmation_total || 0
  );
  return createdApps || updatedRejected + updatedApplied;
}

function normalizeSyncMeta(raw, fallbackCreatedAt = null) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const lastSyncedAt =
    raw.last_synced_at ||
    raw.synced_at ||
    raw.time_window_end ||
    fallbackCreatedAt ||
    null;
  const parsedLastSynced = parseIsoDate(lastSyncedAt);
  if (!parsedLastSynced) {
    return null;
  }
  const parsedWindowStart = parseIsoDate(raw.time_window_start);
  const parsedWindowEnd = parseIsoDate(raw.time_window_end);
  const scanned = Number(raw.message_count_scanned);
  const updated = Number(raw.applications_updated);
  const days = Number(raw.days);
  return {
    mode: raw.mode === 'days' ? 'days' : 'since_last',
    days: Number.isFinite(days) ? days : null,
    last_synced_at: parsedLastSynced.toISOString(),
    time_window_start: parsedWindowStart ? parsedWindowStart.toISOString() : null,
    time_window_end: parsedWindowEnd ? parsedWindowEnd.toISOString() : null,
    message_count_scanned: Number.isFinite(scanned) ? scanned : null,
    applications_updated: Number.isFinite(updated) ? updated : null
  };
}

async function getLatestGmailSyncMeta(userId) {
  const rowOrPromise = db
    .prepare(
      `SELECT action_payload, created_at
       FROM user_actions
       WHERE user_id = ? AND action_type = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(userId, GMAIL_SYNC_ACTION_TYPE);
  const row = rowOrPromise && typeof rowOrPromise.then === 'function' ? await rowOrPromise : rowOrPromise;
  if (!row?.action_payload) {
    return null;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(row.action_payload);
  } catch (_) {
    parsed = null;
  }
  return normalizeSyncMeta(parsed, row.created_at);
}

async function storeGmailSyncMeta(userId, payload) {
  if (!userId || !payload) {
    return;
  }
  const normalized = normalizeSyncMeta(payload);
  if (!normalized) {
    return;
  }
  const resultOrPromise = db
    .prepare(
      `INSERT INTO user_actions (id, user_id, application_id, action_type, action_payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      crypto.randomUUID(),
      userId,
      null,
      GMAIL_SYNC_ACTION_TYPE,
      JSON.stringify(normalized),
      nowIso()
    );
  if (resultOrPromise && typeof resultOrPromise.then === 'function') {
    await resultOrPromise;
  }
}

function normalizeInboundSyncMeta(raw, fallbackCreatedAt = null) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const syncedAt = raw.last_inbound_sync_at || raw.last_processed_at || fallbackCreatedAt || null;
  const parsedSyncedAt = parseIsoDate(syncedAt);
  if (!parsedSyncedAt) {
    return null;
  }
  const processed = Number(raw.last_inbound_processed_count ?? raw.processed);
  const ignored = Number(raw.last_inbound_ignored_count ?? raw.ignored);
  const created = Number(raw.last_inbound_created_count ?? raw.created);
  const updated = Number(raw.last_inbound_updated_count ?? raw.updated);
  const errors = Number(raw.last_inbound_error_count ?? raw.errors);
  return {
    last_inbound_sync_at: parsedSyncedAt.toISOString(),
    last_inbound_processed_count: Number.isFinite(processed) ? processed : 0,
    last_inbound_ignored_count: Number.isFinite(ignored) ? ignored : 0,
    last_inbound_created_count: Number.isFinite(created) ? created : 0,
    last_inbound_updated_count: Number.isFinite(updated) ? updated : 0,
    last_inbound_error_count: Number.isFinite(errors) ? errors : 0
  };
}

async function getLatestInboundSyncMeta(userId) {
  const rowOrPromise = db
    .prepare(
      `SELECT action_payload, created_at
       FROM user_actions
       WHERE user_id = ? AND action_type = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(userId, INBOUND_SYNC_ACTION_TYPE);
  const row = rowOrPromise && typeof rowOrPromise.then === 'function' ? await rowOrPromise : rowOrPromise;
  if (!row?.action_payload) {
    return null;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(row.action_payload);
  } catch (_) {
    parsed = null;
  }
  return normalizeInboundSyncMeta(parsed, row.created_at);
}

async function storeInboundSyncMeta(userId, payload) {
  if (!userId || !payload) {
    return;
  }
  const normalized = normalizeInboundSyncMeta(payload);
  if (!normalized) {
    return;
  }
  const resultOrPromise = db
    .prepare(
      `INSERT INTO user_actions (id, user_id, application_id, action_type, action_payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      crypto.randomUUID(),
      userId,
      null,
      INBOUND_SYNC_ACTION_TYPE,
      JSON.stringify(normalized),
      nowIso()
    );
  if (resultOrPromise && typeof resultOrPromise.then === 'function') {
    await resultOrPromise;
  }
}

function normalizeDbBool(value) {
  return value === true || value === 1 || value === '1';
}

function boolBind(db, value) {
  if (db && db.isAsync) {
    return Boolean(value);
  }
  return value ? 1 : 0;
}

async function dbGet(sql, ...params) {
  return dbTimed(async () => {
    const rowOrPromise = db.prepare(sql).get(...params);
    return rowOrPromise && typeof rowOrPromise.then === 'function' ? await rowOrPromise : rowOrPromise;
  });
}

async function dbRun(sql, ...params) {
  return dbTimed(async () => {
    const resultOrPromise = db.prepare(sql).run(...params);
    if (resultOrPromise && typeof resultOrPromise.then === 'function') {
      return await resultOrPromise;
    }
    return resultOrPromise;
  });
}

async function getUserInboxSignal(userId) {
  if (!userId) {
    return null;
  }
  return dbGet(
    `SELECT user_id, pending_count, last_inbound_at, last_subject_preview, updated_at
     FROM user_inbox_signals
     WHERE user_id = ?
     LIMIT 1`,
    userId
  );
}

async function countPendingInboundQueue(userId) {
  if (!userId) {
    return 0;
  }
  const row = await dbGet(
    `SELECT COUNT(*) AS count
     FROM inbound_messages
     WHERE user_id = ?
       AND (processing_status IS NULL OR processing_status IN ('pending', 'processing', 'error'))`,
    userId
  );
  const count = Number(row?.count || 0);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

async function upsertUserInboxSignalIncrement(userId, { lastInboundAt, lastSubjectPreview } = {}) {
  if (!userId) {
    return;
  }
  const now = nowIso();
  const subjectPreview = truncateInboundSubject(lastSubjectPreview || null);
  await dbRun(
    `INSERT INTO user_inbox_signals
      (user_id, pending_count, last_inbound_at, last_subject_preview, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       pending_count = COALESCE(user_inbox_signals.pending_count, 0) + 1,
       last_inbound_at = excluded.last_inbound_at,
       last_subject_preview = excluded.last_subject_preview,
       updated_at = excluded.updated_at`,
    userId,
    1,
    lastInboundAt || now,
    subjectPreview,
    now
  );
}

async function touchUserInboxSignal(userId, { lastInboundAt, lastSubjectPreview } = {}) {
  if (!userId) {
    return;
  }
  const now = nowIso();
  const subjectPreview = truncateInboundSubject(lastSubjectPreview || null);
  await dbRun(
    `INSERT INTO user_inbox_signals
      (user_id, pending_count, last_inbound_at, last_subject_preview, updated_at)
     VALUES (?, 0, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       last_inbound_at = COALESCE(excluded.last_inbound_at, user_inbox_signals.last_inbound_at),
       last_subject_preview = COALESCE(excluded.last_subject_preview, user_inbox_signals.last_subject_preview),
       updated_at = excluded.updated_at`,
    userId,
    lastInboundAt || now,
    subjectPreview,
    now
  );
}

async function setUserInboxSignalPendingCount(userId, pendingCount, { lastInboundAt, lastSubjectPreview } = {}) {
  if (!userId) {
    return;
  }
  const normalizedPending = Math.max(0, Math.floor(Number(pendingCount) || 0));
  const now = nowIso();
  const subjectPreview = truncateInboundSubject(lastSubjectPreview || null);
  await dbRun(
    `INSERT INTO user_inbox_signals
      (user_id, pending_count, last_inbound_at, last_subject_preview, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       pending_count = excluded.pending_count,
       last_inbound_at = COALESCE(excluded.last_inbound_at, user_inbox_signals.last_inbound_at),
       last_subject_preview = COALESCE(excluded.last_subject_preview, user_inbox_signals.last_subject_preview),
       updated_at = excluded.updated_at`,
    userId,
    normalizedPending,
    lastInboundAt || null,
    subjectPreview,
    now
  );
}

function truncateInboundSubject(subject) {
  if (!subject) {
    return null;
  }
  const normalized = String(subject).replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }
  if (normalized.length <= INBOUND_SUBJECT_MAX) {
    return normalized;
  }
  return `${normalized.slice(0, INBOUND_SUBJECT_MAX - 1)}…`;
}

function inferInboundSetupState({ hasAddress, confirmedAt, lastReceivedAt }) {
  if (!hasAddress) {
    return 'not_started';
  }
  if (lastReceivedAt) {
    return 'active';
  }
  if (confirmedAt) {
    return 'awaiting_first_email';
  }
  return 'awaiting_confirmation';
}

async function buildInboundAddressStatus(userId, { ensureAddress = true } = {}) {
  const inboundDomain = String(process.env.INBOUND_DOMAIN || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '');
  const userRow = await dbGet('SELECT inbox_username FROM users WHERE id = ? LIMIT 1', userId);
  const inboxUsername = normalizeInboxUsername(userRow?.inbox_username);
  const preferredAddressEmail = inboxUsername && inboundDomain ? `${inboxUsername}@${inboundDomain}` : null;

  const address = ensureAddress
    ? await getOrCreateInboundAddress(db, userId, { inboundDomain })
    : await getActiveInboundAddress(db, userId, { includeInactive: false });
  const inboundSyncMeta = await getLatestInboundSyncMeta(userId);
  const signalRow = await getUserInboxSignal(userId);
  const inactiveSince = new Date(
    Date.now() - INBOUND_INACTIVE_WARNING_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const inactiveAddressBind = boolBind(db, false);
  const recentInactiveInbound = await dbGet(
    `SELECT im.received_at, im.subject, ia.address_email
     FROM inbound_messages im
     INNER JOIN inbound_addresses ia ON ia.id = im.inbound_address_id
     WHERE im.user_id = ?
       AND ia.is_active = ?
       AND im.received_at >= ?
     ORDER BY im.received_at DESC, im.created_at DESC
     LIMIT 1`,
    userId,
    inactiveAddressBind,
    inactiveSince
  );

  if (!address) {
    const pendingCount = signalRow ? Number(signalRow.pending_count || 0) : 0;
    return {
      address_email: null,
      preferred_address_email: preferredAddressEmail,
      inbox_username: inboxUsername,
      is_active: false,
      confirmed_at: null,
      last_received_at: null,
      last_received_subject: null,
      forwarding_readiness: 'not_started',
      address_reachable: false,
      has_non_verification_inbound: false,
      gmail_verification_pending: false,
      gmail_forwarding_verification: null,
      message_count_7d: 0,
      inbound_pending_count: Number.isFinite(pendingCount) ? Math.max(0, pendingCount) : 0,
      inbound_signal_updated_at: signalRow?.updated_at || null,
      inbound_signal_last_inbound_at: signalRow?.last_inbound_at || null,
      inbound_signal_last_subject: truncateInboundSubject(signalRow?.last_subject_preview || null),
      inactive_address_warning: Boolean(recentInactiveInbound),
      inactive_address_warning_meta: recentInactiveInbound
        ? {
            address_email: recentInactiveInbound.address_email || null,
            last_received_at: recentInactiveInbound.received_at || null,
            subject: truncateInboundSubject(recentInactiveInbound.subject || null)
          }
        : null,
      setup_state: 'not_started',
      connected: false,
      effective_connected: false,
      last_inbound_sync_at: inboundSyncMeta?.last_inbound_sync_at || null,
      last_inbound_sync: inboundSyncMeta || null
    };
  }

  const latestInbound = await dbGet(
    `SELECT subject, received_at
     FROM inbound_messages
     WHERE user_id = ? AND inbound_address_id = ?
     ORDER BY received_at DESC, created_at DESC
     LIMIT 1`,
    userId,
    address.id
  );
  const recentInboundRows = await dbTimed(async () => {
    const rowsOrPromise = db
      .prepare(
        `SELECT subject, body_text, body_html, raw_payload, received_at, created_at
         FROM inbound_messages
         WHERE user_id = ? AND inbound_address_id = ?
         ORDER BY received_at DESC, created_at DESC
         LIMIT 25`
      )
      .all(userId, address.id);
    return rowsOrPromise && typeof rowsOrPromise.then === 'function' ? await rowsOrPromise : rowsOrPromise;
  });
  const countSince = new Date(Date.now() - INBOUND_MESSAGE_COUNT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const countRow = await dbGet(
    `SELECT COUNT(*) AS count
     FROM inbound_messages
     WHERE user_id = ? AND inbound_address_id = ? AND received_at >= ?`,
    userId,
    address.id,
    countSince
  );

  const lastReceivedAt = address.last_received_at || latestInbound?.received_at || null;
  if (latestInbound?.received_at && (!address.last_received_at || latestInbound.received_at > address.last_received_at)) {
    await dbRun('UPDATE inbound_addresses SET last_received_at = ? WHERE id = ?', latestInbound.received_at, address.id);
  }

  const recentThreshold = new Date(Date.now() - INBOUND_CONNECTED_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const parsedLastReceived = parseIsoDate(lastReceivedAt);
  const hasRecentInbound = Boolean(parsedLastReceived && parsedLastReceived >= recentThreshold);
  const setupState = inferInboundSetupState({
    hasAddress: true,
    confirmedAt: address.confirmed_at || null,
    lastReceivedAt
  });
  const inboundRows = Array.isArray(recentInboundRows) ? recentInboundRows : [];
  let latestGmailVerification = null;
  let hasNonVerificationInbound = false;
  for (const row of inboundRows) {
    const verification = extractGmailForwardingVerificationInfo({
      subject: row?.subject || null,
      bodyText: row?.body_text || null,
      bodyHtml: row?.body_html || null,
      rawPayload: row?.raw_payload || null
    });
    if (verification.detected) {
      if (!latestGmailVerification) {
        latestGmailVerification = {
          received_at: row?.received_at || null,
          subject: truncateInboundSubject(row?.subject || null),
          confirmation_url: verification.confirmation_url || null,
          confirmation_code: verification.confirmation_code || null
        };
      }
      continue;
    }
    hasNonVerificationInbound = true;
    break;
  }
  const forwardingReadiness = inferForwardingReadiness({
    hasAddress: true,
    setupState,
    lastReceivedAt,
    hasNonVerificationInbound,
    hasGmailVerification: Boolean(latestGmailVerification)
  });
  const fallbackPendingCount = signalRow ? null : await countPendingInboundQueue(userId);
  const pendingCount = signalRow ? Number(signalRow.pending_count || 0) : Number(fallbackPendingCount || 0);
  const signalLastInboundAt = signalRow?.last_inbound_at || lastReceivedAt || null;
  const signalLastSubject = truncateInboundSubject(
    signalRow?.last_subject_preview || latestInbound?.subject || null
  );

  return {
    address_email: address.address_email || null,
    preferred_address_email: preferredAddressEmail,
    inbox_username: inboxUsername,
    is_active: normalizeDbBool(address.is_active),
    confirmed_at: address.confirmed_at || null,
    last_received_at: lastReceivedAt,
    last_received_subject: truncateInboundSubject(latestInbound?.subject || null),
    forwarding_readiness: forwardingReadiness,
    address_reachable: Boolean(lastReceivedAt),
    has_non_verification_inbound: Boolean(hasNonVerificationInbound),
    gmail_verification_pending: forwardingReadiness === 'gmail_verification_pending',
    gmail_forwarding_verification: latestGmailVerification,
    message_count_7d: Number(countRow?.count || 0),
    inbound_pending_count: Number.isFinite(pendingCount) ? Math.max(0, pendingCount) : 0,
    inbound_signal_updated_at: signalRow?.updated_at || null,
    inbound_signal_last_inbound_at: signalLastInboundAt,
    inbound_signal_last_subject: signalLastSubject,
    inactive_address_warning: Boolean(recentInactiveInbound),
    inactive_address_warning_meta: recentInactiveInbound
      ? {
          address_email: recentInactiveInbound.address_email || null,
          last_received_at: recentInactiveInbound.received_at || null,
          subject: truncateInboundSubject(recentInactiveInbound.subject || null)
        }
      : null,
    setup_state: setupState,
    connected: hasRecentInbound,
    effective_connected: Boolean(lastReceivedAt),
    last_inbound_sync_at: inboundSyncMeta?.last_inbound_sync_at || null,
    last_inbound_sync: inboundSyncMeta || null
  };
}

function isGoogleInvalidGrantError(err) {
  const queue = [err];
  const visited = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') {
      continue;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    const responseData = current.response && current.response.data ? current.response.data : null;
    const responseError =
      responseData && typeof responseData === 'object' ? responseData.error : null;
    const responseDescription =
      responseData && typeof responseData === 'object' ? responseData.error_description : null;
    if (String(responseError || '').toLowerCase() === 'invalid_grant') {
      return true;
    }
    const text = `${current.code || ''} ${current.name || ''} ${current.message || ''} ${
      responseError || ''
    } ${responseDescription || ''}`;
    if (/invalid_grant/i.test(text)) {
      return true;
    }
    if (Array.isArray(current.errors)) {
      current.errors.forEach((child) => queue.push(child));
    }
    if (current.cause) {
      queue.push(current.cause);
    }
    if (responseData && typeof responseData === 'object') {
      queue.push(responseData);
    }
  }
  return false;
}

function getPreauthCsrfToken(req) {
  const csrfId = req.cookies[CSRF_COOKIE];
  if (!csrfId) {
    return null;
  }
  const entry = preauthCsrfStore.get(csrfId);
  if (!entry || entry.expiresAt <= Date.now()) {
    preauthCsrfStore.delete(csrfId);
    return null;
  }
  return { csrfId, token: entry.token };
}

async function issueCsrfToken(req, res) {
  if (req.session && req.session.id) {
    if (!req.session.csrf_token) {
      const csrfToken = crypto.randomBytes(32).toString('hex');
      await dbTimed(async () => {
        const writeRes = db.prepare('UPDATE sessions SET csrf_token = ? WHERE id = ?').run(csrfToken, req.session.id);
        if (writeRes && typeof writeRes.then === 'function') {
          await writeRes;
        }
      });
      req.session.csrf_token = csrfToken;
    }
    return req.session.csrf_token;
  }

  const existing = getPreauthCsrfToken(req);
  if (existing) {
    return existing.token;
  }

  const csrfId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('hex');
  preauthCsrfStore.set(csrfId, { token, expiresAt: Date.now() + CSRF_TTL_MS });
  setCsrfCookie(res, csrfId);
  return token;
}

function enforceCsrf(req, res, next) {
  if (!req.path.startsWith('/api/')) {
    return next();
  }
  if (CSRF_BYPASS_PATHS.has(req.path)) {
    return next();
  }
  if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }
  const token = req.get(CSRF_HEADER);
  if (!token) {
    return res.status(403).json({ error: 'CSRF_REQUIRED' });
  }

  if (req.session && req.session.csrf_token && req.session.csrf_token === token) {
    return next();
  }

  const preauth = getPreauthCsrfToken(req);
  if (preauth && preauth.token === token) {
    return next();
  }

  return res.status(403).json({ error: 'CSRF_INVALID' });
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'AUTH_REQUIRED' });
  }
  return next();
}

function hasDevAccess(req) {
  if (process.env.JOBTRACK_DEV_MODE === '1') {
    return true;
  }
  const adminEmail = normalizeEmail(process.env.JOBTRACK_ADMIN_EMAIL);
  if (adminEmail && req.user && normalizeEmail(req.user.email) === adminEmail) {
    return true;
  }
  return false;
}

function hashSampleId(value) {
  if (!value) {
    return null;
  }
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function getEventTimestamp(event) {
  const fallback = event.created_at ? new Date(event.created_at) : new Date();
  return toIsoFromInternalDate(event.internal_date, fallback);
}

function getClassificationConfidence(event) {
  if (!event) {
    return 0;
  }
  const value = event.classification_confidence ?? event.confidence_score;
  return Number.isFinite(value) ? value : 0;
}

function applyEventToApplication(application, event) {
  if (application.archived) {
    return;
  }
  const updates = {};
  const eventTimestamp = getEventTimestamp(event);
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
    updates.updated_at = nowIso();
    const keys = Object.keys(updates);
    const setClause = keys.map((key) => `${key} = ?`).join(', ');
    const toPatchBindValue = (value) => {
      if (value === undefined || value === null) {
        return null;
      }
      if (typeof value === 'boolean') {
        return boolBind(db, value);
      }
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === 'object') {
        try {
          return JSON.stringify(value);
        } catch (_) {
          return String(value);
        }
      }
      return value;
    };
    const values = keys.map((key) => toPatchBindValue(updates[key]));
    values.push(application.id);
    db.prepare(`UPDATE job_applications SET ${setClause} WHERE id = ?`).run(...values);
  }

  const identity = extractThreadIdentity({
    subject: event.subject,
    sender: event.sender,
    snippet: event.snippet
  });
  applyCompanyCandidate(db, application, selectCompanyCandidate(identity));
  applyRoleCandidate(db, application, selectRoleCandidate(identity, event));
  applyExternalReqId(db, application, event.external_req_id);
}

const SORTABLE_FIELDS = {
  last_activity_at: coalesceTimestamps(['last_activity_at', 'updated_at']),
  company_name: 'company_name',
  job_title: 'job_title',
  status: 'current_status',
  confidence: 'status_confidence',
  created_at: 'created_at'
};

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function parseListQuery(query) {
  const limit = clampNumber(Number(query.limit) || 25, 1, 100);
  const offset = Math.max(Number(query.offset) || 0, 0);
  const status = query.status && VALID_STATUSES.has(query.status) ? query.status : null;
  const company = query.company ? String(query.company).trim() : null;
  const role = query.role ? String(query.role).trim() : null;
  const recencyDays = Number(query.recency_days);
  const minConfidence = Number(query.min_confidence);
  const suggestionsOnly = query.suggestions_only === '1' || query.suggestions_only === 'true';
  const archived =
    query.archived === undefined ? null : query.archived === '1' || query.archived === 'true';
  const sortByKey = query.sort_by && SORTABLE_FIELDS[query.sort_by] ? query.sort_by : 'last_activity_at';
  const sortDir = query.sort_dir === 'asc' ? 'ASC' : 'DESC';

  return {
    limit,
    offset,
    status,
    company,
    role,
    recencyDays: Number.isFinite(recencyDays) && recencyDays > 0 ? recencyDays : null,
    minConfidence: Number.isFinite(minConfidence) && minConfidence >= 0 ? minConfidence : null,
    suggestionsOnly,
    archived,
    sortBy: SORTABLE_FIELDS[sortByKey],
    sortDir
  };
}

function parseBulkApplicationIds(body) {
  const rawIds = Array.isArray(body?.ids) ? body.ids : [];
  const ids = Array.from(
    new Set(
      rawIds
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    )
  );
  if (!ids.length) {
    return { ok: false, error: 'IDS_REQUIRED' };
  }
  if (ids.length > 250) {
    return { ok: false, error: 'TOO_MANY_IDS' };
  }
  return { ok: true, ids };
}

function sqlInPlaceholders(count) {
  return new Array(Math.max(0, count)).fill('?').join(', ');
}

function buildApplicationFilters({ userId, archived, status, company, role, recencyDays, minConfidence, suggestionsOnly }) {
  const clauses = ['user_id = ?'];
  const params = [userId];

  if (typeof archived === 'boolean') {
    clauses.push('archived = ?');
    // SQLite stores archived as INTEGER(0/1); Postgres stores it as boolean.
    params.push(db && db.isAsync ? archived : archived ? 1 : 0);
  }
  if (status) {
    clauses.push('current_status = ?');
    params.push(status);
  }
  if (company) {
    clauses.push('LOWER(company_name) LIKE ?');
    params.push(`%${company.toLowerCase()}%`);
  }
  if (role) {
    clauses.push('(LOWER(job_title) LIKE ? OR LOWER(role) LIKE ?)');
    params.push(`%${role.toLowerCase()}%`, `%${role.toLowerCase()}%`);
  }
  if (recencyDays) {
    const cutoff = new Date(Date.now() - recencyDays * 24 * 60 * 60 * 1000).toISOString();
    clauses.push(`${coalesceTimestamps(['last_activity_at', 'updated_at'])} >= ?`);
    params.push(cutoff);
  }
  if (minConfidence !== null) {
    clauses.push(`${suggestionsOnly ? 'suggested_confidence' : 'status_confidence'} >= ?`);
    params.push(minConfidence);
  }
  if (suggestionsOnly) {
    clauses.push('suggested_status IS NOT NULL');
  }

  return {
    whereClause: clauses.join(' AND '),
    params
  };
}

const authIpLimiter = createRateLimiter({
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    return ip ? `ip:${ip}` : null;
  }
});
const authEmailLimiter = createRateLimiter({
  keyGenerator: (req) => {
    const email = normalizeEmail(req.body?.email);
    const ip = getClientIp(req);
    return email && ip ? `ip:${ip}|email:${email}` : null;
  }
});
const contactIpLimiter = createRateLimiter({
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    return ip ? `ip:${ip}` : null;
  }
});

app.use(async (req, res, next) => {
  try {
    const token = req.cookies[SESSION_COOKIE];
    if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
      // eslint-disable-next-line no-console
      console.debug('[auth] session check', {
        origin: req.headers.origin || null,
        hasCookie: Boolean(token),
        path: req.path
      });
    }
    if (!token) {
      req.user = null;
      req.session = null;
      return next();
    }
    const session = await getSession(token);
    if (!session) {
      req.user = null;
      req.session = null;
      return next();
    }
    if (new Date(session.expires_at).getTime() < Date.now()) {
      await deleteSession(token);
      req.user = null;
      req.session = null;
      return next();
    }
    const user = await getUserById(session.user_id);
    req.user = user || null;
    req.session = session;
    if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
      // eslint-disable-next-line no-console
      console.debug('[auth] session user', {
        origin: req.headers.origin || null,
        userId: user?.id || null,
        sessionId: session?.id || null
      });
    }
    return next();
  } catch (err) {
    req.user = null;
    req.session = null;
    if (isDbUnavailableError(err) && req.path.startsWith('/api/')) {
      return respondDbUnavailable(res, err, 'auth.session_middleware');
    }
    if (req.path.startsWith('/api/')) {
      logError('auth.session_middleware.failed', buildDbUnavailableMeta(err, 'auth.session_middleware'));
      return res.status(500).json({ error: 'AUTH_SESSION_FAILED' });
    }
    return next();
  }
});

app.use(enforceCsrf);

app.get('/api/auth/csrf', async (req, res) => {
  try {
    const csrfToken = await issueCsrfToken(req, res);
    return res.json({ csrfToken });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return respondDbUnavailable(res, err, 'auth.csrf');
    }
    logError('auth.csrf.failed', buildDbUnavailableMeta(err, 'auth.csrf'));
    return res.status(500).json({ error: 'CSRF_FAILED' });
  }
});

app.get('/api/health', (_req, res) => {
  return res.json({ ok: true });
});

app.get('/api/health/db', async (_req, res) => {
  try {
    const row = await withTimeout(
      Promise.resolve().then(() => db.prepare('SELECT 1 AS ok').get()),
      DB_HEALTH_TIMEOUT_MS,
      'ETIMEDOUT'
    );
    return res.json({ ok: Boolean(row) });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return res.status(503).json({ ok: false, error: 'DB_UNAVAILABLE' });
    }
    logError('health.db.failed', buildDbUnavailableMeta(err, 'health.db'));
    return res.status(503).json({ ok: false, error: 'DB_UNAVAILABLE' });
  }
});

app.post('/api/inbound/postmark', async (req, res) => {
  const configuredSecret = String(process.env.POSTMARK_INBOUND_SECRET || '').trim();
  const querySecretRaw = req.query?.secret;
  const querySecret = Array.isArray(querySecretRaw)
    ? querySecretRaw[0]
    : querySecretRaw;
  const headerSecret = req.get(INBOUND_SECRET_HEADER);
  const hasQuerySecret = Boolean(String(querySecret || '').trim());
  const hasHeaderSecret = Boolean(String(headerSecret || '').trim());
  const authModeAttempted = hasQuerySecret ? 'query' : hasHeaderSecret ? 'header' : 'none';
  const webhookAuthMeta = {
    provider: 'postmark',
    has_query_secret: hasQuerySecret,
    has_header_secret: hasHeaderSecret,
    env_secret_present: Boolean(configuredSecret),
    auth_mode_attempted: authModeAttempted
  };

  logInfo('inbound.webhook.received', webhookAuthMeta);

  if (!configuredSecret) {
    logError('inbound.webhook.missing_env', webhookAuthMeta);
    return res.status(503).json({
      error: 'INBOUND_NOT_READY',
      message: 'POSTMARK_INBOUND_SECRET not configured'
    });
  }

  const querySecretMatches = safeCompareSecret(querySecret, configuredSecret);
  const headerSecretMatches = safeCompareSecret(headerSecret, configuredSecret);
  if (!querySecretMatches && !headerSecretMatches) {
    logWarn('inbound.webhook.auth_failed', webhookAuthMeta);
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
  logInfo('inbound.webhook.auth_success', {
    ...webhookAuthMeta,
    auth_mode: querySecretMatches ? 'query' : 'header'
  });

  const payload = req.body && typeof req.body === 'object' ? req.body : null;
  if (!payload) {
    return res.status(400).json({ error: 'INVALID_PAYLOAD' });
  }

  const inboundDomain = String(process.env.INBOUND_DOMAIN || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '');
  const provider = 'postmark';
  const recipientEmail = extractInboundRecipient(payload, { inboundDomain });
  const fromEmail = extractInboundSenderEmail(payload);
  const subject = String(payload.Subject || '').trim() || null;
  const providerMessageId = payload.MessageID ? String(payload.MessageID).trim() : null;
  const messageIdHeader = extractMessageIdHeader(payload);
  const bodyText = normalizeInboundText(payload.TextBody || '');
  const bodyHtml = payload.HtmlBody ? String(payload.HtmlBody) : null;
  const receivedAt = toIsoDate(payload.Date);
  const sha256 = buildInboundMessageSha256({
    fromEmail,
    subject,
    receivedAt,
    textBody: bodyText,
    htmlBody: bodyHtml
  });

  logInfo('inbound.received', {
    provider,
    recipientEmail: recipientEmail || null,
    fromEmail: fromEmail || null,
    providerMessageIdHash: hashSampleId(providerMessageId),
    messageIdHeaderHash: hashSampleId(messageIdHeader),
    subjectLength: subject ? subject.length : 0,
    bodyTextLength: bodyText.length,
    bodyHtmlLength: bodyHtml ? bodyHtml.length : 0,
    sha256Prefix: sha256.slice(0, 12)
  });

  if (!recipientEmail) {
    logWarn('inbound.mapped_user', {
      provider,
      mapped: false,
      reason: 'missing_recipient'
    });
    return res.status(202).json({ ok: true, ignored: true, reason: 'MISSING_RECIPIENT' });
  }

  try {
    const mappedAddress = await dbTimed(async () => {
      const rowOrPromise = db
        .prepare(
          `SELECT id, user_id, address_email, is_active
           FROM inbound_addresses
           WHERE lower(address_email) = ?
           ORDER BY is_active DESC, created_at DESC
           LIMIT 1`
        )
        .get(String(recipientEmail).toLowerCase());
      return rowOrPromise && typeof rowOrPromise.then === 'function' ? await rowOrPromise : rowOrPromise;
    });

    if (!mappedAddress) {
      logInfo('inbound.mapped_user', {
        provider,
        mapped: false,
        recipientEmail
      });
      return res.status(202).json({ ok: true, ignored: true, reason: 'RECIPIENT_NOT_MAPPED' });
    }

    logInfo('inbound.mapped_user', {
      provider,
      mapped: true,
      userId: mappedAddress.user_id,
      inboundAddressId: mappedAddress.id,
      inboundAddressActive: normalizeDbBool(mappedAddress.is_active)
    });

    if (!normalizeDbBool(mappedAddress.is_active)) {
      logWarn('inbound.inactive_address_received', {
        provider,
        userId: mappedAddress.user_id,
        inboundAddressId: mappedAddress.id,
        recipientEmail
      });
    }

    const inboundReceivedAt = nowIso();
    await dbTimed(async () => {
      const runRes = db
        .prepare('UPDATE inbound_addresses SET last_received_at = ? WHERE id = ?')
        .run(inboundReceivedAt, mappedAddress.id);
      if (runRes && typeof runRes.then === 'function') {
        await runRes;
      }
    });
    await touchUserInboxSignal(mappedAddress.user_id, {
      lastInboundAt: inboundReceivedAt,
      lastSubjectPreview: subject || null
    });

    const dedupeByHeader = messageIdHeader
      ? await dbTimed(async () => {
          const rowOrPromise = db
            .prepare(
              `SELECT id
               FROM inbound_messages
               WHERE user_id = ?
                 AND provider = ?
                 AND message_id_header = ?
               LIMIT 1`
            )
            .get(mappedAddress.user_id, provider, messageIdHeader);
          return rowOrPromise && typeof rowOrPromise.then === 'function' ? await rowOrPromise : rowOrPromise;
        })
      : null;
    if (dedupeByHeader) {
      logInfo('inbound.deduped', {
        provider,
        userId: mappedAddress.user_id,
        reason: 'message_id_header',
        inboundMessageId: dedupeByHeader.id
      });
      return res.status(200).json({ ok: true, deduped: true });
    }

    const dedupeByProviderId = providerMessageId
      ? await dbTimed(async () => {
          const rowOrPromise = db
            .prepare(
              `SELECT id
               FROM inbound_messages
               WHERE user_id = ?
                 AND provider = ?
                 AND provider_message_id = ?
               LIMIT 1`
            )
            .get(mappedAddress.user_id, provider, providerMessageId);
          return rowOrPromise && typeof rowOrPromise.then === 'function' ? await rowOrPromise : rowOrPromise;
        })
      : null;
    if (dedupeByProviderId) {
      logInfo('inbound.deduped', {
        provider,
        userId: mappedAddress.user_id,
        reason: 'provider_message_id',
        inboundMessageId: dedupeByProviderId.id
      });
      return res.status(200).json({ ok: true, deduped: true });
    }

    const dedupeBySha = await dbTimed(async () => {
      const rowOrPromise = db
        .prepare(
          `SELECT id
           FROM inbound_messages
           WHERE sha256 = ?
           LIMIT 1`
        )
        .get(sha256);
      return rowOrPromise && typeof rowOrPromise.then === 'function' ? await rowOrPromise : rowOrPromise;
    });
    if (dedupeBySha) {
      logInfo('inbound.deduped', {
        provider,
        userId: mappedAddress.user_id,
        reason: 'sha256',
        inboundMessageId: dedupeBySha.id
      });
      return res.status(200).json({ ok: true, deduped: true });
    }

    const inboundMessageId = crypto.randomUUID();
    const createdAt = nowIso();
    const rawPayload = db && db.isAsync ? payload : JSON.stringify(payload);

    try {
      await dbTimed(async () => {
        const runRes = db
          .prepare(
            `INSERT INTO inbound_messages
             (id, user_id, inbound_address_id, provider, provider_message_id, message_id_header,
              subject, from_email, to_email, received_at, body_text, body_html, raw_payload, sha256, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            inboundMessageId,
            mappedAddress.user_id,
            mappedAddress.id,
            provider,
            providerMessageId || null,
            messageIdHeader || null,
            subject,
            fromEmail || null,
            recipientEmail,
            receivedAt,
            bodyText || null,
            bodyHtml,
            rawPayload,
            sha256,
            createdAt
          );
        if (runRes && typeof runRes.then === 'function') {
          await runRes;
        }
      });
    } catch (insertErr) {
      if (isUniqueConstraintError(insertErr)) {
        logInfo('inbound.deduped', {
          provider,
          userId: mappedAddress.user_id,
          reason: 'unique_constraint',
          sha256Prefix: sha256.slice(0, 12)
        });
        return res.status(200).json({ ok: true, deduped: true });
      }
      throw insertErr;
    }

    logInfo('inbound.persisted', {
      provider,
      inboundMessageId,
      userId: mappedAddress.user_id,
      inboundAddressId: mappedAddress.id,
      subjectLength: subject ? subject.length : 0,
      bodyTextLength: bodyText.length,
      bodyHtmlLength: bodyHtml ? bodyHtml.length : 0,
      sha256Prefix: sha256.slice(0, 12)
    });

    await upsertUserInboxSignalIncrement(mappedAddress.user_id, {
      lastInboundAt: inboundReceivedAt,
      lastSubjectPreview: subject || null
    });

    logInfo('inbound.queued', {
      provider,
      inboundMessageId,
      userId: mappedAddress.user_id
    });

    return res.status(200).json({
      ok: true,
      inbound_message_id: inboundMessageId,
      deduped: false
    });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return respondDbUnavailable(res, err, 'inbound.postmark');
    }
    logError('inbound.failed', {
      provider,
      code: err && err.code ? String(err.code) : null,
      detail: err && err.message ? String(err.message).slice(0, 240) : String(err),
      recipientEmail: recipientEmail || null,
      providerMessageIdHash: hashSampleId(providerMessageId),
      messageIdHeaderHash: hashSampleId(messageIdHeader),
      sha256Prefix: sha256.slice(0, 12)
    });
    return res.status(500).json({ error: 'INBOUND_FAILED' });
  }
});

app.use('/api/resume-curator', resumeCuratorRouter);

app.get('/api/auth/session', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'NO_SESSION' });
  }
  return res.json({ user: toSessionUserPayload(req.user) });
});

app.post('/api/auth/login', authIpLimiter, authEmailLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password ? String(req.body.password) : '';
    if (!email) {
      return res.status(400).json({ error: 'EMAIL_REQUIRED' });
    }
    if (!password) {
      return res.status(400).json({ error: 'PASSWORD_REQUIRED' });
    }

    const user = await getUserByEmail(email);
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }
    if (!verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }

    const existingToken = req.cookies[SESSION_COOKIE];
    if (existingToken) {
      await deleteSession(existingToken);
    }

    const session = await createSession(user.id);
    setSessionCookie(res, session.token);
    clearCsrfCookie(res);

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        auth_provider: user.auth_provider,
        inbox_username: user.inbox_username || null
      }
    });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return respondDbUnavailable(res, err, 'auth.login');
    }
    if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
      // eslint-disable-next-line no-console
      console.error('login failed', err);
    }
    return res.status(500).json({ error: err.code || 'LOGIN_FAILED' });
  }
});

app.post('/api/auth/signup', authIpLimiter, authEmailLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const name = req.body.name ? String(req.body.name).trim() : null;
  const password = req.body.password ? String(req.body.password) : '';
  const inboxValidation = validateInboxUsername(req.body.inbox_username, { allowEmpty: true });

  // Validation must short-circuit before any session logic runs
  if (!email) {
    return res.status(400).json({ error: 'EMAIL_REQUIRED' });
  }
  if (!password) {
    return res.status(400).json({ error: 'PASSWORD_REQUIRED' });
  }
  if (!isPasswordValid(password)) {
    return res.status(400).json({ error: 'PASSWORD_TOO_SHORT', minLength: PASSWORD_MIN_LENGTH });
  }
  if (!inboxValidation.ok) {
    return res.status(400).json({ error: inboxValidation.code || 'INBOX_USERNAME_INVALID' });
  }

  try {
    let user = await getUserByEmail(email);
    const inboxUsername = inboxValidation.value;
    if (inboxUsername) {
      const currentUsername = normalizeInboxUsername(user?.inbox_username);
      if (currentUsername && currentUsername !== inboxUsername) {
        return res.status(409).json({ error: 'INBOX_USERNAME_IMMUTABLE' });
      }

      const availability = await checkInboxUsernameAvailability(inboxUsername, {
        excludeUserId: user?.id || null
      });
      if (!availability.available) {
        return res.status(409).json({
          error: availability.error || 'INBOX_USERNAME_TAKEN',
          suggestions: Array.isArray(availability.suggestions) ? availability.suggestions : []
        });
      }
    }
    const passwordHash = hashPassword(password);

    if (user) {
      if (user.password_hash) {
        return res.status(409).json({ error: 'ACCOUNT_EXISTS' });
      }
      const updates = {
        password_hash: passwordHash,
        auth_provider: mergeAuthProvider(user.auth_provider, 'password')
      };
      if (!user.name && name) {
        updates.name = name;
      }
      if (inboxUsername && (!user.inbox_username || normalizeInboxUsername(user.inbox_username) !== inboxUsername)) {
        updates.inbox_username = inboxUsername;
      }
      await updateUser(user.id, updates);
      user = await getUserById(user.id);
    } else {
      user = await createUser({
        email,
        name,
        passwordHash,
        authProvider: 'password',
        inboxUsername
      });
    }

    if (!user || !user.id) {
      return res.status(500).json({ error: 'AUTH_USER_ID_MISSING' });
    }

    const existingToken = req.cookies[SESSION_COOKIE];
    if (existingToken) {
      await deleteSession(existingToken);
    }

    const session = await createSession(user.id);
    setSessionCookie(res, session.token);
    clearCsrfCookie(res);

    if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
      // eslint-disable-next-line no-console
      console.debug('[auth] created user id:', user.id);
    }

    return res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        auth_provider: user.auth_provider,
        inbox_username: user.inbox_username || null
      }
    });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return respondDbUnavailable(res, err, 'auth.signup');
    }
    if (isUniqueConstraintError(err) && /inbox_username/i.test(String(err?.message || ''))) {
      return res.status(409).json({ error: 'INBOX_USERNAME_TAKEN' });
    }
    if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
      // eslint-disable-next-line no-console
      console.error('signup failed', err);
    }
    return res.status(500).json({ error: err.code || 'SIGNUP_FAILED' });
  }
});

app.get('/api/inbound/username/availability', authIpLimiter, async (req, res) => {
  try {
    const availability = await checkInboxUsernameAvailability(req.query.username, {
      excludeUserId: req.user?.id || null
    });
    return res.json(availability);
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return respondDbUnavailable(res, err, 'inbound.username_availability');
    }
    logError('inbound.username_availability.failed', {
      code: err?.code || null,
      detail: err?.message ? String(err.message).slice(0, 220) : String(err)
    });
    return res.status(500).json({ error: 'INBOX_USERNAME_AVAILABILITY_FAILED' });
  }
});

app.get('/api/auth/google/start', authIpLimiter, (req, res) => {
  const oAuthClient = getGoogleOAuthClient();
  const authConfig = getGoogleAuthConfig();
  if (!oAuthClient || !authConfig) {
    return res.redirect(getWebAuthErrorRedirect('GOOGLE_NOT_CONFIGURED'));
  }
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: isCrossSiteAuth() ? 'none' : 'lax',
    secure: isCrossSiteAuth() || isProd(),
    maxAge: GOOGLE_STATE_TTL_MS,
    ...cookieDomainOptions()
  });
  if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
    // eslint-disable-next-line no-console
    console.debug('[google-auth] start', {
      redirect_uri: authConfig.redirectUri,
      scopes: GOOGLE_SIGNIN_SCOPES,
      app_domain: WEB_BASE_URL
    });
  }
  const url = getGoogleAuthUrl(oAuthClient, state, {
    scopes: GOOGLE_SIGNIN_SCOPES,
    accessType: 'online',
    prompt: 'select_account'
  });
  return res.redirect(url);
});

app.get('/api/auth/google/callback', authIpLimiter, async (req, res) => {
  const oAuthClient = getGoogleOAuthClient();
  if (!oAuthClient) {
    return res.redirect(getWebAuthErrorRedirect('GOOGLE_NOT_CONFIGURED'));
  }

  const state = String(req.query.state || '');
  const storedState = req.cookies[GOOGLE_STATE_COOKIE];
  if (!state || !storedState || state !== storedState) {
    res.clearCookie(GOOGLE_STATE_COOKIE, {
      httpOnly: true,
      sameSite: isCrossSiteAuth() ? 'none' : 'lax',
      secure: isCrossSiteAuth() || isProd(),
      ...cookieDomainOptions()
    });
    return res.redirect(getWebAuthErrorRedirect('OAUTH_STATE_INVALID'));
  }
  res.clearCookie(GOOGLE_STATE_COOKIE, {
    httpOnly: true,
    sameSite: isCrossSiteAuth() ? 'none' : 'lax',
    secure: isCrossSiteAuth() || isProd(),
    ...cookieDomainOptions()
  });

  let profile = null;
  if (process.env.NODE_ENV === 'test' && req.query.test_email) {
    profile = {
      email: String(req.query.test_email),
      emailVerified: true,
      name: req.query.test_name ? String(req.query.test_name) : null
    };
  } else {
    const code = req.query.code;
    if (!code) {
      return res.redirect(getWebAuthErrorRedirect('OAUTH_CODE_MISSING'));
    }
    try {
      const result = await getGoogleProfileFromCode(oAuthClient, code);
      profile = result || null;
    } catch (err) {
      logError('google-auth.verify-failed', {
        code: err && err.code ? String(err.code) : null,
        message: err && err.message ? String(err.message) : String(err)
      });
      return res.redirect(getWebAuthErrorRedirect('GOOGLE_AUTH_VERIFY_FAILED'));
    }
  }

  if (!profile?.email || !profile.emailVerified) {
    return res.redirect(getWebAuthErrorRedirect('GOOGLE_EMAIL_UNVERIFIED'));
  }

  const email = normalizeEmail(profile.email);
  let user = await getUserByEmail(email);
  if (!user) {
    await createUser({
      email,
      name: profile.name,
      passwordHash: null,
      authProvider: 'google'
    });
    user = await getUserByEmail(email);
  } else {
    const updates = {};
    const nextProvider = mergeAuthProvider(user.auth_provider, 'google');
    if (nextProvider !== user.auth_provider) {
      updates.auth_provider = nextProvider;
    }
    if (!user.name && profile.name) {
      updates.name = profile.name;
    }
    if (Object.keys(updates).length) {
      await updateUser(user.id, updates);
      user = await getUserById(user.id);
    }
  }

  let shouldAutoConnectGmail = false;
  if (user?.id) {
    try {
      const alreadyConnected = await hasStoredGmailConnection(user.id);
      shouldAutoConnectGmail = !alreadyConnected && Boolean(getOAuthClient()) && isEncryptionReady();
    } catch (err) {
      logError('google-auth.auto-connect-check-failed', {
        userId: user.id,
        code: err && err.code ? String(err.code) : null,
        message: err && err.message ? String(err.message) : String(err)
      });
      shouldAutoConnectGmail = false;
    }
  }

  // Guard against missing user id before session creation (dialect-safe)
  if (!user || !user.id) {
    if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
      // eslint-disable-next-line no-console
      console.error('[auth][google] user missing after create/update', { email });
    }
    clearSessionCookie(res);
    clearCsrfCookie(res);
    if (process.env.NODE_ENV === 'test') {
      return res.status(500).json({ error: 'OAUTH_USER_CREATE_FAILED' });
    }
    return res.redirect(getWebAuthErrorRedirect('OAUTH_USER_CREATE_FAILED'));
  }

  const existingToken = req.cookies[SESSION_COOKIE];
  if (existingToken) {
    await deleteSession(existingToken);
  }

  const session = await createSession(user.id);
  setSessionCookie(res, session.token);
  clearCsrfCookie(res);
  if (shouldAutoConnectGmail) {
    return res.redirect('/api/email/connect/start?mode=auto');
  }
  return res.redirect(`${WEB_BASE_URL}/app`);
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    const token = req.cookies[SESSION_COOKIE];
    if (token) {
      await deleteSession(token);
      clearSessionCookie(res);
    }
    return res.json({ ok: true });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return respondDbUnavailable(res, err, 'auth.logout');
    }
    logError('auth.logout.failed', buildDbUnavailableMeta(err, 'auth.logout'));
    return res.status(500).json({ error: 'LOGOUT_FAILED' });
  }
});

app.post('/api/account/password', requireAuth, async (req, res) => {
  try {
    const currentPassword = req.body?.currentPassword ? String(req.body.currentPassword) : '';
    const newPassword = req.body?.newPassword ? String(req.body.newPassword) : '';
    const hasPassword = Boolean(req.user?.password_hash);

    if (!newPassword || !isPasswordValid(newPassword)) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', minLength: PASSWORD_MIN_LENGTH });
    }

    if (hasPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'VALIDATION_ERROR' });
      }
      if (!verifyPassword(currentPassword, req.user.password_hash)) {
        return res.status(401).json({ error: 'INVALID_CURRENT_PASSWORD' });
      }
    }

    await updateUser(req.user.id, {
      password_hash: hashPassword(newPassword),
      auth_provider: mergeAuthProvider(req.user.auth_provider, 'password')
    });

    // Recommended: revoke other sessions for this user (keep current session token).
    const keepToken = req.session?.id || null;
    const revokeRes = keepToken
      ? db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(req.user.id, keepToken)
      : db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.user.id);
    if (revokeRes && typeof revokeRes.then === 'function') {
      await revokeRes;
    }

    if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
      // eslint-disable-next-line no-console
      console.debug('[account] password updated', { userId: req.user.id, hadPassword: hasPassword });
    }

    return res.json({ ok: true });
  } catch (err) {
    if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
      logError('password update failed', {
        error: err && err.message ? err.message : String(err)
      });
    }
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/account/inbox-username', requireAuth, async (req, res) => {
  const validation = validateInboxUsername(req.body?.inbox_username, { allowEmpty: false });
  if (!validation.ok) {
    return res.status(400).json({ error: validation.code || 'INBOX_USERNAME_INVALID' });
  }

  try {
    const desiredUsername = validation.value;
    const user = await getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'USER_NOT_FOUND' });
    }

    const currentUsername = normalizeInboxUsername(user.inbox_username);
    if (currentUsername && currentUsername !== desiredUsername) {
      return res.status(409).json({ error: 'INBOX_USERNAME_IMMUTABLE' });
    }

    if (!currentUsername) {
      const availability = await checkInboxUsernameAvailability(desiredUsername, {
        excludeUserId: req.user.id
      });
      if (!availability.available) {
        return res.status(409).json({
          error: availability.error || 'INBOX_USERNAME_TAKEN',
          suggestions: Array.isArray(availability.suggestions) ? availability.suggestions : []
        });
      }
      await updateUser(req.user.id, { inbox_username: desiredUsername });
    }

    const inboundDomain = String(process.env.INBOUND_DOMAIN || '')
      .trim()
      .toLowerCase()
      .replace(/^@+/, '');
    await getOrCreateInboundAddress(db, req.user.id, { inboundDomain });

    const updatedUser = await getUserById(req.user.id);
    const inboundStatus = await buildInboundAddressStatus(req.user.id, { ensureAddress: true });

    return res.json({
      ok: true,
      user: toSessionUserPayload(updatedUser),
      inbound_status: inboundStatus
    });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return respondDbUnavailable(res, err, 'account.inbox_username');
    }
    if (isUniqueConstraintError(err) && /inbox_username/i.test(String(err?.message || ''))) {
      return res.status(409).json({ error: 'INBOX_USERNAME_TAKEN' });
    }
    logError('account.inbox_username.failed', {
      userId: req.user?.id || null,
      code: err?.code || null,
      detail: err?.message ? String(err.message).slice(0, 220) : String(err)
    });
    return res.status(500).json({ error: 'INBOX_USERNAME_UPDATE_FAILED' });
  }
});

app.post('/api/contact', contactIpLimiter, async (req, res) => {
  try {
    const name = normalizeContactField(req.body?.name);
    const email = normalizeContactField(req.body?.email);
    const message = normalizeContactMessage(req.body?.message);

    if (!name) {
      return res.status(400).json({ error: 'NAME_REQUIRED' });
    }
    if (name.length > CONTACT_NAME_MAX) {
      return res.status(400).json({ error: 'NAME_TOO_LONG' });
    }
    if (!email) {
      return res.status(400).json({ error: 'EMAIL_REQUIRED' });
    }
    if (email.length > CONTACT_EMAIL_MAX) {
      return res.status(400).json({ error: 'EMAIL_TOO_LONG' });
    }
    if (!isLikelyEmail(email)) {
      return res.status(400).json({ error: 'INVALID_EMAIL' });
    }
    if (!message) {
      return res.status(400).json({ error: 'MESSAGE_REQUIRED' });
    }
    if (message.length > CONTACT_MESSAGE_MAX) {
      return res.status(400).json({ error: 'MESSAGE_TOO_LONG' });
    }

    const id = crypto.randomUUID();
    const createdAt = nowIso();
    const userId = req.user?.id || null;

    const runRes = db
      .prepare(
        `INSERT INTO contact_messages (id, created_at, user_id, name, email, message)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, createdAt, userId, name, email, message);
    if (runRes && typeof runRes.then === 'function') {
      await runRes;
    }

    return res.json({ ok: true });
  } catch (err) {
    if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
      logError('contact submit failed', {
        error: err && err.message ? err.message : String(err)
      });
    }
    return res.status(500).json({ error: 'CONTACT_SUBMIT_FAILED' });
  }
});

app.get('/api/inbound/address', requireAuth, async (req, res) => {
  try {
    const status = await buildInboundAddressStatus(req.user.id, { ensureAddress: true });
    return res.json(status);
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return respondDbUnavailable(res, err, 'inbound.address');
    }
    if (err?.code === 'INBOUND_DOMAIN_REQUIRED') {
      return res.status(503).json({ error: 'INBOUND_NOT_CONFIGURED' });
    }
    logError('inbound.address.failed', {
      userId: req.user?.id || null,
      code: err?.code || null,
      detail: err?.message ? String(err.message).slice(0, 220) : String(err)
    });
    return res.status(500).json({ error: 'INBOUND_STATUS_FAILED' });
  }
});

app.post('/api/inbound/address/confirm', requireAuth, async (req, res) => {
  try {
    const inboundDomain = String(process.env.INBOUND_DOMAIN || '')
      .trim()
      .toLowerCase()
      .replace(/^@+/, '');
    const address = await getOrCreateInboundAddress(db, req.user.id, { inboundDomain });
    const confirmedAt = nowIso();
    await dbRun(
      'UPDATE inbound_addresses SET confirmed_at = COALESCE(confirmed_at, ?) WHERE id = ?',
      confirmedAt,
      address.id
    );
    const status = await buildInboundAddressStatus(req.user.id, { ensureAddress: false });
    return res.json(status);
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return respondDbUnavailable(res, err, 'inbound.address.confirm');
    }
    if (err?.code === 'INBOUND_DOMAIN_REQUIRED') {
      return res.status(503).json({ error: 'INBOUND_NOT_CONFIGURED' });
    }
    logError('inbound.address.confirm.failed', {
      userId: req.user?.id || null,
      code: err?.code || null,
      detail: err?.message ? String(err.message).slice(0, 220) : String(err)
    });
    return res.status(500).json({ error: 'INBOUND_CONFIRM_FAILED' });
  }
});

app.post('/api/inbound/address/rotate', requireAuth, async (req, res) => {
  try {
    const inboundDomain = String(process.env.INBOUND_DOMAIN || '')
      .trim()
      .toLowerCase()
      .replace(/^@+/, '');
    const previous = await buildInboundAddressStatus(req.user.id, { ensureAddress: true });
    await rotateInboundAddress(db, req.user.id, {
      inboundDomain,
      preferredLocal: normalizeInboxUsername(req.user?.inbox_username)
    });
    const status = await buildInboundAddressStatus(req.user.id, { ensureAddress: false });
    return res.json({
      ...status,
      rotated_from: previous.address_email || null
    });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return respondDbUnavailable(res, err, 'inbound.address.rotate');
    }
    if (err?.code === 'INBOUND_DOMAIN_REQUIRED') {
      return res.status(503).json({ error: 'INBOUND_NOT_CONFIGURED' });
    }
    logError('inbound.address.rotate.failed', {
      userId: req.user?.id || null,
      code: err?.code || null,
      detail: err?.message ? String(err.message).slice(0, 220) : String(err)
    });
    return res.status(500).json({ error: 'INBOUND_ROTATE_FAILED' });
  }
});

app.get('/api/inbound/status', requireAuth, async (req, res) => {
  try {
    const status = await buildInboundAddressStatus(req.user.id, { ensureAddress: false });
    return res.json(status);
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return respondDbUnavailable(res, err, 'inbound.status');
    }
    logError('inbound.status.failed', {
      userId: req.user?.id || null,
      code: err?.code || null,
      detail: err?.message ? String(err.message).slice(0, 220) : String(err)
    });
    return res.status(500).json({ error: 'INBOUND_STATUS_FAILED' });
  }
});

app.get('/api/inbound/recent', requireAuth, async (req, res) => {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  try {
    const limit = clampNumber(Number(req.query.limit) || 50, 1, 200);
    const rows = await db
      .prepare(
        `SELECT id,
                received_at,
                from_email,
                subject,
                provider,
                derived_company,
                derived_role,
                derived_status,
                derived_application_id,
                processing_status,
                processing_error,
                derived_debug_json
         FROM inbound_messages
         WHERE user_id = ?
         ORDER BY received_at DESC, created_at DESC
         LIMIT ?`
      )
      .all(req.user.id, limit);

    const normalizedRows = (Array.isArray(rows) ? rows : rows?.rows || []).map((row) => {
      const processingState = row.processing_status || null;
      const errorValue = String(row.processing_error || '').trim();
      const suppressReason =
        processingState === 'ignored' && errorValue.startsWith('suppressed:')
          ? errorValue.slice('suppressed:'.length)
          : null;
      let debugJson = null;
      if (row.derived_debug_json && typeof row.derived_debug_json === 'object') {
        debugJson = row.derived_debug_json;
      } else if (row.derived_debug_json) {
        try {
          debugJson = JSON.parse(String(row.derived_debug_json));
        } catch (_) {
          debugJson = null;
        }
      }
      const derivedProviderId =
        (debugJson && (debugJson.provider_id || debugJson.providerId || debugJson.provider_hint || debugJson.providerHint)) ||
        null;
      return {
        id: row.id,
        received_at: row.received_at || null,
        from_email: row.from_email || null,
        subject: row.subject || null,
        provider_id: derivedProviderId || row.provider || null,
        derived_company: row.derived_company || null,
        derived_role: row.derived_role || null,
        derived_status: row.derived_status || null,
        derived_application_id: row.derived_application_id || null,
        processing_state: processingState,
        suppress_reason: suppressReason,
        derived_debug_json: debugJson
      };
    });
    const signalRow = await getUserInboxSignal(req.user.id);
    const pendingFallback = signalRow ? null : await countPendingInboundQueue(req.user.id);
    return res.json({
      signal: {
        pending_count: signalRow
          ? Number(signalRow.pending_count || 0)
          : Number.isFinite(Number(pendingFallback))
            ? Number(pendingFallback)
            : 0,
        last_inbound_at: signalRow?.last_inbound_at || null,
        last_subject_preview: truncateInboundSubject(signalRow?.last_subject_preview || null),
        updated_at: signalRow?.updated_at || null
      },
      messages: normalizedRows
    });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return respondDbUnavailable(res, err, 'inbound.recent');
    }
    logError('inbound.recent.failed', {
      userId: req.user?.id || null,
      code: err?.code || null,
      detail: err?.message ? String(err.message).slice(0, 220) : String(err)
    });
    return res.status(500).json({ error: 'INBOUND_RECENT_FAILED' });
  }
});

app.get('/api/inbound/hints', requireAuth, async (req, res) => {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  try {
    const limit = clampNumber(Number(req.query.limit) || 100, 1, 300);
    const rowsRaw = await db
      .prepare(
        `SELECT id,
                provider_id,
                from_domain,
                subject_pattern,
                job_id_token,
                company_override,
                role_override,
                status_override,
                hit_count,
                last_hit_at,
                created_at,
                updated_at
         FROM user_parse_hints
         WHERE user_id = ?
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .all(req.user.id, limit);
    const rows = Array.isArray(rowsRaw) ? rowsRaw : rowsRaw?.rows || [];
    return res.json({ hints: rows });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return respondDbUnavailable(res, err, 'inbound.hints.list');
    }
    logError('inbound.hints.list.failed', {
      userId: req.user?.id || null,
      code: err?.code || null,
      detail: err?.message ? String(err.message).slice(0, 220) : String(err)
    });
    return res.status(500).json({ error: 'INBOUND_HINTS_LIST_FAILED' });
  }
});

app.delete('/api/inbound/hints/:id', requireAuth, async (req, res) => {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  try {
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ error: 'INVALID_HINT_ID' });
    }
    const existing = await db
      .prepare('SELECT id FROM user_parse_hints WHERE id = ? AND user_id = ?')
      .get(id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    await db.prepare('DELETE FROM user_parse_hints WHERE id = ? AND user_id = ?').run(id, req.user.id);
    return res.json({ ok: true });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return respondDbUnavailable(res, err, 'inbound.hints.delete');
    }
    logError('inbound.hints.delete.failed', {
      userId: req.user?.id || null,
      hintId: req.params?.id || null,
      code: err?.code || null,
      detail: err?.message ? String(err.message).slice(0, 220) : String(err)
    });
    return res.status(500).json({ error: 'INBOUND_HINT_DELETE_FAILED' });
  }
});

app.post('/api/inbound/sync', requireAuth, async (req, res) => {
  const lockToken = acquireInboundSyncLock(req.user?.id || null);
  if (!lockToken) {
    return res.status(409).json({ error: 'SYNC_IN_PROGRESS' });
  }
  try {
    const limit = Math.max(1, Math.min(500, Math.floor(Number(req.body?.limit) || 120)));
    const statusBefore = await buildInboundAddressStatus(req.user.id, { ensureAddress: true });
    if (!statusBefore.last_received_at || statusBefore.setup_state !== 'active') {
      return res.json({
        status: 'not_connected',
        processed: 0,
        ignored: 0,
        errors: 0,
        created: 0,
        updated: 0,
        pending_remaining: Number(statusBefore?.inbound_pending_count || 0),
        sample: [],
        ...statusBefore
      });
    }

    const result = await syncInboundForwardedMessages({
      db,
      userId: req.user.id,
      limit
    });
    const pendingRemaining = Number.isFinite(Number(result?.pending_remaining))
      ? Number(result.pending_remaining)
      : await countPendingInboundQueue(req.user.id);
    await setUserInboxSignalPendingCount(req.user.id, pendingRemaining, {
      lastInboundAt: result?.last_received_at || statusBefore?.last_received_at || null,
      lastSubjectPreview: statusBefore?.last_received_subject || null
    });

    const inboundSyncMeta = normalizeInboundSyncMeta({
      last_inbound_sync_at: result.last_processed_at || nowIso(),
      processed: result.processed,
      ignored: result.ignored,
      created: result.created,
      updated: result.updated,
      errors: result.errors
    });
    if (inboundSyncMeta) {
      await storeInboundSyncMeta(req.user.id, inboundSyncMeta);
    }

    const statusAfter = await buildInboundAddressStatus(req.user.id, { ensureAddress: false });
    return res.json({
      status: result.status || 'ok',
      processed: result.processed || 0,
      ignored: result.ignored || 0,
      errors: result.errors || 0,
      errors_detail: Array.isArray(result.errors_detail) ? result.errors_detail.slice(0, 5) : [],
      created: result.created || 0,
      updated: result.updated || 0,
      pending_remaining: pendingRemaining,
      sample: Array.isArray(result.sample) ? result.sample.slice(0, 3) : [],
      last_processed_at: result.last_processed_at || inboundSyncMeta?.last_inbound_sync_at || null,
      ...statusAfter,
      last_inbound_sync_at:
        inboundSyncMeta?.last_inbound_sync_at || statusAfter.last_inbound_sync_at || null,
      last_inbound_sync: inboundSyncMeta || statusAfter.last_inbound_sync || null
    });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return respondDbUnavailable(res, err, 'inbound.sync');
    }
    logError('inbound.sync.failed', {
      userId: req.user?.id || null,
      code: err?.code || null,
      detail: err?.message ? String(err.message).slice(0, 240) : String(err)
    });
    return res.status(500).json({ error: 'INBOUND_SYNC_FAILED' });
  } finally {
    releaseInboundSyncLock(req.user?.id || null, lockToken);
  }
});

app.get('/api/email/status', requireAuth, async (req, res) => {
  const configured = Boolean(getOAuthClient());
  const encryptionReady = isEncryptionReady();
  let tokens = null;
  let lastSync = null;
  if (encryptionReady) {
    try {
      tokens = await getStoredTokens(db, req.user.id);
    } catch (err) {
      return res.json({
        configured,
        encryptionReady: false,
        connected: false,
        email: null,
        error: 'TOKEN_ENC_KEY_INVALID'
      });
    }
  }
  try {
    lastSync = await getLatestGmailSyncMeta(req.user.id);
  } catch (err) {
    lastSync = null;
  }
  return res.json({
    configured,
    encryptionReady,
    connected: Boolean(tokens),
    email: tokens?.connected_email || null,
    last_synced_at: lastSync?.last_synced_at || null,
    last_sync: lastSync
  });
});

app.post('/api/email/disconnect', requireAuth, async (req, res) => {
  try {
    await clearStoredGmailConnection(req.user.id);
    return res.json({ ok: true });
  } catch (err) {
    logError('gmail.disconnect.failed', {
      userId: req.user?.id || null,
      code: err && err.code ? String(err.code) : null,
      message: err && err.message ? String(err.message) : String(err)
    });
    return res.status(500).json({ error: 'GMAIL_DISCONNECT_FAILED' });
  }
});

app.get('/api/email/connect/start', requireAuth, (req, res) => {
  const oauthConfig = getOAuthClientConfig();
  const oAuthClient = getOAuthClient();
  if (!oAuthClient) {
    return res.redirect(getWebRedirectWithParams({ auth_error: 'GMAIL_NOT_CONFIGURED' }));
  }
  if (!isEncryptionReady()) {
    return res.redirect(getWebRedirectWithParams({ auth_error: 'TOKEN_ENC_KEY_REQUIRED' }));
  }
  const mode = req.query.mode === 'auto' ? 'auto' : 'manual';
  const url = getAuthUrl(oAuthClient, {
    state: mode === 'auto' ? GMAIL_AUTO_CONNECT_STATE : undefined,
    accessType: 'offline',
    prompt: 'consent'
  });
  if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
    const clientId = oauthConfig?.clientId ? `${String(oauthConfig.clientId).slice(0, 12)}...` : null;
    // eslint-disable-next-line no-console
    console.debug('[gmail-connect] oauth', {
      clientId,
      projectHint: oauthConfig?.source || 'unknown',
      redirectUri: oauthConfig?.redirectUri || null,
      scopes: GMAIL_SCOPES
    });
    try {
      const parsed = new URL(url);
      const scopes = (parsed.searchParams.get('scope') || '')
        .split(/\s+/)
        .map((item) => item.trim())
        .filter(Boolean);
      // eslint-disable-next-line no-console
      console.debug('[gmail-oauth] start', {
        mode,
        client_id: parsed.searchParams.get('client_id'),
        scopes
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.debug('[gmail-oauth] start', { mode, parse_error: String(err && err.message ? err.message : err) });
    }
  }
  return res.redirect(url);
});

app.post('/api/email/connect', requireAuth, (req, res) => {
  // eslint-disable-next-line no-console
  console.log('[gmail-connect] hit', { method: req.method, path: req.originalUrl || req.path });
  const oauthConfig = getOAuthClientConfig();
  const oAuthClient = getOAuthClient();
  if (!oAuthClient) {
    return res.status(400).json({ error: 'GMAIL_NOT_CONFIGURED' });
  }
  if (!isEncryptionReady()) {
    return res.status(400).json({ error: 'TOKEN_ENC_KEY_REQUIRED' });
  }
  const url = getAuthUrl(oAuthClient);
  let clientId = oauthConfig?.clientId || null;
  let redirectUri = oauthConfig?.redirectUri || null;
  let scopes = Array.isArray(GMAIL_SCOPES) ? GMAIL_SCOPES : [];
  let authUrlHost = null;
  let scopeStringLength = scopes.join(' ').length;
  let projectHint = oauthConfig?.source || 'unknown';

  try {
    const parsed = new URL(url);
    const queryClientId = parsed.searchParams.get('client_id') || clientId;
    const queryRedirectUri = parsed.searchParams.get('redirect_uri') || redirectUri;
    const scopeString = parsed.searchParams.get('scope') || '';
    const queryScopes = scopeString
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
    clientId = queryClientId;
    redirectUri = queryRedirectUri;
    scopes = queryScopes.length ? queryScopes : scopes;
    authUrlHost = parsed.host || null;
    scopeStringLength = scopeString.length || scopeStringLength;
  } catch (_) {
    // Keep fallbacks from env + configured scopes if URL parsing fails.
  }

  const clientIdPrefix = clientId ? `${String(clientId).slice(0, 12)}…` : null;
  // eslint-disable-next-line no-console
  console.log('[gmail-connect] oauth', {
    clientIdPrefix,
    projectHint,
    redirectUri,
    scopes,
    authUrlHost,
    scopeStringLength
  });

  if (process.env.NODE_ENV !== 'production') {
    return res.json({
      url,
      debug: {
        clientIdPrefix,
        projectHint,
        redirectUri,
        scopes,
        authUrlHost,
        scopeStringLength
      }
    });
  }

  return res.json({ url });
});

app.get('/api/email/callback', requireAuth, async (req, res) => {
  const mode = String(req.query.state || '') === GMAIL_AUTO_CONNECT_STATE ? 'auto' : 'manual';
  const oAuthClient = getOAuthClient();
  if (!oAuthClient) {
    if (mode === 'auto') {
      return res.redirect(getWebRedirectWithParams({ auth_error: 'GMAIL_NOT_CONFIGURED' }));
    }
    return res.status(400).send('Gmail OAuth not configured.');
  }
  if (!isEncryptionReady()) {
    if (mode === 'auto') {
      return res.redirect(getWebRedirectWithParams({ auth_error: 'TOKEN_ENC_KEY_REQUIRED' }));
    }
    return res.status(400).send('Missing token encryption key.');
  }
  let tokens = null;
  if (process.env.NODE_ENV === 'test' && (req.query.test_access_token || req.query.test_refresh_token)) {
    tokens = {
      access_token: req.query.test_access_token ? String(req.query.test_access_token) : null,
      refresh_token: req.query.test_refresh_token ? String(req.query.test_refresh_token) : null,
      scope: req.query.test_scope ? String(req.query.test_scope) : undefined,
      expiry_date: req.query.test_expiry_date ? Number(req.query.test_expiry_date) : undefined
    };
    oAuthClient.setCredentials(tokens);
  } else {
    const code = req.query.code;
    if (!code) {
      if (mode === 'auto') {
        return res.redirect(getWebRedirectWithParams({ auth_error: 'OAUTH_CODE_MISSING' }));
      }
      return res.status(400).send('Missing OAuth code.');
    }
    try {
      const tokenResponse = await oAuthClient.getToken(code);
      tokens = tokenResponse?.tokens || null;
      oAuthClient.setCredentials(tokens || {});
    } catch (err) {
      if (mode === 'auto') {
        return res.redirect(getWebRedirectWithParams({ auth_error: 'GMAIL_CONNECT_FAILED' }));
      }
      return res.status(500).send('Failed to connect Gmail.');
    }
  }

  if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
    if (mode === 'auto') {
      return res.redirect(getWebRedirectWithParams({ auth_error: 'GMAIL_CONNECT_FAILED' }));
    }
    return res.status(400).send('Missing OAuth code.');
  }

  try {
    let connectedEmail = null;
    try {
      connectedEmail = await fetchConnectedEmail(oAuthClient);
    } catch (err) {
      connectedEmail = null;
    }
    if (!connectedEmail && mode === 'auto' && req.user?.email) {
      connectedEmail = normalizeEmail(req.user.email);
    }
    await upsertTokens(db, req.user.id, tokens, connectedEmail);
    if (mode === 'auto') {
      return res.redirect(getWebRedirectWithParams({ gmail_connected: '1' }));
    }
    return res.redirect(`${WEB_BASE_URL}/app#account`);
  } catch (err) {
    if (mode === 'auto') {
      return res.redirect(getWebRedirectWithParams({ auth_error: 'GMAIL_CONNECT_FAILED' }));
    }
    return res.status(500).send('Failed to connect Gmail.');
  }
});

app.post('/api/email/sync', requireAuth, async (req, res) => {
  const mode = req.body.mode === 'days' ? 'days' : 'since_last';
  const requestedDays = clampSyncDays(req.body.days, FIRST_SYNC_DAYS);
  const maxResults = Number(req.body.maxResults) || 500;
  const syncId = req.body.sync_id || crypto.randomUUID();
  if (!isEncryptionReady()) {
    return res.status(400).json({ error: 'TOKEN_ENC_KEY_REQUIRED' });
  }
  try {
    const syncEnd = new Date();
    let syncStart = null;
    let effectiveDays = requestedDays;
    if (mode === 'since_last') {
      const lastSync = await getLatestGmailSyncMeta(req.user.id);
      const lastSyncedDate = parseIsoDate(lastSync?.last_synced_at);
      if (lastSyncedDate && lastSyncedDate.getTime() < syncEnd.getTime()) {
        syncStart = lastSyncedDate;
      } else {
        syncStart = new Date(syncEnd.getTime() - FIRST_SYNC_DAYS * 24 * 60 * 60 * 1000);
      }
      effectiveDays = Math.max(
        1,
        Math.round((syncEnd.getTime() - syncStart.getTime()) / (24 * 60 * 60 * 1000))
      );
    } else {
      syncStart = new Date(syncEnd.getTime() - requestedDays * 24 * 60 * 60 * 1000);
      effectiveDays = requestedDays;
    }

    migrate(db);
    const result = await syncGmailMessages({
      db,
      userId: req.user.id,
      days: effectiveDays,
      maxResults,
      syncId,
      mode,
      timeWindowStart: syncStart,
      timeWindowEnd: syncEnd
    });
    if ((result?.status || 'ok') !== 'not_connected') {
      const syncMeta = normalizeSyncMeta({
        mode,
        days: effectiveDays,
        last_synced_at: syncEnd.toISOString(),
        time_window_start: result.time_window_start || syncStart.toISOString(),
        time_window_end: result.time_window_end || syncEnd.toISOString(),
        message_count_scanned:
          result.total_messages_listed ?? result.fetched_total ?? result.fetched ?? 0,
        applications_updated: computeApplicationsUpdated(result)
      });
      if (syncMeta) {
        await storeGmailSyncMeta(req.user.id, syncMeta);
      }
      return res.json({
        ...result,
        sync_id: syncId,
        mode,
        days: effectiveDays,
        last_synced_at: syncMeta?.last_synced_at || syncEnd.toISOString(),
        message_count_scanned: syncMeta?.message_count_scanned ?? null,
        applications_updated: syncMeta?.applications_updated ?? null,
        last_sync: syncMeta || null
      });
    }
    return res.json({ ...result, sync_id: syncId, mode, days: effectiveDays });
  } catch (err) {
    if (isGoogleInvalidGrantError(err)) {
      let providerEmail = null;
      try {
        const row = await getStoredGmailTokenRow(req.user.id);
        providerEmail = row?.connected_email || null;
      } catch (_) {
        providerEmail = null;
      }
      try {
        await clearStoredGmailConnection(req.user.id);
      } catch (clearErr) {
        logError('gmail.refresh.invalid_grant.clear_failed', {
          userId: req.user.id,
          code: clearErr && clearErr.code ? String(clearErr.code) : null,
          detail:
            clearErr && clearErr.message
              ? String(clearErr.message).slice(0, 240)
              : String(clearErr)
        });
      }
      logError('gmail.refresh.invalid_grant', {
        userId: req.user.id,
        providerEmail
      });
      return res.status(401).json({ error: 'GMAIL_RECONNECT_REQUIRED' });
    }
    const code = err && typeof err === 'object' ? err.code || err.name : null;
    const message = err && typeof err === 'object' ? err.message : null;
    const detail = message ? String(message).replace(/(access_token|refresh_token|authorization)=\S+/gi, '$1=[REDACTED]') : null;
    logError('sync.failed', {
      userId: req.user.id,
      code: code || 'UNKNOWN',
      detail: detail || 'Unknown error',
      stack: err && err.stack ? String(err.stack) : null
    });
    return res.status(500).json({
      error: 'SYNC_FAILED',
      code: code || 'UNKNOWN',
      detail: detail || 'Sync failed unexpectedly.'
    });
  }
});

app.get('/api/email/sync/status', requireAuth, (req, res) => {
  const syncId = req.query.sync_id;
  if (!syncId) {
    return res.status(400).json({ error: 'MISSING_SYNC_ID' });
  }
  const progress = getSyncProgress(syncId);
  if (!progress) {
    return res.json({ ok: false, status: 'unknown_sync_id', syncId });
  }
  return res.json(progress);
});

app.get('/api/email/unsorted', requireAuth, (req, res) => {
  const events = db
    .prepare(
      `SELECT id, sender, subject, internal_date, snippet, detected_type, confidence_score, classification_confidence,
              identity_confidence, identity_company_name, identity_job_title, identity_company_confidence,
              role_title, role_confidence, role_source, role_explanation,
              reason_code, reason_detail, ingest_decision, explanation
       FROM email_events
       WHERE user_id = ? AND application_id IS NULL AND detected_type IS NOT NULL
       ORDER BY internal_date DESC
       LIMIT 100`
    )
    .all(req.user.id);
  return res.json({ events });
});

app.post('/api/email/events/:id/attach', requireAuth, (req, res) => {
  const applicationId = req.body.applicationId;
  if (!applicationId) {
    return res.status(400).json({ error: 'APPLICATION_REQUIRED' });
  }
  const event = db
    .prepare('SELECT * FROM email_events WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!event) {
    return res.status(404).json({ error: 'EVENT_NOT_FOUND' });
  }
  const application = db
    .prepare('SELECT * FROM job_applications WHERE id = ? AND user_id = ?')
    .get(applicationId, req.user.id);
  if (!application) {
    return res.status(404).json({ error: 'APPLICATION_NOT_FOUND' });
  }
  if (application.archived) {
    return res.status(400).json({ error: 'APPLICATION_ARCHIVED' });
  }

  db.prepare('UPDATE email_events SET application_id = ? WHERE id = ?').run(applicationId, event.id);
  applyEventToApplication(application, event);

  createUserAction(db, {
    userId: req.user.id,
    applicationId,
    actionType: 'ATTACH_EVENT',
    payload: { eventId: event.id }
  });

  runStatusInferenceForApplication(db, req.user.id, applicationId);

  return res.json({ ok: true });
});

app.post('/api/email/events/:id/create-application', requireAuth, (req, res) => {
  const companyName = String(req.body.company_name || '').trim();
  const jobTitle = String(req.body.job_title || '').trim();
  const jobLocation = req.body.job_location ? String(req.body.job_location).trim() : null;
  const sourceInput = req.body.source ? String(req.body.source).trim() : null;

  if (!companyName || !jobTitle) {
    return res.status(400).json({ error: 'COMPANY_AND_TITLE_REQUIRED' });
  }

  const event = db
    .prepare('SELECT * FROM email_events WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!event) {
    return res.status(404).json({ error: 'EVENT_NOT_FOUND' });
  }
  if (event.application_id) {
    return res.status(400).json({ error: 'EVENT_ALREADY_ASSIGNED' });
  }

  const identity = extractThreadIdentity({
    subject: event.subject,
    sender: event.sender,
    snippet: event.snippet
  });
  const source = sourceInput || identity.senderDomain || null;
  const eventTimestamp = getEventTimestamp(event);
  const initialStatus = inferInitialStatus(event, eventTimestamp);
  const statusExplanation =
    initialStatus.status === ApplicationStatus.APPLIED
      ? `User created from confirmation event ${event.id}.`
      : 'User created from email event.';
  const statusConfidence = initialStatus.status !== ApplicationStatus.UNKNOWN ? 100 : null;
  const companyConfidence = companyName ? 100 : null;
  const companySource = companyName ? 'user' : null;
  const companyExplanation = companyName ? 'Manual entry.' : null;
  const roleConfidence = jobTitle ? 100 : null;
  const roleSource = jobTitle ? 'user' : null;
  const roleExplanation = jobTitle ? 'Manual entry.' : null;
  const applicationKey = buildApplicationKey({
    company: companyName,
    role: jobTitle
  })?.key || null;

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO job_applications
     (id, user_id, company, role, status, status_source, company_name, job_title, job_location, source,
      external_req_id, applied_at, current_status, status_confidence, status_explanation, status_updated_at,
      company_confidence, company_source, company_explanation, role_confidence, role_source, role_explanation,
      last_activity_at, archived, user_override, application_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    req.user.id,
    companyName,
    jobTitle,
    initialStatus.status,
    'user',
    companyName,
    jobTitle,
    jobLocation,
    source,
    event.external_req_id || null,
    initialStatus.appliedAt,
    initialStatus.status,
    statusConfidence,
    statusExplanation,
    createdAt,
    companyConfidence,
    companySource,
    companyExplanation,
    roleConfidence,
    roleSource,
    roleExplanation,
    eventTimestamp,
    0,
    1,
    applicationKey,
    createdAt,
    createdAt
  );

  db.prepare('UPDATE email_events SET application_id = ? WHERE id = ?').run(id, event.id);

  createUserAction(db, {
    userId: req.user.id,
    applicationId: id,
    actionType: 'CREATE_APPLICATION_FROM_EVENT',
    payload: { eventId: event.id }
  });

  const application = db.prepare('SELECT * FROM job_applications WHERE id = ?').get(id);
  runStatusInferenceForApplication(db, req.user.id, id);
  return res.json({ application });
});

app.get('/api/applications', requireAuth, async (req, res) => {
  try {
    const listQuery = parseListQuery(req.query);
    const { whereClause, params } = buildApplicationFilters({
      userId: req.user.id,
      archived: typeof listQuery.archived === 'boolean' ? listQuery.archived : false,
      status: listQuery.status,
      company: listQuery.company,
      role: listQuery.role,
      recencyDays: listQuery.recencyDays,
      minConfidence: listQuery.minConfidence,
      suggestionsOnly: listQuery.suggestionsOnly
    });

    const totalRow = await db
      .prepare(`SELECT COUNT(*) as count FROM job_applications WHERE ${whereClause}`)
      .get(...params);
    const total = totalRow && totalRow.count !== undefined ? Number(totalRow.count) : 0;

    const rawApplications = await db
      .prepare(
        `SELECT id, company_name, job_title, job_location, source, applied_at,
                current_status, status_confidence, status_explanation, status_source,
                suggested_status, suggested_confidence, suggested_explanation,
                last_activity_at, archived, user_override,
                created_at, updated_at
         FROM job_applications
         WHERE ${whereClause}
         ORDER BY ${listQuery.sortBy} ${listQuery.sortDir}
         LIMIT ? OFFSET ?`
      )
      .all(...params, listQuery.limit, listQuery.offset);

    const applications = Array.isArray(rawApplications)
      ? rawApplications
      : rawApplications && Array.isArray(rawApplications.rows)
        ? rawApplications.rows
        : [];

    return res.json({
      applications,
      total,
      limit: listQuery.limit,
      offset: listQuery.offset
    });
  } catch (err) {
    if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
      // eslint-disable-next-line no-console
      console.error('[api] /api/applications failed', {
        code: err && err.code ? String(err.code) : null,
        message: err && err.message ? String(err.message) : String(err)
      });
    }
    return res.status(500).json({ error: 'LIST_APPLICATIONS_FAILED' });
  }
});

app.get('/api/applications/archived', requireAuth, async (req, res) => {
  try {
    const listQuery = parseListQuery({ ...req.query, archived: '1' });
    const { whereClause, params } = buildApplicationFilters({
      userId: req.user.id,
      archived: true,
      status: listQuery.status,
      company: listQuery.company,
      role: listQuery.role,
      recencyDays: listQuery.recencyDays,
      minConfidence: listQuery.minConfidence,
      suggestionsOnly: listQuery.suggestionsOnly
    });

    const totalRow = await db
      .prepare(`SELECT COUNT(*) as count FROM job_applications WHERE ${whereClause}`)
      .get(...params);
    const total = totalRow && totalRow.count !== undefined ? Number(totalRow.count) : 0;

    const rawApplications = await db
      .prepare(
        `SELECT id, company_name, job_title, job_location, source, applied_at,
                current_status, status_confidence, status_explanation, status_source,
                suggested_status, suggested_confidence, suggested_explanation,
                last_activity_at, archived, user_override,
                created_at, updated_at
         FROM job_applications
         WHERE ${whereClause}
         ORDER BY ${listQuery.sortBy} ${listQuery.sortDir}
         LIMIT ? OFFSET ?`
      )
      .all(...params, listQuery.limit, listQuery.offset);

    const applications = Array.isArray(rawApplications)
      ? rawApplications
      : rawApplications && Array.isArray(rawApplications.rows)
        ? rawApplications.rows
        : [];

    return res.json({
      applications,
      total,
      limit: listQuery.limit,
      offset: listQuery.offset
    });
  } catch (err) {
    if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
      // eslint-disable-next-line no-console
      console.error('[api] /api/applications/archived failed', {
        code: err && err.code ? String(err.code) : null,
        message: err && err.message ? String(err.message) : String(err)
      });
    }
    return res.status(500).json({ error: 'LIST_ARCHIVED_APPLICATIONS_FAILED' });
  }
});

app.get('/api/applications/pipeline', requireAuth, async (req, res) => {
  try {
    const listQuery = parseListQuery(req.query);
    const perStatusLimit = clampNumber(Number(req.query.per_status_limit) || 20, 1, 50);
    const statuses = listQuery.status ? [listQuery.status] : Object.values(ApplicationStatus);

    const columns = await Promise.all(
      statuses.map(async (status) => {
        const { whereClause, params } = buildApplicationFilters({
          userId: req.user.id,
          archived: typeof listQuery.archived === 'boolean' ? listQuery.archived : false,
          status,
          company: listQuery.company,
          role: listQuery.role,
          recencyDays: listQuery.recencyDays,
          minConfidence: listQuery.minConfidence,
          suggestionsOnly: listQuery.suggestionsOnly
        });

        const countRow = await db
          .prepare(`SELECT COUNT(*) as count FROM job_applications WHERE ${whereClause}`)
          .get(...params);
        const count = countRow && countRow.count !== undefined ? Number(countRow.count) : 0;

        const rawApplications = await db
          .prepare(
            `SELECT id, company_name, job_title, job_location, source, applied_at,
                    current_status, status_confidence, status_explanation, status_source,
                    suggested_status, suggested_confidence, suggested_explanation,
                    last_activity_at, archived, user_override,
                    created_at, updated_at
             FROM job_applications
             WHERE ${whereClause}
             ORDER BY ${coalesceTimestamps(['last_activity_at', 'updated_at'])} DESC
             LIMIT ?`
          )
          .all(...params, perStatusLimit);

        const applications = Array.isArray(rawApplications)
          ? rawApplications
          : rawApplications && Array.isArray(rawApplications.rows)
            ? rawApplications.rows
            : [];

        return {
          status,
          count,
          applications
        };
      })
    );

    return res.json({ columns });
  } catch (err) {
    if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
      // eslint-disable-next-line no-console
      console.error('[api] /api/applications/pipeline failed', {
        code: err && err.code ? String(err.code) : null,
        message: err && err.message ? String(err.message) : String(err)
      });
    }
    return res.status(500).json({ error: 'PIPELINE_FAILED' });
  }
});

app.get('/api/applications/:id', requireAuth, async (req, res) => {
  try {
    const application = await db
      .prepare('SELECT * FROM job_applications WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!application) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    const limit = clampNumber(Number(req.query.limit) || 50, 1, 200);
    const events = await db
      .prepare(
        `SELECT id, sender, subject, internal_date, snippet,
                detected_type, confidence_score, classification_confidence, ingest_decision, explanation, created_at
         FROM email_events
         WHERE application_id = ?
         ORDER BY internal_date DESC
         LIMIT ?`
      )
      .all(application.id, limit);

    const rows = Array.isArray(events)
      ? events
      : events && Array.isArray(events.rows)
      ? events.rows
      : [];

    function normalizeEpochMs(value) {
      if (!value) return null;
      if (value instanceof Date) return value.getTime();
      if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;
        if (/^\d+$/.test(trimmed)) {
          const num = Number(trimmed);
          if (!Number.isFinite(num)) return null;
          return num < 1e12 ? num * 1000 : num;
        }
        const parsed = Date.parse(trimmed);
        return Number.isNaN(parsed) ? null : parsed;
      }
      return null;
    }

    const normalizedEvents = rows.map((row) => ({
      ...row,
      internal_date: normalizeEpochMs(row.internal_date)
    }));
    const latestInbound = await db
      .prepare(
        `SELECT id
         FROM inbound_messages
         WHERE user_id = ?
           AND derived_application_id = ?
         ORDER BY received_at DESC, created_at DESC
         LIMIT 1`
      )
      .get(req.user.id, application.id);

    return res.json({
      application: {
        ...application,
        last_inbound_message_id: latestInbound?.id || null
      },
      events: normalizedEvents
    });
  } catch (err) {
    if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
      // eslint-disable-next-line no-console
      console.error('[api] /api/applications/:id failed', {
        code: err && err.code ? String(err.code) : null,
        message: err && err.message ? String(err.message) : String(err)
      });
    }
    return res.status(500).json({ error: 'GET_APPLICATION_FAILED' });
  }
});

app.post('/api/applications', requireAuth, (req, res) => {
  const companyName = String(req.body.company_name || req.body.company || '').trim();
  const jobTitle = String(req.body.job_title || req.body.role || '').trim();
  const status = req.body.current_status || req.body.status || ApplicationStatus.UNKNOWN;
  const jobLocation = req.body.job_location ? String(req.body.job_location).trim() : null;
  const source = req.body.source ? String(req.body.source).trim() : null;

  if (!companyName || !jobTitle) {
    return res.status(400).json({ error: 'COMPANY_AND_ROLE_REQUIRED' });
  }
  if (!VALID_STATUSES.has(status)) {
    return res.status(400).json({ error: 'INVALID_STATUS' });
  }

  const id = crypto.randomUUID();
  const timestamp = nowIso();
  const appliedAt = status === ApplicationStatus.APPLIED ? timestamp : null;
  const statusConfidence = status !== ApplicationStatus.UNKNOWN ? 100 : null;
  const statusExplanation =
    status !== ApplicationStatus.UNKNOWN ? 'User set initial status.' : null;
  const companyConfidence = companyName ? 100 : null;
  const companySource = companyName ? 'user' : null;
  const companyExplanation = companyName ? 'Manual entry.' : null;
  const roleConfidence = jobTitle ? 100 : null;
  const roleSource = jobTitle ? 'user' : null;
  const roleExplanation = jobTitle ? 'Manual entry.' : null;
  const applicationKey = buildApplicationKey({
    company: companyName,
    role: jobTitle
  })?.key || null;
  db.prepare(
    `INSERT INTO job_applications
     (id, user_id, company, role, status, status_source, company_name, job_title, job_location, source,
      applied_at, current_status, status_confidence, status_explanation, status_updated_at,
      company_confidence, company_source, company_explanation, role_confidence, role_source, role_explanation,
      last_activity_at, archived, user_override, application_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    req.user.id,
    companyName,
    jobTitle,
    status,
    'user',
    companyName,
    jobTitle,
    jobLocation,
    source,
    appliedAt,
    status,
    statusConfidence,
    statusExplanation,
    timestamp,
    companyConfidence,
    companySource,
    companyExplanation,
    roleConfidence,
    roleSource,
    roleExplanation,
    timestamp,
    0,
    1,
    applicationKey,
    timestamp,
    timestamp
  );

  createUserAction(db, {
    userId: req.user.id,
    applicationId: id,
    actionType: 'CREATE_APPLICATION',
    payload: { company_name: companyName, job_title: jobTitle, status }
  });

  const application = db.prepare('SELECT * FROM job_applications WHERE id = ?').get(id);
  return res.json({ application });
});

app.patch('/api/applications/:id', requireAuth, async (req, res) => {
  try {
    const application = await db
      .prepare('SELECT * FROM job_applications WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!application) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    const updates = { updated_at: nowIso() };
    const payload = {};
    let statusOverride = null;
    const metadataChanges = {};
    let archiveChange = null;
    const changedForHints = {};

    if (req.body.company_name || req.body.company) {
      const nextCompany = String(req.body.company_name || req.body.company).trim();
      const prevCompany = String(application.company_name || application.company || '').trim();
      if (nextCompany && nextCompany !== prevCompany) {
        updates.company_name = nextCompany;
        updates.company = nextCompany;
        updates.company_confidence = 100;
        updates.company_source = 'user';
        updates.company_explanation = 'Manual edit.';
        payload.company_name = nextCompany;
        metadataChanges.company_name = {
          previous_value: prevCompany || null,
          new_value: nextCompany
        };
        changedForHints.company_override = nextCompany;
      }
    }

    if (req.body.job_title || req.body.role) {
      const nextRole = String(req.body.job_title || req.body.role).trim();
      const prevRole = String(application.job_title || application.role || '').trim();
      if (nextRole && nextRole !== prevRole) {
        updates.job_title = nextRole;
        updates.role = nextRole;
        updates.role_confidence = 100;
        updates.role_source = 'user';
        updates.role_explanation = 'Manual edit.';
        payload.job_title = nextRole;
        metadataChanges.job_title = {
          previous_value: prevRole || null,
          new_value: nextRole
        };
        changedForHints.role_override = nextRole;
      }
    }

    if (updates.company_name || updates.job_title) {
      const nextCompany = updates.company_name || application.company_name || application.company || null;
      const nextRole = updates.job_title || application.job_title || application.role || null;
      updates.application_key =
        buildApplicationKey({
          company: nextCompany,
          role: nextRole
        })?.key || null;
    }

    if (req.body.job_location) {
      const nextLocation = String(req.body.job_location).trim();
      const prevLocation = String(application.job_location || '').trim();
      if (nextLocation !== prevLocation) {
        updates.job_location = nextLocation;
        payload.job_location = nextLocation;
        metadataChanges.job_location = {
          previous_value: prevLocation || null,
          new_value: nextLocation
        };
      }
    }

    if (req.body.source) {
      const nextSource = String(req.body.source).trim();
      const prevSource = String(application.source || '').trim();
      if (nextSource !== prevSource) {
        updates.source = nextSource;
        payload.source = nextSource;
        metadataChanges.source = {
          previous_value: prevSource || null,
          new_value: nextSource
        };
      }
    }

    if (req.body.current_status || req.body.status) {
      const nextStatus = String(req.body.current_status || req.body.status).trim().toLowerCase();
      if (!VALID_STATUSES.has(nextStatus)) {
        return res.status(400).json({ error: 'INVALID_STATUS' });
      }
      const prevStatus = String(application.current_status || application.status || '').trim().toLowerCase();
      if (nextStatus !== prevStatus) {
        statusOverride = {
          nextStatus,
          explanation: req.body.status_explanation
        };
        payload.current_status = nextStatus;
        changedForHints.status_override = nextStatus;
      }
    }

    if (typeof req.body.archived === 'boolean') {
      updates.archived = Boolean(req.body.archived);
      payload.archived = updates.archived;
      archiveChange = {
        previous_value: Boolean(application.archived),
        new_value: updates.archived
      };
    }

    if (Object.keys(metadataChanges).length) {
      updates.user_override = true;
    }

    const keys = Object.keys(updates);
    const setClause = keys.map((key) => `${key} = ?`).join(', ');
    const toPatchBindValue = (value) => {
      if (value === undefined || value === null) {
        return null;
      }
      if (typeof value === 'boolean') {
        return boolBind(db, value);
      }
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === 'object') {
        try {
          return JSON.stringify(value);
        } catch (_) {
          return String(value);
        }
      }
      return value;
    };
    const values = keys.map((key) => toPatchBindValue(updates[key]));
    values.push(application.id);
    if (keys.length) {
      await db.prepare(`UPDATE job_applications SET ${setClause} WHERE id = ?`).run(...values);
    }

    if (Object.keys(metadataChanges).length) {
      createUserAction(db, {
        userId: req.user.id,
        applicationId: application.id,
        actionType: 'EDIT_METADATA',
        payload: metadataChanges
      });
    }

    let updated = await db.prepare('SELECT * FROM job_applications WHERE id = ?').get(application.id);
    if (statusOverride) {
      updated = await applyStatusOverride(db, {
        userId: req.user.id,
        application: updated,
        nextStatus: statusOverride.nextStatus,
        explanation: statusOverride.explanation
      });
    }

    let hintLearning = null;
    if (
      changedForHints.company_override !== undefined ||
      changedForHints.role_override !== undefined ||
      changedForHints.status_override !== undefined
    ) {
      const context = await resolveHintSourceContext({
        userId: req.user.id,
        applicationId: application.id,
        lastInboundMessageId: req.body.last_inbound_message_id || null,
        lastEventId: req.body.last_event_id || null
      });

      if (context?.providerId) {
        const fingerprint = buildHintFingerprintFromEmail({
          providerId: context.providerId,
          fromDomain: context.fromDomain,
          subject: context.subject,
          text: context.text
        });
        const hint = await upsertUserHint(db, req.user.id, fingerprint, {
          company_override: changedForHints.company_override,
          role_override: changedForHints.role_override,
          status_override: normalizeHintStatus(changedForHints.status_override)
        });
        if (hint) {
          hintLearning = {
            learned: true,
            hint_id: hint.id,
            source_type: context.sourceType,
            source_id: context.sourceId
          };
        }
      }
    }

    if (archiveChange) {
      createUserAction(db, {
        userId: req.user.id,
        applicationId: application.id,
        actionType: updates.archived ? 'ARCHIVE' : 'UNARCHIVE',
        payload: archiveChange
      });
    }

    if (
      Object.keys(payload).length &&
      !Object.keys(metadataChanges).length &&
      !statusOverride &&
      typeof req.body.archived !== 'boolean'
    ) {
      createUserAction(db, {
        userId: req.user.id,
        applicationId: application.id,
        actionType: 'UPDATE_APPLICATION',
        payload
      });
    }

    return res.json({ application: updated, hint_learning: hintLearning });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return respondDbUnavailable(res, err, 'applications.patch');
    }
    logError('applications.patch.failed', {
      userId: req.user?.id || null,
      applicationId: req.params?.id || null,
      code: err?.code || null,
      detail: err?.message ? String(err.message).slice(0, 220) : String(err)
    });
    return res.status(500).json({ error: 'UPDATE_APPLICATION_FAILED' });
  }
});

app.post('/api/applications/bulk-archive', requireAuth, async (req, res) => {
  const parsed = parseBulkApplicationIds(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }

  const ids = parsed.ids;
  const placeholders = sqlInPlaceholders(ids.length);
  const archivedTrue = db && db.isAsync ? true : 1;

  try {
    const existingRes = db
      .prepare(`SELECT id, archived FROM job_applications WHERE user_id = ? AND id IN (${placeholders})`)
      .all(req.user.id, ...ids);
    const existing =
      existingRes && typeof existingRes.then === 'function' ? await existingRes : existingRes || [];

    if (!existing.length) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    const archiveIds = existing.filter((row) => !Boolean(row.archived)).map((row) => row.id);
    if (!archiveIds.length) {
      return res.json({
        ok: true,
        requestedCount: ids.length,
        matchedCount: existing.length,
        archivedCount: 0
      });
    }

    const archivePlaceholders = sqlInPlaceholders(archiveIds.length);
    const timestamp = nowIso();
    const updateRes = db
      .prepare(
        `UPDATE job_applications
         SET archived = ?, updated_at = ?
         WHERE user_id = ? AND id IN (${archivePlaceholders})`
      )
      .run(archivedTrue, timestamp, req.user.id, ...archiveIds);
    if (updateRes && typeof updateRes.then === 'function') {
      await updateRes;
    }

    for (const applicationId of archiveIds) {
      createUserAction(db, {
        userId: req.user.id,
        applicationId,
        actionType: 'ARCHIVE',
        payload: { previous_value: false, new_value: true }
      });
    }

    return res.json({
      ok: true,
      requestedCount: ids.length,
      matchedCount: existing.length,
      archivedCount: archiveIds.length
    });
  } catch (err) {
    logError('bulk archive failed', {
      userId: req.user?.id || null,
      requestedCount: ids.length,
      code: err?.code || null,
      detail: err?.detail || null,
      message: err?.message || String(err)
    });
    return res.status(500).json({
      ok: false,
      error: err?.code || 'BULK_ARCHIVE_FAILED'
    });
  }
});

app.post('/api/applications/bulk-delete', requireAuth, async (req, res) => {
  const parsed = parseBulkApplicationIds(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }

  const ids = parsed.ids;
  const placeholders = sqlInPlaceholders(ids.length);

  try {
    const existingRes = db
      .prepare(`SELECT id FROM job_applications WHERE user_id = ? AND id IN (${placeholders})`)
      .all(req.user.id, ...ids);
    const existing =
      existingRes && typeof existingRes.then === 'function' ? await existingRes : existingRes || [];

    if (!existing.length) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    const deleteIds = existing.map((row) => row.id);
    const deletePlaceholders = sqlInPlaceholders(deleteIds.length);

    if (db.isAsync) {
      await db.transaction(async (tx) => {
        await tx
          .prepare(`DELETE FROM email_events WHERE user_id = ? AND application_id IN (${deletePlaceholders})`)
          .run(req.user.id, ...deleteIds);
        await tx
          .prepare(`DELETE FROM user_actions WHERE user_id = ? AND application_id IN (${deletePlaceholders})`)
          .run(req.user.id, ...deleteIds);
        await tx
          .prepare(`DELETE FROM job_applications WHERE user_id = ? AND id IN (${deletePlaceholders})`)
          .run(req.user.id, ...deleteIds);
      });
    } else {
      const deleteBulk = db.transaction((userId, targetIds) => {
        const ph = sqlInPlaceholders(targetIds.length);
        db.prepare(`DELETE FROM email_events WHERE user_id = ? AND application_id IN (${ph})`).run(
          userId,
          ...targetIds
        );
        db.prepare(`DELETE FROM user_actions WHERE user_id = ? AND application_id IN (${ph})`).run(
          userId,
          ...targetIds
        );
        db.prepare(`DELETE FROM job_applications WHERE user_id = ? AND id IN (${ph})`).run(
          userId,
          ...targetIds
        );
      });
      deleteBulk(req.user.id, deleteIds);
    }

    return res.json({
      ok: true,
      requestedCount: ids.length,
      matchedCount: existing.length,
      deletedCount: deleteIds.length
    });
  } catch (err) {
    logError('bulk delete failed', {
      userId: req.user?.id || null,
      requestedCount: ids.length,
      code: err?.code || null,
      detail: err?.detail || null,
      message: err?.message || String(err)
    });
    return res.status(500).json({
      ok: false,
      error: err?.code || 'BULK_DELETE_FAILED'
    });
  }
});

app.post('/api/applications/:id/merge', requireAuth, (req, res) => {
  const targetId = req.body.targetId;
  if (!targetId) {
    return res.status(400).json({ error: 'TARGET_REQUIRED' });
  }

  const result = mergeApplications(db, {
    userId: req.user.id,
    sourceId: req.params.id,
    targetId
  });

  if (result.status === 'invalid') {
    return res.status(400).json({ error: result.error || 'INVALID_MERGE' });
  }
  if (result.status === 'not_found') {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

  runStatusInferenceForApplication(db, req.user.id, targetId);
  return res.json({ result });
});

app.post('/api/applications/:id/suggestion/accept', requireAuth, (req, res) => {
  const application = db
    .prepare('SELECT * FROM job_applications WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!application) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }
  if (!application.suggested_status) {
    return res.status(400).json({ error: 'NO_SUGGESTION' });
  }

  const updates = {
    current_status: application.suggested_status,
    status: application.suggested_status,
    status_confidence: 100,
    status_explanation: `${application.suggested_explanation || 'Suggestion accepted.'} User confirmed.`,
    status_updated_at: nowIso(),
    status_source: 'user',
    suggested_status: null,
    suggested_confidence: null,
    suggested_explanation: null,
    user_override: 1,
    updated_at: nowIso()
  };

  const keys = Object.keys(updates);
  const setClause = keys.map((key) => `${key} = ?`).join(', ');
  const values = keys.map((key) => updates[key]);
  values.push(application.id);
  db.prepare(`UPDATE job_applications SET ${setClause} WHERE id = ?`).run(...values);

  createUserAction(db, {
    userId: req.user.id,
    applicationId: application.id,
    actionType: 'ACCEPT_SUGGESTION',
    payload: { status: updates.current_status }
  });

  const updated = db.prepare('SELECT * FROM job_applications WHERE id = ?').get(application.id);
  return res.json({ application: updated });
});

app.post('/api/applications/:id/suggestion/dismiss', requireAuth, (req, res) => {
  const application = db
    .prepare('SELECT * FROM job_applications WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!application) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }
  if (!application.suggested_status) {
    return res.status(400).json({ error: 'NO_SUGGESTION' });
  }

  db.prepare(
    'UPDATE job_applications SET suggested_status = NULL, suggested_confidence = NULL, suggested_explanation = NULL, updated_at = ? WHERE id = ?'
  ).run(nowIso(), application.id);

  createUserAction(db, {
    userId: req.user.id,
    applicationId: application.id,
    actionType: 'DISMISS_SUGGESTION',
    payload: null
  });

  const updated = db.prepare('SELECT * FROM job_applications WHERE id = ?').get(application.id);
  return res.json({ application: updated });
});

app.delete('/api/applications/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  const existingRes = db
    .prepare('SELECT id FROM job_applications WHERE id = ? AND user_id = ?')
    .get(id, req.user.id);
  const existing = existingRes && typeof existingRes.then === 'function' ? await existingRes : existingRes;
  if (!existing) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }
  try {
    if (db.isAsync) {
      await db.transaction(async (tx) => {
        await tx
          .prepare('DELETE FROM email_events WHERE application_id = ? AND user_id = ?')
          .run(id, req.user.id);
        await tx
          .prepare('DELETE FROM user_actions WHERE application_id = ? AND user_id = ?')
          .run(id, req.user.id);
        await tx
          .prepare('DELETE FROM job_applications WHERE id = ? AND user_id = ?')
          .run(id, req.user.id);
      });
    } else {
      const deleteApplication = db.transaction((applicationId, userId) => {
        db.prepare('DELETE FROM email_events WHERE application_id = ? AND user_id = ?').run(
          applicationId,
          userId
        );
        db.prepare('DELETE FROM user_actions WHERE application_id = ? AND user_id = ?').run(
          applicationId,
          userId
        );
        db.prepare('DELETE FROM job_applications WHERE id = ? AND user_id = ?').run(
          applicationId,
          userId
        );
      });
      deleteApplication(id, req.user.id);
    }
    return res.json({ ok: true, deletedApplicationId: id });
  } catch (err) {
    logError('application delete failed', {
      userId: req.user?.id || null,
      applicationId: id,
      code: err?.code || null,
      detail: err?.detail || null,
      message: err?.message || String(err)
    });
    return res.status(500).json({
      ok: false,
      error: err?.code || 'DELETE_FAILED'
    });
  }
});

app.get('/api/email/events', requireAuth, (req, res) => {
  if (!hasDevAccess(req)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  const events = db
    .prepare(
      `SELECT provider_message_id, sender, subject, internal_date, snippet,
              detected_type, confidence_score, classification_confidence, identity_confidence,
              identity_company_name, identity_job_title, identity_company_confidence,
              role_title, role_confidence, role_source, role_explanation,
              reason_code, reason_detail, ingest_decision, explanation, created_at
       FROM email_events
       WHERE user_id = ?
       ORDER BY internal_date DESC
       LIMIT 50`
    )
    .all(req.user.id);
  return res.json({ events });
});

function parseSenderFields(sender) {
  if (!sender) {
    return { senderName: null, senderEmail: null };
  }
  const match = String(sender).match(/^(.*)<([^>]+)>/);
  if (match) {
    return {
      senderName: match[1].replace(/"/g, '').trim() || null,
      senderEmail: match[2].trim() || null
    };
  }
  const emailMatch = String(sender).match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
  if (emailMatch) {
    return { senderName: null, senderEmail: emailMatch[1] };
  }
  return { senderName: sender.trim() || null, senderEmail: null };
}

app.get('/api/email/skipped-sample', requireAuth, (req, res) => {
  if (!hasDevAccess(req)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  const limit = clampNumber(Number(req.query.limit) || 50, 1, 200);
  const days = clampNumber(Number(req.query.days) || 30, 1, 365);
  let reason = req.query.reason ? String(req.query.reason) : null;
  if (reason === 'not_job_related') {
    reason = 'classified_not_job_related';
  }
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .prepare(
      `SELECT provider_message_id, sender, subject, reason_code, created_at
       FROM email_skip_samples
       WHERE user_id = ?
         AND created_at >= ?
         ${reason ? 'AND reason_code = ?' : ''}
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(req.user.id, ...(reason ? [since, reason, limit] : [since, limit]));
  const samples = rows.map((row) => {
    const senderFields = parseSenderFields(row.sender || '');
    return {
      id: hashSampleId(row.provider_message_id),
      date: row.created_at,
      from: row.sender || null,
      senderName: senderFields.senderName,
      senderEmail: senderFields.senderEmail,
      subject: row.subject || null,
      decision: 'skipped',
      reason: row.reason_code
    };
  });
  return res.json({ samples });
});

app.get('/api/email/sync-debug', requireAuth, (req, res) => {
  if (!hasDevAccess(req)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  const limit = clampNumber(Number(req.query.limit) || 20, 1, 100);
  const reason = req.query.reason ? String(req.query.reason) : null;
  const samples = {};

  function addSample(reasonCode, sample) {
    if (!samples[reasonCode]) {
      samples[reasonCode] = [];
    }
    samples[reasonCode].push(sample);
  }

  const skipReasons = new Set(['classified_not_job_related', 'denylisted']);
  const eventReasons = new Set([
    'missing_identity',
    'low_confidence',
    'not_confident_for_create',
    'ambiguous_sender'
  ]);

  if (!reason || skipReasons.has(reason)) {
    const rows = db
      .prepare(
        `SELECT provider_message_id, sender, subject, reason_code, created_at
         FROM email_skip_samples
         WHERE user_id = ?
           ${reason ? 'AND reason_code = ?' : ''}
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(req.user.id, ...(reason ? [reason] : []), limit);
    for (const row of rows) {
      addSample(row.reason_code, {
        id: hashSampleId(row.provider_message_id),
        sender: row.sender || null,
        subject: row.subject || null,
        created_at: row.created_at
      });
    }
  }

  if (!reason || eventReasons.has(reason)) {
    const rows = db
      .prepare(
        `SELECT id, provider_message_id, sender, subject, reason_code, reason_detail, created_at
         FROM email_events
         WHERE user_id = ?
           AND application_id IS NULL
           AND reason_code IS NOT NULL
           ${reason ? 'AND reason_code = ?' : ''}
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(req.user.id, ...(reason ? [reason] : []), limit);
    for (const row of rows) {
      addSample(row.reason_code, {
        id: hashSampleId(row.provider_message_id || row.id),
        sender: row.sender || null,
        subject: row.subject || null,
        detail: row.reason_detail || null,
        created_at: row.created_at
      });
    }
  }

  return res.json({ samples });
});

if (!isProd()) {
  app.get(['/app', '/app/*', '/privacy', '/terms', '/contact', '/about'], (req, res) => {
    return res.sendFile(path.join(__dirname, '..', '..', 'public', 'app', 'index.html'));
  });
}

let server = null;

function startServer(port = PORT, options = {}) {
  const shouldLog = options.log !== false;
  const host = options.host || process.env.HOST || '0.0.0.0';
  return (async () => {
    const shouldRunPgMigrations =
      Boolean(getRuntimeDatabaseUrl()) && db && db.isAsync && process.env.NODE_ENV !== 'test';
    if (shouldRunPgMigrations) {
      await pgMigrate(db, { log: shouldLog });
      await assertPgSchema(db);
    }
    await cleanupExpiredSessions();

    return new Promise((resolve, reject) => {
      server = app
        .listen(port, host, () => {
          if (shouldLog) {
            const address = server.address();
            const actualPort =
              address && typeof address === 'object' && address.port ? address.port : port;
            console.log(`Applictus running on http://${host}:${actualPort}`);
          }
          resolve(server);
        })
        .on('error', (err) => {
          reject(err);
        });
    });
  })();
}

function stopServer() {
  if (!server) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    server.close((err) => {
      server = null;
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

module.exports = {
  app,
  db,
  startServer,
  stopServer,
  sessionCookieOptions
};
