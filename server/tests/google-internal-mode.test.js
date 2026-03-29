const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.NODE_ENV = 'test';
process.env.JOBTRACK_DB_PATH = ':memory:';
process.env.JOBTRACK_LOG_LEVEL = 'error';
process.env.JOBTRACK_TOKEN_ENC_KEY = crypto.randomBytes(32).toString('base64');
process.env.GOOGLE_AUTH_CLIENT_ID = 'test-google-auth-client';
process.env.GOOGLE_AUTH_CLIENT_SECRET = 'test-google-auth-secret';
process.env.GOOGLE_AUTH_REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback';
process.env.GOOGLE_CLIENT_ID_INTERNAL = 'test-google-internal-client';
process.env.GOOGLE_CLIENT_SECRET_INTERNAL = 'test-google-internal-secret';
process.env.GOOGLE_REDIRECT_URI_INTERNAL = 'http://localhost:3000/api/auth/google/internal/callback';

const { startServer, stopServer } = require('../src/index');

async function createClient(baseUrl) {
  const cookieJar = new Map();
  let csrfToken = '';

  function updateCookieFromResponse(response) {
    const setCookies = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : response.headers.get('set-cookie')
      ? [response.headers.get('set-cookie')]
      : [];
    for (const entry of setCookies) {
      const value = entry.split(';')[0];
      const name = value.split('=')[0];
      if (name) cookieJar.set(name, value);
    }
  }

  function buildCookieHeader() {
    const values = Array.from(cookieJar.values());
    return values.length ? values.join('; ') : '';
  }

  async function refreshCsrf() {
    const cookie = buildCookieHeader();
    const response = await fetch(`${baseUrl}/api/auth/csrf`, {
      headers: cookie ? { Cookie: cookie } : {}
    });
    updateCookieFromResponse(response);
    const body = await response.json().catch(() => ({}));
    csrfToken = body.csrfToken || '';
  }

  await refreshCsrf();

  async function request(pathname, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const cookie = buildCookieHeader();
    const response = await fetch(`${baseUrl}${pathname}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(method !== 'GET' && method !== 'HEAD' && csrfToken
          ? { 'X-CSRF-Token': csrfToken }
          : {})
      },
      ...options
    });
    updateCookieFromResponse(response);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(body.error || body.message || `HTTP ${response.status}`);
      err.status = response.status;
      err.body = body;
      throw err;
    }
    if (pathname === '/api/auth/login' || pathname === '/api/auth/signup') {
      await refreshCsrf();
    }
    return { body, response };
  }

  return {
    request,
    getCookieHeader: buildCookieHeader
  };
}

test('non-internal users cannot access internal Gmail connect endpoint', async (t) => {
  const server = await startServer(0, { log: false, host: '127.0.0.1' });
  const address = server.address();
  const baseUrl =
    address && typeof address === 'object' ? `http://localhost:${address.port}` : 'http://localhost';
  t.after(async () => {
    await stopServer();
  });

  const client = await createClient(baseUrl);
  const email = `regular-${crypto.randomUUID()}@example.com`;
  await client.request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'Password12345!' })
  });

  const err = await client
    .request('/api/email/connect', { method: 'POST', body: JSON.stringify({}) })
    .catch((error) => error);
  assert.equal(err.status, 410);
  assert.equal(err.body?.error, 'GMAIL_LEGACY_DISABLED');
});

test('internal users can start Gmail OAuth with gmail.readonly scope only on internal route', async (t) => {
  const server = await startServer(0, { log: false, host: '127.0.0.1' });
  const address = server.address();
  const baseUrl =
    address && typeof address === 'object' ? `http://localhost:${address.port}` : 'http://localhost';
  t.after(async () => {
    await stopServer();
  });

  const client = await createClient(baseUrl);
  await client.request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email: 'jasonconklin.dev@gmail.com', password: 'Password12345!' })
  });

  const session = await client.request('/api/auth/session');
  assert.equal(session.body?.user?.gmail_internal_enabled, true);
  assert.equal(session.body?.user?.inbox_mode, 'gmail');

  const connect = await client.request('/api/email/connect', { method: 'POST', body: JSON.stringify({}) });
  assert.equal(connect.body?.internal_mode, true);
  assert.ok(String(connect.body?.url || '').includes('/api/auth/google/internal/start'));

  const start = await fetch(connect.body.url, {
    headers: {
      Cookie: client.getCookieHeader()
    },
    redirect: 'manual'
  });
  assert.equal(start.status, 302);
  const location = start.headers.get('location') || '';
  assert.ok(location.includes('accounts.google.com'));
  const authUrl = new URL(location);
  const scopes = (authUrl.searchParams.get('scope') || '')
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  assert.ok(scopes.includes('https://www.googleapis.com/auth/gmail.readonly'));
  assert.ok(scopes.includes('openid'));
  assert.ok(scopes.includes('email'));
  assert.ok(scopes.includes('profile'));
});
