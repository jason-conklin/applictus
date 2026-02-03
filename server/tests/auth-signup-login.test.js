const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.NODE_ENV = 'test';
process.env.JOBTRACK_DB_PATH = ':memory:';

const { startServer, stopServer } = require('../src/index');

async function createClient(baseUrl) {
  const cookieJar = new Map();
  let csrf = '';

  const updateCookies = (res) => {
    const setCookies = res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : [];
    setCookies.forEach((entry) => {
      const value = entry.split(';')[0];
      const name = value.split('=')[0];
      if (name) cookieJar.set(name, value);
    });
  };

  const buildCookie = () => Array.from(cookieJar.values()).join('; ');

  async function refreshCsrf() {
    const res = await fetch(`${baseUrl}/api/auth/csrf`, {
      headers: buildCookie() ? { Cookie: buildCookie() } : {}
    });
    updateCookies(res);
    const body = await res.json();
    csrf = body.csrfToken;
  }

  await refreshCsrf();

  return async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(csrf && method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}),
        ...(buildCookie() ? { Cookie: buildCookie() } : {})
      },
      body
    });
    updateCookies(res);
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json };
  };
}

test('signup then login creates sessions with user_id', async (t) => {
  const server = await startServer(0, { log: false, host: '127.0.0.1' });
  t.after(async () => {
    await stopServer();
  });

  const address = server.address();
  const baseUrl = `http://localhost:${address.port}`;
  const request = await createClient(baseUrl);

  const email = `test-${crypto.randomUUID()}@example.com`;
  const password = 'StrongPassword123!';

  const signup = await request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  assert.equal(signup.status, 200);
  assert.ok(signup.body.user && signup.body.user.id);

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  assert.equal(login.status, 200);
  assert.ok(login.body.user && login.body.user.id);
});
