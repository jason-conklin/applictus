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

test('contact endpoint validates and stores messages', async (t) => {
  const { baseUrl, db, stop } = await startServerWithEnv({
    NODE_ENV: 'test',
    JOBTRACK_DB_PATH: ':memory:',
    JOBTRACK_LOG_LEVEL: 'error'
  });
  t.after(stop);

  const { csrfToken, cookie } = await getCsrf(baseUrl);

  const valid = {
    name: 'Jason Test',
    email: `contact-${crypto.randomUUID()}@example.com`,
    message: 'Hello <b>Applictus</b> support!'
  };
  const response = await fetch(`${baseUrl}/api/contact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
      Cookie: cookie
    },
    body: JSON.stringify(valid)
  });
  assert.equal(response.status, 200);
  const body = await response.json().catch(() => ({}));
  assert.equal(body.ok, true);

  const stored = db.prepare('SELECT * FROM contact_messages WHERE email = ?').get(valid.email);
  assert.ok(stored);
  assert.equal(stored.name, valid.name);
  assert.equal(stored.email, valid.email);
  assert.equal(stored.message, 'Hello Applictus support!');
  assert.ok(stored.created_at);

  const invalid = await fetch(`${baseUrl}/api/contact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
      Cookie: cookie
    },
    body: JSON.stringify({ name: 'A', email: 'not-an-email', message: 'Hi' })
  });
  assert.equal(invalid.status, 400);
  const invalidBody = await invalid.json().catch(() => ({}));
  assert.equal(invalidBody.error, 'INVALID_EMAIL');
});

test('contact endpoint is rate limited', async (t) => {
  const { baseUrl, stop } = await startServerWithEnv({
    NODE_ENV: 'test',
    JOBTRACK_DB_PATH: ':memory:',
    JOBTRACK_LOG_LEVEL: 'error',
    JOBTRACK_RATE_LIMIT_MAX: '3',
    JOBTRACK_RATE_LIMIT_WINDOW_MS: '600000'
  });
  t.after(stop);

  const { csrfToken, cookie } = await getCsrf(baseUrl);
  let lastStatus = null;

  for (let i = 0; i < 4; i += 1) {
    const response = await fetch(`${baseUrl}/api/contact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
        Cookie: cookie
      },
      body: JSON.stringify({
        name: 'Rate Limit',
        email: `rate-${i}@example.com`,
        message: `Hello ${i}`
      })
    });
    lastStatus = response.status;
    if (i < 3) {
      assert.notEqual(response.status, 429);
    }
  }

  assert.equal(lastStatus, 429);
});

