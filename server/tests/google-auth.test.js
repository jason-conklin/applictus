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

const { startServer, stopServer, db } = require('../src/index');

function getCookieMap(response) {
  const setCookies = response.headers.getSetCookie
    ? response.headers.getSetCookie()
    : response.headers.get('set-cookie')
      ? [response.headers.get('set-cookie')]
      : [];
  const map = new Map();
  for (const entry of setCookies) {
    const token = entry.split(';')[0];
    const name = token.split('=')[0];
    if (name) {
      map.set(name, token);
    }
  }
  return map;
}

function insertUser(email, authProvider = 'password') {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, email, name, created_at, updated_at, password_hash, auth_provider)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, email, null, now, now, null, authProvider);
  return id;
}

async function beginGoogleOAuth(baseUrl) {
  const start = await fetch(`${baseUrl}/api/auth/google/start`, { redirect: 'manual' });
  assert.equal(start.status, 302);
  const location = start.headers.get('location') || '';
  assert.ok(location);
  const cookies = getCookieMap(start);
  const stateCookie = cookies.get('jt_google_state');
  assert.ok(stateCookie);
  const match = stateCookie.match(/jt_google_state=([^;]+)/);
  assert.ok(match);
  return {
    location,
    state: decodeURIComponent(match[1]),
    cookie: stateCookie
  };
}

