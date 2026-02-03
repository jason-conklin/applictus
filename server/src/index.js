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
  getOAuthClient,
  getAuthUrl,
  upsertTokens,
  getStoredTokens,
  fetchConnectedEmail,
  isEncryptionReady
} = require('./email');
const { getGoogleOAuthClient, getGoogleAuthUrl, getGoogleProfileFromCode } = require('./googleAuth');
const { syncGmailMessages, getSyncProgress } = require('./ingest');
const { logError } = require('./logger');
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

// Stack choice: Express + SQLite keeps the backend lightweight and easy to ship locally.
const app = express();
const db = openDb();
app.locals.db = db;

migrate(db);
cleanupExpiredSessions();

if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  res.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'"
  );
  return next();
});
app.use('/public', express.static(path.join(__dirname, '..', '..', 'public')));
app.use(express.static(path.join(__dirname, '..', '..', 'web')));

const PORT = process.env.PORT || 3000;
const SESSION_COOKIE = 'jt_session';
const CSRF_COOKIE = 'jt_csrf';
const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const PASSWORD_MIN_LENGTH = 12;
const GOOGLE_STATE_COOKIE = 'jt_google_state';
const GOOGLE_STATE_TTL_MS = 10 * 60 * 1000;
const VALID_STATUSES = new Set(Object.values(ApplicationStatus));
const CSRF_HEADER = 'x-csrf-token';
const CSRF_TTL_MS = 2 * 60 * 60 * 1000;
const preauthCsrfStore = new Map();

function nowIso() {
  return new Date().toISOString();
}

