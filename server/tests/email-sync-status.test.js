const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.NODE_ENV = 'test';
process.env.JOBTRACK_DB_PATH = ':memory:';
process.env.JOBTRACK_LOG_LEVEL = 'error';

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

  return async function request(pathname, options = {}) {
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
  };
}

test('email sync status returns unknown_sync_id instead of 404', async (t) => {
  const server = await startServer(0, { log: false, host: '127.0.0.1' });
  const address = server.address();
  const baseUrl =
    address && typeof address === 'object' ? `http://localhost:${address.port}` : 'http://localhost';
  t.after(async () => {
    await stopServer();
  });

  const request = await createClient(baseUrl);
  const email = `tester-${crypto.randomUUID()}@example.com`;
  const password = 'Password12345!';
  await request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });

  const { body } = await request(`/api/email/sync/status?sync_id=${encodeURIComponent('missing')}`);
  assert.equal(body.ok, false);
  assert.equal(body.status, 'unknown_sync_id');
});

