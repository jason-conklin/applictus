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

function getSetCookieEntries(response) {
  return response.headers.getSetCookie
    ? response.headers.getSetCookie()
    : response.headers.get('set-cookie')
      ? [response.headers.get('set-cookie')]
      : [];
}

function getCookieTokenByName(setCookieEntries, name) {
  const target = `${String(name || '').trim()}=`;
  for (const entry of setCookieEntries || []) {
    const token = String(entry || '').split(';')[0];
    if (token.startsWith(target)) {
      return token;
    }
  }
  return null;
}

async function beginInternalConnect(baseUrl, client) {
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
  const state = String(authUrl.searchParams.get('state') || '');
  assert.ok(state);
  const stateCookie = getCookieTokenByName(getSetCookieEntries(start), 'jt_google_internal_state');
  assert.ok(stateCookie);
  return { state, stateCookie, authUrl };
}

async function finishInternalConnect(baseUrl, client, { state, stateCookie, testEmail, extraQuery = {} }) {
  const callbackUrl = new URL('/api/auth/google/internal/callback', baseUrl);
  callbackUrl.searchParams.set('state', state);
  callbackUrl.searchParams.set('test_email', testEmail);
  Object.entries(extraQuery || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    callbackUrl.searchParams.set(key, String(value));
  });
  const cookieHeader = [client.getCookieHeader(), stateCookie].filter(Boolean).join('; ');
  return fetch(callbackUrl.toString(), {
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
    redirect: 'manual'
  });
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

  const { authUrl } = await beginInternalConnect(baseUrl, client);
  const scopes = (authUrl.searchParams.get('scope') || '')
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  const prompt = String(authUrl.searchParams.get('prompt') || '');
  const loginHint = String(authUrl.searchParams.get('login_hint') || '');
  const redirectUri = String(authUrl.searchParams.get('redirect_uri') || '');
  assert.ok(scopes.includes('https://www.googleapis.com/auth/gmail.readonly'));
  assert.ok(scopes.includes('openid'));
  assert.ok(scopes.includes('email'));
  assert.ok(scopes.includes('profile'));
  assert.ok(prompt.includes('select_account'));
  assert.equal(loginHint, 'jasonconklin.dev@gmail.com');
  assert.equal(redirectUri, `${baseUrl}/api/auth/google/internal/callback`);
});

test('internal Gmail first-time callback succeeds on first attempt and status reflects connected', async (t) => {
  const server = await startServer(0, { log: false, host: '127.0.0.1' });
  const address = server.address();
  const baseUrl =
    address && typeof address === 'object' ? `http://localhost:${address.port}` : 'http://localhost';
  t.after(async () => {
    await stopServer();
  });

  const client = await createClient(baseUrl);
  const internalEmail = 'mconklin246@gmail.com';
  await client.request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email: internalEmail, password: 'Password12345!' })
  });

  const started = await beginInternalConnect(baseUrl, client);
  const callback = await finishInternalConnect(baseUrl, client, {
    state: started.state,
    stateCookie: started.stateCookie,
    testEmail: internalEmail
  });
  assert.equal(callback.status, 302);
  const location = callback.headers.get('location') || '';
  assert.match(location, /gmail_connected=1/);

  const status = await client.request('/api/email/status');
  assert.equal(status.body?.connected, true);
  assert.equal(status.body?.internal_mode, true);
  assert.equal(status.body?.email, internalEmail);
});

test('internal Gmail callback avoids false failure when profile lookup is unavailable in test mode', async (t) => {
  const server = await startServer(0, { log: false, host: '127.0.0.1' });
  const address = server.address();
  const baseUrl =
    address && typeof address === 'object' ? `http://localhost:${address.port}` : 'http://localhost';
  t.after(async () => {
    await stopServer();
  });

  const client = await createClient(baseUrl);
  const internalEmail = 'shaneconklin14@gmail.com';
  await client.request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email: internalEmail, password: 'Password12345!' })
  });

  const started = await beginInternalConnect(baseUrl, client);
  const callback = await finishInternalConnect(baseUrl, client, {
    state: started.state,
    stateCookie: started.stateCookie,
    testEmail: internalEmail,
    extraQuery: {
      test_skip_id_token: '1',
      test_profile_lookup_fail: '1'
    }
  });
  assert.equal(callback.status, 302);
  const location = callback.headers.get('location') || '';
  assert.match(location, /gmail_connected=1/);

  const status = await client.request('/api/email/status');
  assert.equal(status.body?.connected, true);
  assert.equal(status.body?.email, internalEmail);
});
