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
  const { startServer, stopServer } = requireFreshServer();
  const server = await startServer(0, { log: false });
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
}

async function getCsrf(baseUrl, cookie = '') {
  const response = await fetch(`${baseUrl}/api/auth/csrf`, {
    headers: cookie ? { Cookie: cookie } : {}
  });
  const setCookie = response.headers.get('set-cookie');
  const nextCookie = setCookie ? setCookie.split(';')[0] : cookie;
  const body = await response.json().catch(() => ({}));
  return { csrfToken: body.csrfToken, cookie: nextCookie };
}

test('POST without CSRF token returns 403', async (t) => {
  const { baseUrl, stop } = await startServerWithEnv({
    NODE_ENV: 'test',
    JOBTRACK_DB_PATH: ':memory:',
    JOBTRACK_LOG_LEVEL: 'error'
  });
  t.after(stop);

  const email = `csrf-${crypto.randomUUID()}@example.com`;
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Password12345!' })
  });
  const body = await response.json().catch(() => ({}));
  assert.equal(response.status, 403);
  assert.equal(body.error, 'CSRF_REQUIRED');
});

test('POST with valid CSRF token succeeds', async (t) => {
  const { baseUrl, stop } = await startServerWithEnv({
    NODE_ENV: 'test',
    JOBTRACK_DB_PATH: ':memory:',
    JOBTRACK_LOG_LEVEL: 'error'
  });
  t.after(stop);

  const { csrfToken, cookie } = await getCsrf(baseUrl);
  const email = `csrf-ok-${crypto.randomUUID()}@example.com`;
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
      Cookie: cookie
    },
    body: JSON.stringify({ email, password: 'Password12345!' })
  });
  assert.equal(response.status, 200);
});

test('rate limiter returns 429 after threshold', async (t) => {
  const { baseUrl, stop } = await startServerWithEnv({
    NODE_ENV: 'test',
    JOBTRACK_DB_PATH: ':memory:',
    JOBTRACK_LOG_LEVEL: 'error',
    JOBTRACK_RATE_LIMIT_MAX: '3',
    JOBTRACK_RATE_LIMIT_WINDOW_MS: '600000'
  });
  t.after(stop);

  const { csrfToken, cookie } = await getCsrf(baseUrl);
  const email = `limit-${crypto.randomUUID()}@example.com`;
  let lastStatus = null;

  for (let i = 0; i < 4; i += 1) {
    const response = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
        Cookie: cookie
      },
      body: JSON.stringify({ email, password: 'Password12345!' })
    });
    lastStatus = response.status;
    if (i < 3) {
      assert.notEqual(response.status, 429);
    }
  }

  assert.equal(lastStatus, 429);
});

test('session cookie settings differ for production vs dev', async () => {
  const { sessionCookieOptions } = requireFreshServer();
  const prod = sessionCookieOptions({ isProd: true });
  const dev = sessionCookieOptions({ isProd: false });

  assert.equal(prod.httpOnly, true);
  assert.equal(prod.sameSite, 'lax');
  assert.equal(prod.secure, true);
  assert.equal(dev.secure, false);
});
