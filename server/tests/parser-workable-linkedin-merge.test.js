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
      return {
        baseUrl: null,
        db: null,
        stop: async () => {}
      };
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
    if (name) {
      cookieJar.set(name, value);
    }
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

function buildLinkedInPayload(toEmail) {
  const stamp = Date.now();
  return {
    From: 'LinkedIn Jobs <jobs-noreply@linkedin.com>',
    To: toEmail,
    ToFull: [{ Email: toEmail }],
    Subject: 'Jason, your application was sent to EarthCam',
    MessageID: `<linkedin-${stamp}@linkedin.com>`,
    Date: new Date().toISOString(),
    TextBody: ['EarthCam', 'Jr. Python Developer', 'EarthCam · Upper Saddle River, NJ (On-site)'].join('\n'),
    Headers: [{ Name: 'Message-ID', Value: `<linkedin-rfc-${stamp}@linkedin.com>` }]
  };
}

function buildWorkablePayload(toEmail) {
  const stamp = Date.now();
  return {
    From: 'Workable <noreply@candidates.workablemail.com>',
    To: toEmail,
    ToFull: [{ Email: toEmail }],
    Subject: 'Thanks for applying to EarthCam',
    MessageID: `<workable-${stamp}@workablemail.com>`,
    Date: new Date().toISOString(),
    TextBody: [
      'EarthCam',
      'Your application for the Jr. Python Developer job was submitted successfully.',
      "Here's a copy of your application data...",
      'Personal information',
      'Operations & Logistics Assistant 2023-2025'
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

test('linkedin + workable forwarded confirmations merge into a single EarthCam application', async (t) => {
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
  const email = `parser-merge-${crypto.randomUUID()}@example.com`;
  const signup = await request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'StrongPassword123!' })
  });
  assert.equal(signup.status, 200);

  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  const addressRes = await request('/api/inbound/address');
  assert.equal(addressRes.status, 200);

  const toEmail = addressRes.body.address_email;
  assert.ok(toEmail);
  assert.equal((await postInbound(baseUrl, buildLinkedInPayload(toEmail))).status, 200);
  assert.equal((await postInbound(baseUrl, buildWorkablePayload(toEmail))).status, 200);

  const syncRes = await request('/api/inbound/sync', {
    method: 'POST',
    body: JSON.stringify({})
  });
  assert.equal(syncRes.status, 200);
  assert.equal(syncRes.body.status, 'ok');

  const apps = db
    .prepare(
      `SELECT id, company_name, job_title, application_key
       FROM job_applications
       WHERE user_id = ? AND archived = 0`
    )
    .all(user.id);
  assert.equal(apps.length, 1);
  assert.equal(apps[0].company_name, 'EarthCam');
  assert.equal(apps[0].job_title, 'Jr. Python Developer');

  const inboundRows = db
    .prepare(
      `SELECT derived_company, derived_role, derived_application_id
       FROM inbound_messages
       WHERE user_id = ?
       ORDER BY created_at ASC`
    )
    .all(user.id);
  assert.equal(inboundRows.length, 2);
  for (const row of inboundRows) {
    assert.equal(row.derived_company, 'EarthCam');
    assert.equal(row.derived_role, 'Jr. Python Developer');
    assert.ok(row.derived_application_id);
  }
});
