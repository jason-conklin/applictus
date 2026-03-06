const test = require('node:test');
const assert = require('node:assert/strict');

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

function buildPayload(toEmail) {
  const stamp = Date.now();
  return {
    From: 'Indeed Apply <indeedapply@indeed.com>',
    To: toEmail,
    ToFull: [{ Email: toEmail }],
    Subject: 'Indeed Application: Software Engineer',
    MessageID: `<indeed-debug-${stamp}@indeed.com>`,
    Date: new Date().toISOString(),
    TextBody: ['Application submitted', 'Software Engineer', 'EarthCam - Upper Saddle River, NJ'].join('\n')
  };
}

test('admin can read inbound diagnostics endpoint; non-admin is forbidden', async (t) => {
  const { baseUrl, db, stop } = await startServerWithEnv({
    NODE_ENV: 'test',
    JOBTRACK_DB_PATH: ':memory:',
    JOBTRACK_LOG_LEVEL: 'error',
    INBOUND_DOMAIN: 'mail.applictus.com',
    POSTMARK_INBOUND_SECRET: 'test-inbound-secret',
    ADMIN_EMAILS: 'admin@example.com'
  });
  t.after(stop);
  if (!baseUrl || !db) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }

  const adminRequest = await createClient(baseUrl);
  const adminSignup = await adminRequest('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin@example.com',
      password: 'StrongPassword123!'
    })
  });
  assert.equal(adminSignup.status, 200);

  const addressRes = await adminRequest('/api/inbound/address');
  assert.equal(addressRes.status, 200);
  const toEmail = addressRes.body.address_email;
  assert.ok(toEmail);

  const inboundRes = await postInbound(baseUrl, buildPayload(toEmail));
  assert.equal(inboundRes.status, 200);

  const syncRes = await adminRequest('/api/inbound/sync', {
    method: 'POST',
    body: JSON.stringify({})
  });
  assert.equal(syncRes.status, 200);

  const diagnosticsRes = await adminRequest('/api/inbound/recent?limit=10');
  assert.equal(diagnosticsRes.status, 200);
  assert.ok(Array.isArray(diagnosticsRes.body.messages));
  assert.ok(diagnosticsRes.body.messages.length >= 1);
  const first = diagnosticsRes.body.messages[0];
  assert.ok(first.id);
  assert.ok('processing_state' in first);
  assert.ok('derived_debug_json' in first);

  const nonAdminRequest = await createClient(baseUrl);
  const nonAdminSignup = await nonAdminRequest('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: 'nonadmin@example.com',
      password: 'StrongPassword123!'
    })
  });
  assert.equal(nonAdminSignup.status, 200);

  const forbiddenRes = await nonAdminRequest('/api/inbound/recent?limit=10');
  assert.equal(forbiddenRes.status, 403);
  assert.equal(forbiddenRes.body.error, 'FORBIDDEN');
});