function isProd() {
  return process.env.NODE_ENV === 'production';
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function getUserByEmail(email) {
  const res = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  return res && typeof res.then === 'function' ? await res : res;
}

async function getUserById(id) {
  const res = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return res && typeof res.then === 'function' ? await res : res;
}

async function createUser({ email, name, passwordHash, authProvider }) {
  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const provider = authProvider || 'password';
  const runRes = db.prepare(
    `INSERT INTO users (id, email, name, password_hash, auth_provider, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, email, name || null, passwordHash || null, provider, createdAt, createdAt);
  if (runRes && typeof runRes.then === 'function') {
    await runRes;
  }
  return getUserById(id);
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
  const res = db.prepare(`UPDATE users SET ${setClause} WHERE id = ?`).run(...values);
  if (res && typeof res.then === 'function') {
    await res;
  }
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
  const res = db.prepare(
    'INSERT INTO sessions (id, user_id, created_at, expires_at, csrf_token) VALUES (?, ?, ?, ?, ?)'
  ).run(token, userId, createdAt, expiresAt, csrfToken);
  if (res && typeof res.then === 'function') {
    await res;
  }
  if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
    // eslint-disable-next-line no-console
    console.debug('[auth] created session for user', userId);
  }
  return { token, expiresAt, csrfToken };
}

function sessionCookieOptions({ isProd: isProdOverride } = {}) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProdOverride ?? isProd(),
    maxAge: SESSION_TTL_MS
  };
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd()
  });
}

async function getSession(token) {
  const res = db.prepare('SELECT * FROM sessions WHERE id = ?').get(token);
  return res && typeof res.then === 'function' ? await res : res;
}

async function deleteSession(token) {
  const res = db.prepare('DELETE FROM sessions WHERE id = ?').run(token);
  if (res && typeof res.then === 'function') {
    await res;
  }
}

async function cleanupExpiredSessions() {
  const now = nowIso();
  const res = db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  if (res && typeof res.then === 'function') {
    await res;
  }
}

function setCsrfCookie(res, csrfId) {
  res.cookie(CSRF_COOKIE, csrfId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd(),
    maxAge: CSRF_TTL_MS
  });
}

function clearCsrfCookie(res) {
  res.clearCookie(CSRF_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd()
  });
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

function issueCsrfToken(req, res) {
  if (req.session && req.session.id) {
    if (!req.session.csrf_token) {
      const csrfToken = crypto.randomBytes(32).toString('hex');
      db.prepare('UPDATE sessions SET csrf_token = ? WHERE id = ?').run(csrfToken, req.session.id);
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
    const values = keys.map((key) => updates[key]);
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

function buildApplicationFilters({ userId, archived, status, company, role, recencyDays, minConfidence, suggestionsOnly }) {
  const clauses = ['user_id = ?'];
  const params = [userId];

  if (typeof archived === 'boolean') {
    clauses.push('archived = ?');
    params.push(archived ? 1 : 0);
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
  keyGenerator: (req) => (req.ip ? `ip:${req.ip}` : null)
});
const authEmailLimiter = createRateLimiter({
  keyGenerator: (req) => {
    const email = normalizeEmail(req.body?.email);
    return email && req.ip ? `ip:${req.ip}|email:${email}` : null;
  }
});

app.use(async (req, res, next) => {
  const token = req.cookies[SESSION_COOKIE];
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
  return next();
});

app.use(enforceCsrf);

app.get('/api/auth/csrf', (req, res) => {
  const csrfToken = issueCsrfToken(req, res);
  return res.json({ csrfToken });
});

app.use('/api/resume-curator', resumeCuratorRouter);

app.get('/api/auth/session', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'NO_SESSION' });
  }
  return res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      auth_provider: req.user.auth_provider || 'password'
    }
  });
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
      user: { id: user.id, email: user.email, name: user.name, auth_provider: user.auth_provider }
    });
  } catch (err) {
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

  try {
    let user = await getUserByEmail(email);
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
      await updateUser(user.id, updates);
      user = await getUserById(user.id);
    } else {
      user = await createUser({ email, name, passwordHash, authProvider: 'password' });
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
      user: { id: user.id, email: user.email, name: user.name, auth_provider: user.auth_provider }
    });
  } catch (err) {
    if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
      // eslint-disable-next-line no-console
      console.error('signup failed', err);
    }
    return res.status(500).json({ error: err.code || 'SIGNUP_FAILED' });
  }
});

app.get('/api/auth/google/start', authIpLimiter, (req, res) => {
  const oAuthClient = getGoogleOAuthClient();
  if (!oAuthClient) {
    return res.status(400).json({ error: 'GOOGLE_NOT_CONFIGURED' });
  }
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd(),
    maxAge: GOOGLE_STATE_TTL_MS
  });
  const url = getGoogleAuthUrl(oAuthClient, state);
  return res.redirect(url);
});

app.get('/api/auth/google/callback', authIpLimiter, async (req, res) => {
  const oAuthClient = getGoogleOAuthClient();
  if (!oAuthClient) {
    return res.status(400).send('Google OAuth not configured.');
  }

  const state = String(req.query.state || '');
  const storedState = req.cookies[GOOGLE_STATE_COOKIE];
  if (!state || !storedState || state !== storedState) {
    res.clearCookie(GOOGLE_STATE_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd()
    });
    return res.status(400).send('Invalid OAuth state.');
  }
  res.clearCookie(GOOGLE_STATE_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd()
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
      return res.status(400).send('Missing OAuth code.');
    }
    try {
      profile = await getGoogleProfileFromCode(oAuthClient, code);
    } catch (err) {
      return res.status(500).send('Failed to verify Google sign-in.');
    }
  }

  if (!profile?.email || !profile.emailVerified) {
    return res.status(401).send('Google account email not verified.');
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
    return res.redirect('/#account?error=OAUTH_USER_CREATE_FAILED');
  }

  const existingToken = req.cookies[SESSION_COOKIE];
  if (existingToken) {
    await deleteSession(existingToken);
  }

  const session = await createSession(user.id);
  setSessionCookie(res, session.token);
  clearCsrfCookie(res);
  return res.redirect('/#dashboard');
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  const token = req.cookies[SESSION_COOKIE];
  if (token) {
    await deleteSession(token);
    clearSessionCookie(res);
  }
  return res.json({ ok: true });
});

app.get('/api/email/status', requireAuth, (req, res) => {
  const configured = Boolean(getOAuthClient());
  const encryptionReady = isEncryptionReady();
  let tokens = null;
  if (encryptionReady) {
    try {
      tokens = getStoredTokens(db, req.user.id);
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
  return res.json({
    configured,
    encryptionReady,
    connected: Boolean(tokens),
    email: tokens?.connected_email || null
  });
});

app.post('/api/email/connect', requireAuth, (req, res) => {
  const oAuthClient = getOAuthClient();
  if (!oAuthClient) {
    return res.status(400).json({ error: 'GMAIL_NOT_CONFIGURED' });
  }
  if (!isEncryptionReady()) {
    return res.status(400).json({ error: 'TOKEN_ENC_KEY_REQUIRED' });
  }
  const url = getAuthUrl(oAuthClient);
  return res.json({ url });
});

app.get('/api/email/callback', requireAuth, async (req, res) => {
  const oAuthClient = getOAuthClient();
  if (!oAuthClient) {
    return res.status(400).send('Gmail OAuth not configured.');
  }
  if (!isEncryptionReady()) {
    return res.status(400).send('Missing token encryption key.');
  }
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('Missing OAuth code.');
  }
  try {
    const { tokens } = await oAuthClient.getToken(code);
    oAuthClient.setCredentials(tokens);
    let connectedEmail = null;
    try {
      connectedEmail = await fetchConnectedEmail(oAuthClient);
    } catch (err) {
      connectedEmail = null;
    }
    upsertTokens(db, req.user.id, tokens, connectedEmail);
    return res.redirect('/#gmail');
  } catch (err) {
    return res.status(500).send('Failed to connect Gmail.');
  }
});

app.post('/api/email/sync', requireAuth, async (req, res) => {
  const days = Number(req.body.days) || 30;
  const maxResults = Number(req.body.maxResults) || 500;
  const syncId = req.body.sync_id || crypto.randomUUID();
  if (!isEncryptionReady()) {
    return res.status(400).json({ error: 'TOKEN_ENC_KEY_REQUIRED' });
  }
  try {
    migrate(db);
    const result = await syncGmailMessages({
      db,
      userId: req.user.id,
      days,
      maxResults,
      syncId
    });
    return res.json({ ...result, sync_id: syncId });
  } catch (err) {
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
    return res.status(404).json({ error: 'NOT_FOUND' });
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
  const companyConfidence = companyName ? 1 : null;
  const companySource = companyName ? 'manual' : null;
  const companyExplanation = companyName ? 'Manual entry.' : null;
  const roleConfidence = jobTitle ? 1 : null;
  const roleSource = jobTitle ? 'manual' : null;
  const roleExplanation = jobTitle ? 'Manual entry.' : null;

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO job_applications
     (id, user_id, company, role, status, status_source, company_name, job_title, job_location, source,
      external_req_id, applied_at, current_status, status_confidence, status_explanation, status_updated_at,
      company_confidence, company_source, company_explanation, role_confidence, role_source, role_explanation,
      last_activity_at, archived, user_override, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    initialStatus.statusConfidence,
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

app.get('/api/applications', requireAuth, (req, res) => {
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

  const total = db
    .prepare(`SELECT COUNT(*) as count FROM job_applications WHERE ${whereClause}`)
    .get(...params).count;

  const applications = db
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

  return res.json({
    applications,
    total,
    limit: listQuery.limit,
    offset: listQuery.offset
  });
});

app.get('/api/applications/archived', requireAuth, (req, res) => {
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

  const total = db
    .prepare(`SELECT COUNT(*) as count FROM job_applications WHERE ${whereClause}`)
    .get(...params).count;

  const applications = db
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

  return res.json({
    applications,
    total,
    limit: listQuery.limit,
    offset: listQuery.offset
  });
});

app.get('/api/applications/pipeline', requireAuth, (req, res) => {
  const listQuery = parseListQuery(req.query);
  const perStatusLimit = clampNumber(Number(req.query.per_status_limit) || 20, 1, 50);
  const statuses = listQuery.status ? [listQuery.status] : Object.values(ApplicationStatus);

  const columns = statuses.map((status) => {
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

    const count = db
      .prepare(`SELECT COUNT(*) as count FROM job_applications WHERE ${whereClause}`)
      .get(...params).count;

    const applications = db
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

    return {
      status,
      count,
      applications
    };
  });

  return res.json({ columns });
});

app.get('/api/applications/:id', requireAuth, (req, res) => {
  const application = db
    .prepare('SELECT * FROM job_applications WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!application) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }
  const limit = clampNumber(Number(req.query.limit) || 50, 1, 200);
  const events = db
    .prepare(
      `SELECT id, sender, subject, internal_date, snippet,
              detected_type, confidence_score, classification_confidence, ingest_decision, explanation, created_at
       FROM email_events
       WHERE application_id = ?
       ORDER BY internal_date DESC
       LIMIT ?`
    )
    .all(application.id, limit);

  return res.json({ application, events });
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
  const statusConfidence = status !== ApplicationStatus.UNKNOWN ? 1.0 : null;
  const statusExplanation =
    status !== ApplicationStatus.UNKNOWN ? 'User set initial status.' : null;
  const companyConfidence = companyName ? 1 : null;
  const companySource = companyName ? 'manual' : null;
  const companyExplanation = companyName ? 'Manual entry.' : null;
  const roleConfidence = jobTitle ? 1 : null;
  const roleSource = jobTitle ? 'manual' : null;
  const roleExplanation = jobTitle ? 'Manual entry.' : null;
  db.prepare(
    `INSERT INTO job_applications
     (id, user_id, company, role, status, status_source, company_name, job_title, job_location, source,
      applied_at, current_status, status_confidence, status_explanation, status_updated_at,
      company_confidence, company_source, company_explanation, role_confidence, role_source, role_explanation,
      last_activity_at, archived, user_override, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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

app.patch('/api/applications/:id', requireAuth, (req, res) => {
  const application = db
    .prepare('SELECT * FROM job_applications WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!application) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

  const updates = { updated_at: nowIso() };
  const payload = {};
  let statusOverride = null;
  let metadataChanges = {};
  let archiveChange = null;

  if (req.body.company_name || req.body.company) {
    updates.company_name = String(req.body.company_name || req.body.company).trim();
    updates.company = updates.company_name;
    updates.company_confidence = 1;
    updates.company_source = 'manual';
    updates.company_explanation = 'Manual edit.';
    payload.company_name = updates.company_name;
    metadataChanges.company_name = {
      previous_value: application.company_name || null,
      new_value: updates.company_name
    };
  }
  if (req.body.job_title || req.body.role) {
    updates.job_title = String(req.body.job_title || req.body.role).trim();
    updates.role = updates.job_title;
    updates.role_confidence = 1;
    updates.role_source = 'manual';
    updates.role_explanation = 'Manual edit.';
    payload.job_title = updates.job_title;
    metadataChanges.job_title = {
      previous_value: application.job_title || null,
      new_value: updates.job_title
    };
  }
  if (req.body.job_location) {
    updates.job_location = String(req.body.job_location).trim();
    payload.job_location = updates.job_location;
    metadataChanges.job_location = {
      previous_value: application.job_location || null,
      new_value: updates.job_location
    };
  }
  if (req.body.source) {
    updates.source = String(req.body.source).trim();
    payload.source = updates.source;
    metadataChanges.source = {
      previous_value: application.source || null,
      new_value: updates.source
    };
  }
  if (req.body.current_status || req.body.status) {
    const nextStatus = req.body.current_status || req.body.status;
    if (!VALID_STATUSES.has(nextStatus)) {
      return res.status(400).json({ error: 'INVALID_STATUS' });
    }
    statusOverride = {
      nextStatus,
      explanation: req.body.status_explanation
    };
    payload.current_status = nextStatus;
  }
  if (typeof req.body.archived === 'boolean') {
    updates.archived = req.body.archived ? 1 : 0;
    payload.archived = updates.archived === 1;
    archiveChange = {
      previous_value: application.archived === 1,
      new_value: updates.archived === 1
    };
  }

  if (Object.keys(metadataChanges).length) {
    updates.user_override = 1;
  }

  const keys = Object.keys(updates);
  const setClause = keys.map((key) => `${key} = ?`).join(', ');
  const values = keys.map((key) => updates[key]);
  values.push(application.id);

  if (keys.length) {
    db.prepare(`UPDATE job_applications SET ${setClause} WHERE id = ?`).run(...values);
  }

  if (Object.keys(metadataChanges).length) {
    createUserAction(db, {
      userId: req.user.id,
      applicationId: application.id,
      actionType: 'EDIT_METADATA',
      payload: metadataChanges
    });
  }

  let updated = db.prepare('SELECT * FROM job_applications WHERE id = ?').get(application.id);
  if (statusOverride) {
    updated = applyStatusOverride(db, {
      userId: req.user.id,
      application: updated,
      nextStatus: statusOverride.nextStatus,
      explanation: statusOverride.explanation
    });
  }

  if (archiveChange) {
    createUserAction(db, {
      userId: req.user.id,
      applicationId: application.id,
      actionType: updates.archived === 1 ? 'ARCHIVE' : 'UNARCHIVE',
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

  return res.json({ application: updated });
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
    status_confidence: 1.0,
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

app.delete('/api/applications/:id', requireAuth, (req, res) => {
  const id = req.params.id;
  const existing = db
    .prepare('SELECT id FROM job_applications WHERE id = ? AND user_id = ?')
    .get(id, req.user.id);
  if (!existing) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

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

  try {
    deleteApplication(id, req.user.id);
    return res.json({ ok: true, deletedApplicationId: id });
  } catch (err) {
    return res.status(500).json({ error: 'DELETE_FAILED' });
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

app.get('*', (req, res) => {
  return res.sendFile(path.join(__dirname, '..', '..', 'web', 'index.html'));
});

let server = null;

function startServer(port = PORT, options = {}) {
  const shouldLog = options.log !== false;
  const host = options.host || process.env.HOST || '0.0.0.0';
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

if (require.main === module) {
  startServer(PORT, { log: true });
}

module.exports = {
  app,
  db,
  startServer,
  stopServer,
  sessionCookieOptions
};
