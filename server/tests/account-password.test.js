const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.NODE_ENV = 'test';
process.env.JOBTRACK_DB_PATH = ':memory:';

const { startServer, stopServer, db } = require('../src/index');

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
    const body = await res.json().catch(() => ({}));
    csrf = body.csrfToken || '';
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
    if (path === '/api/auth/signup' || path === '/api/auth/login') {
      await refreshCsrf();
    }
    return { status: res.status, body: json };
  };
}

test('change password requires current password and updates hash', async (t) => {
  const server = await startServer(0, { log: false, host: '127.0.0.1' });
  t.after(async () => {
    await stopServer();
  });

  const address = server.address();
  const baseUrl = `http://localhost:${address.port}`;
  const request = await createClient(baseUrl);

  const email = `pw-${crypto.randomUUID()}@example.com`;
  const password = 'StrongPassword123!';
  const nextPassword = 'EvenStrongerPassword456!';

  const signup = await request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  assert.equal(signup.status, 200);
  assert.ok(signup.body.user && signup.body.user.id);

  const bad = await request('/api/account/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword: 'WrongPassword123!', newPassword: nextPassword })
  });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.error, 'INVALID_CURRENT_PASSWORD');

  const ok = await request('/api/account/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword: password, newPassword: nextPassword })
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ok, true);

  const fresh = await createClient(baseUrl);
  const loginOld = await fresh('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  assert.equal(loginOld.status, 401);
  assert.equal(loginOld.body.error, 'INVALID_CREDENTIALS');

  const loginNew = await fresh('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: nextPassword })
  });
  assert.equal(loginNew.status, 200);
  assert.ok(loginNew.body.user && loginNew.body.user.id);
});

test('google-only account can set password without current password', async (t) => {
  const server = await startServer(0, { log: false, host: '127.0.0.1' });
  t.after(async () => {
    await stopServer();
  });

  const address = server.address();
  const baseUrl = `http://localhost:${address.port}`;
  const request = await createClient(baseUrl);

  const email = `googleonly-${crypto.randomUUID()}@example.com`;
  const password = 'TemporaryPassword123!';
  const newPassword = 'NewPasswordForGoogleOnly123!';

  const signup = await request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  assert.equal(signup.status, 200);
  const userId = signup.body.user.id;

  // Simulate a Google-only user (no password hash) and verify set-password flow.
  db.prepare("UPDATE users SET password_hash = NULL, auth_provider = 'google' WHERE id = ?").run(userId);

  const setRes = await request('/api/account/password', {
    method: 'POST',
    body: JSON.stringify({ newPassword })
  });
  assert.equal(setRes.status, 200);
  assert.equal(setRes.body.ok, true);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  assert.ok(updated.password_hash);
  assert.equal(updated.auth_provider, 'password+google');
});

