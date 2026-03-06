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
    const { startServer, stopServer } = requireFreshServer();
    const server = await startServer(0, { log: false, host: '127.0.0.1' });
    const address = server.address();
    const baseUrl =
      address && typeof address === 'object' ? `http://localhost:${address.port}` : 'http://localhost';
    return {
      baseUrl,
      stop: async () => {
        await stopServer();
        Object.assign(process.env, envBackup);
      }
    };
  } catch (err) {
    Object.assign(process.env, envBackup);
    const message = String(err && err.message ? err.message : err);
    if (/better-sqlite3|invalid ELF header|SQLITE_NATIVE_(OPEN|LOAD)_FAILED/i.test(message)) {
      return {
        baseUrl: null,
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
    if (!setCookie) {
      return;
    }
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

  const request = async (path, { method = 'GET', body, headers = {} } = {}) => {
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

  return request;
}

function buildInboundPayload(toEmail) {
  const stamp = Date.now();
  return {
    From: 'Recruiting Team <jobs@example-company.com>',
    FromFull: { Name: 'Recruiting Team', Email: 'jobs@example-company.com' },
    To: toEmail,
    ToFull: [{ Email: toEmail }],
    Subject: 'Interview invitation for Software Engineer',
    MessageID: `<postmark-${stamp}@example-company.com>`,
    Date: new Date().toISOString(),
    TextBody: 'We would like to speak with you. Please choose a time slot.',
    HtmlBody: '<p>We would like to speak with you.</p>',
    Headers: [{ Name: 'Message-ID', Value: `<rfc-${stamp}@example-company.com>` }]
  };
}

test('inbound address APIs create, confirm, rotate, and become active after inbound email', async (t) => {
  const { baseUrl, stop } = await startServerWithEnv({
    NODE_ENV: 'test',
    JOBTRACK_DB_PATH: ':memory:',
    JOBTRACK_LOG_LEVEL: 'error',
    INBOUND_DOMAIN: 'mail.applictus.com',
    POSTMARK_INBOUND_SECRET: 'test-inbound-secret'
  });
  t.after(stop);
  if (!baseUrl) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }

  const request = await createClient(baseUrl);
  const email = `inbound-${crypto.randomUUID()}@example.com`;
  const password = 'StrongPassword123!';
  const signup = await request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  assert.equal(signup.status, 200);

  const statusBefore = await request('/api/inbound/status');
  assert.equal(statusBefore.status, 200);
  assert.equal(statusBefore.body.setup_state, 'not_started');

  const addressRes = await request('/api/inbound/address');
  assert.equal(addressRes.status, 200);
  assert.ok(addressRes.body.address_email);
  assert.equal(addressRes.body.setup_state, 'awaiting_confirmation');

  const confirmRes = await request('/api/inbound/address/confirm', { method: 'POST' });
  assert.equal(confirmRes.status, 200);
  assert.equal(confirmRes.body.setup_state, 'awaiting_first_email');
  assert.ok(confirmRes.body.confirmed_at);

  const oldAddress = confirmRes.body.address_email;
  const rotateRes = await request('/api/inbound/address/rotate', { method: 'POST' });
  assert.equal(rotateRes.status, 200);
  assert.ok(rotateRes.body.address_email);
  assert.notEqual(rotateRes.body.address_email, oldAddress);
  assert.equal(rotateRes.body.setup_state, 'awaiting_confirmation');

  const inbound = await fetch(`${baseUrl}/api/inbound/postmark`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-applictus-inbound-secret': 'test-inbound-secret'
    },
    body: JSON.stringify(buildInboundPayload(rotateRes.body.address_email))
  });
  assert.equal(inbound.status, 200);

  const statusAfter = await request('/api/inbound/status');
  assert.equal(statusAfter.status, 200);
  assert.equal(statusAfter.body.setup_state, 'active');
  assert.equal(statusAfter.body.effective_connected, true);
  assert.ok(statusAfter.body.last_received_at);
});