function getScopesFromLocation(location) {
  const target = new URL(location);
  return (target.searchParams.get('scope') || '')
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

test('google start returns GOOGLE_NOT_CONFIGURED only when oauth env is missing', async (t) => {
  const server = await startServer(0, { log: false, host: '127.0.0.1' });
  t.after(async () => {
    await stopServer();
  });
  const address = server.address();
  const baseUrl =
    address && typeof address === 'object' ? `http://localhost:${address.port}` : 'http://localhost';

  const saved = {
    GOOGLE_AUTH_CLIENT_ID: process.env.GOOGLE_AUTH_CLIENT_ID,
    GOOGLE_AUTH_CLIENT_SECRET: process.env.GOOGLE_AUTH_CLIENT_SECRET,
    GOOGLE_AUTH_REDIRECT_URI: process.env.GOOGLE_AUTH_REDIRECT_URI,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI
  };

  delete process.env.GOOGLE_AUTH_CLIENT_ID;
  delete process.env.GOOGLE_AUTH_CLIENT_SECRET;
  delete process.env.GOOGLE_AUTH_REDIRECT_URI;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_REDIRECT_URI;

  try {
    const response = await fetch(`${baseUrl}/api/auth/google/start`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /auth_error=GOOGLE_NOT_CONFIGURED/);
  } finally {
    if (saved.GOOGLE_AUTH_CLIENT_ID === undefined) delete process.env.GOOGLE_AUTH_CLIENT_ID;
    else process.env.GOOGLE_AUTH_CLIENT_ID = saved.GOOGLE_AUTH_CLIENT_ID;
    if (saved.GOOGLE_AUTH_CLIENT_SECRET === undefined) delete process.env.GOOGLE_AUTH_CLIENT_SECRET;
    else process.env.GOOGLE_AUTH_CLIENT_SECRET = saved.GOOGLE_AUTH_CLIENT_SECRET;
    if (saved.GOOGLE_AUTH_REDIRECT_URI === undefined) delete process.env.GOOGLE_AUTH_REDIRECT_URI;
    else process.env.GOOGLE_AUTH_REDIRECT_URI = saved.GOOGLE_AUTH_REDIRECT_URI;
    if (saved.GOOGLE_CLIENT_ID === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = saved.GOOGLE_CLIENT_ID;
    if (saved.GOOGLE_CLIENT_SECRET === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = saved.GOOGLE_CLIENT_SECRET;
    if (saved.GOOGLE_REDIRECT_URI === undefined) delete process.env.GOOGLE_REDIRECT_URI;
    else process.env.GOOGLE_REDIRECT_URI = saved.GOOGLE_REDIRECT_URI;
  }
});

test('google start requests only identity scopes', async (t) => {
  const server = await startServer(0, { log: false, host: '127.0.0.1' });
  t.after(async () => {
    await stopServer();
  });
  const address = server.address();
  const baseUrl =
    address && typeof address === 'object' ? `http://localhost:${address.port}` : 'http://localhost';

  const flow = await beginGoogleOAuth(baseUrl);
  const scopes = getScopesFromLocation(flow.location);
  assert.deepEqual(scopes, ['openid', 'email', 'profile']);
  assert.ok(
    !scopes.some((scope) => /gmail|mail\.google\.com|googleapis\.com\/auth\/gmail/i.test(scope))
  );
});

test('google callback signs in new user and redirects to app (no gmail auto-chain)', async (t) => {
  const server = await startServer(0, { log: false, host: '127.0.0.1' });
  t.after(async () => {
    await stopServer();
  });
  const address = server.address();
  const baseUrl =
    address && typeof address === 'object' ? `http://localhost:${address.port}` : 'http://localhost';

  const flow = await beginGoogleOAuth(baseUrl);
  const email = `google-new-${crypto.randomUUID()}@example.com`;
  const callback = await fetch(
    `${baseUrl}/api/auth/google/callback?state=${encodeURIComponent(flow.state)}&test_email=${encodeURIComponent(email)}`,
    {
      headers: { Cookie: flow.cookie },
      redirect: 'manual'
    }
  );
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get('location'), 'http://localhost:3000/app');
  const callbackCookies = getCookieMap(callback);
  const sessionCookie = callbackCookies.get('jt_session');
  assert.ok(sessionCookie);
});

test('existing user google sign-in merges provider without gmail token flow', async (t) => {
  const server = await startServer(0, { log: false, host: '127.0.0.1' });
  t.after(async () => {
    await stopServer();
  });
  const address = server.address();
  const baseUrl =
    address && typeof address === 'object' ? `http://localhost:${address.port}` : 'http://localhost';

  const email = `google-existing-${crypto.randomUUID()}@example.com`;
  const userId = insertUser(email, 'password');

  const flow = await beginGoogleOAuth(baseUrl);
  const callback = await fetch(
    `${baseUrl}/api/auth/google/callback?state=${encodeURIComponent(flow.state)}&test_email=${encodeURIComponent(email)}`,
    {
      headers: { Cookie: flow.cookie },
      redirect: 'manual'
    }
  );
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get('location'), 'http://localhost:3000/app');

  const updated = db.prepare('SELECT auth_provider FROM users WHERE id = ?').get(userId);
  assert.equal(updated.auth_provider, 'password+google');
});

test('legacy gmail oauth endpoints are disabled', async (t) => {
  const server = await startServer(0, { log: false, host: '127.0.0.1' });
  t.after(async () => {
    await stopServer();
  });
  const address = server.address();
  const baseUrl =
    address && typeof address === 'object' ? `http://localhost:${address.port}` : 'http://localhost';

  const flow = await beginGoogleOAuth(baseUrl);
  const email = `google-legacy-${crypto.randomUUID()}@example.com`;
  const callback = await fetch(
    `${baseUrl}/api/auth/google/callback?state=${encodeURIComponent(flow.state)}&test_email=${encodeURIComponent(email)}`,
    {
      headers: { Cookie: flow.cookie },
      redirect: 'manual'
    }
  );
  const callbackCookies = getCookieMap(callback);
  const sessionCookie = callbackCookies.get('jt_session');
  assert.ok(sessionCookie);

  const connectStart = await fetch(`${baseUrl}/api/email/connect/start`, {
    headers: { Cookie: sessionCookie.split(';')[0] }
  });
  assert.equal(connectStart.status, 410);
  const body = await connectStart.json();
  assert.equal(body.error, 'GMAIL_LEGACY_DISABLED');
});
