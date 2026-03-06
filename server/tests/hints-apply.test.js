const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

function requireFreshServer() {
  delete require.cache[require.resolve('../src/index')];
  return require('../src/index');
}

async function startServerWithEnv(envOverrides = {}) {
  const envBackup = { ...process.env };
  Object.assign(process.env, envOverrides);
  try {
    const { startServer, stopServer, db } = requireFreshServer();
    const server = await startServer(0, { log: false, host: '127.0.0.1' });
    const address = server.address();
    const baseUrl =
      address && typeof address === 'object' ? `http://localhost:${address.port}` : 'http://localhost';
    return {
      baseUrl,
      db,
      stop: async () => {
        await stopServer();
        Object.assign(process.env, envBackup);
      }
    };
  } catch (err) {
    Object.assign(process.env, envBackup);
    const message = String(err?.message || err);
    if (/better-sqlite3|invalid ELF header|SQLITE_NATIVE_(OPEN|LOAD)_FAILED/i.test(message)) {
      return { baseUrl: null, db: null, stop: async () => {} };
    }
    throw err;
  }
}

async function createClient(baseUrl) {
  const cookieJar = new Map();
  let csrf = '';

  const updateCookies = (res) => {
    const setCookie = res.headers.get('set-cookie');
    if (!setCookie) return;
    const value = setCookie.split(';')[0];
    const name = value.split('=')[0];
    if (name) cookieJar.set(name, value);
  };

  const cookieHeader = () => Array.from(cookieJar.values()).join('; ');

  const refreshCsrf = async () => {
    const res = await fetch(`${baseUrl}/api/auth/csrf`, {
      headers: cookieHeader() ? { Cookie: cookieHeader() } : {}
    });
    updateCookies(res);
    const body = await res.json().catch(() => ({}));
    csrf = body.csrfToken || '';
  };

  await refreshCsrf();

  return async function request(path, { method = 'GET', body, headers = {} } = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(csrf && method !== 'GET' && method !== 'HEAD' ? { 'X-CSRF-Token': csrf } : {}),
        ...(cookieHeader() ? { Cookie: cookieHeader() } : {}),
        ...headers
      },
      body
    });
    updateCookies(res);
    const payload = await res.json().catch(() => ({}));
    if (path === '/api/auth/signup' || path === '/api/auth/login') {
      await refreshCsrf();
    }
    return { status: res.status, body: payload };
  };
}

function buildProblemPayload(toEmail, stamp = Date.now()) {
  return {
    From: 'Workable <noreply@candidates.workablemail.com>',
    To: toEmail,
    ToFull: [{ Email: toEmail }],
    Subject: 'Thanks for applying to EarthCam',
    MessageID: `<workable-${stamp}@workablemail.com>`,
    Date: new Date().toISOString(),
    TextBody: [
      'EarthCam',
      'Your application for the Operations & Logistics Assistant 2023-2025 job was submitted successfully.',
      "Here's a copy of your application data",
      'Personal information'
    ].join('\n'),
    Headers: [{ Name: 'Message-ID', Value: `<workable-rfc-${stamp}@workablemail.com>` }]
  };
}

async function postInbound(baseUrl, payload) {
  const res = await fetch(`${baseUrl}/api/inbound/postmark`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-applictus-inbound-secret': 'test-inbound-secret'
    },
    body: JSON.stringify(payload)
  });
  return {
    status: res.status,
    body: await res.json().catch(() => ({}))
  };
}

test('user edit creates parse hint and next similar inbound applies override', async (t) => {
  const { baseUrl, db, stop } = await startServerWithEnv({
    NODE_ENV: 'test',
    JOBTRACK_DB_PATH: ':memory:',
    JOBTRACK_LOG_LEVEL: 'error',
    INBOUND_DOMAIN: 'mail.applictus.com',
    POSTMARK_INBOUND_SECRET: 'test-inbound-secret'
  });
  t.after(stop);
  if (!baseUrl || !db) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }

  const request = await createClient(baseUrl);
  const email = `hints-apply-${crypto.randomUUID()}@example.com`;
  const signup = await request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'StrongPassword123!' })
  });
  assert.equal(signup.status, 200);

  const addressRes = await request('/api/inbound/address');
  assert.equal(addressRes.status, 200);
  const toEmail = addressRes.body.address_email;

  const firstInbound = await postInbound(baseUrl, buildProblemPayload(toEmail, Date.now()));
  assert.equal(firstInbound.status, 200);

  const firstSync = await request('/api/inbound/sync', {
    method: 'POST',
    body: JSON.stringify({})
  });
  assert.equal(firstSync.status, 200);

  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  const app = db
    .prepare(`SELECT id FROM job_applications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(user.id);
  assert.ok(app?.id);

  const latestInbound = db
    .prepare(
      `SELECT id, derived_role
       FROM inbound_messages
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(user.id);
  assert.ok(latestInbound?.id);

  const detail = await request(`/api/applications/${app.id}`);
  assert.equal(detail.status, 200);
  const lastEventId = Array.isArray(detail.body.events) && detail.body.events.length ? detail.body.events[0].id : null;
  assert.ok(lastEventId);

  const editRes = await request(`/api/applications/${app.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      company_name: 'EarthCam',
      job_title: 'Jr. Python Developer',
      last_inbound_message_id: latestInbound.id,
      last_event_id: lastEventId
    })
  });
  assert.equal(editRes.status, 200);
  assert.equal(editRes.body.hint_learning?.learned, true);

  const storedHint = db
    .prepare(
      `SELECT role_override, provider_id, from_domain
       FROM user_parse_hints
       WHERE user_id = ?
       ORDER BY updated_at DESC
       LIMIT 1`
    )
    .get(user.id);
  assert.equal(storedHint.role_override, 'Jr. Python Developer');
  assert.equal(storedHint.provider_id, 'workable_candidates');

  const secondInbound = await postInbound(baseUrl, buildProblemPayload(toEmail, Date.now() + 1));
  assert.equal(secondInbound.status, 200);

  const secondSync = await request('/api/inbound/sync', {
    method: 'POST',
    body: JSON.stringify({})
  });
  assert.equal(secondSync.status, 200);

  const newestInbound = db
    .prepare(
      `SELECT derived_role, derived_debug_json
       FROM inbound_messages
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(user.id);
  assert.equal(newestInbound.derived_role, 'Jr. Python Developer');

  const debugJson = newestInbound.derived_debug_json ? JSON.parse(String(newestInbound.derived_debug_json)) : null;
  assert.equal(Boolean(debugJson?.hints?.applied), true);
});
