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
process.env.GMAIL_CLIENT_ID = 'test-gmail-client';
process.env.GMAIL_CLIENT_SECRET = 'test-gmail-secret';
process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/api/email/callback';

const { startServer, stopServer, db } = require('../src/index');
const { upsertTokens, getStoredTokens } = require('../src/email');

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

function assertGoogleScope(location, expectedScopes = []) {
  const target = new URL(location);
  const rawScope = target.searchParams.get('scope') || '';
  const scopes = rawScope.split(/\s+/).filter(Boolean);
  expectedScopes.forEach((scope) => assert.ok(scopes.includes(scope)));
  return scopes;
}

async function completeAutoGmailConnect(baseUrl, sessionCookie, tokens = {}) {
  const response = await fetch(
    `${baseUrl}/api/email/callback?state=auto_connect&test_access_token=${encodeURIComponent(tokens.accessToken || 'auto-access')}&test_refresh_token=${encodeURIComponent(tokens.refreshToken || 'auto-refresh')}`,
    {
      headers: { Cookie: sessionCookie },
      redirect: 'manual'
    }
  );
  assert.equal(response.status, 302);
  return response.headers.get('location') || '';
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
    process.env.GOOGLE_AUTH_CLIENT_ID = saved.GOOGLE_AUTH_CLIENT_ID || '';
    process.env.GOOGLE_AUTH_CLIENT_SECRET = saved.GOOGLE_AUTH_CLIENT_SECRET || '';
    process.env.GOOGLE_AUTH_REDIRECT_URI = saved.GOOGLE_AUTH_REDIRECT_URI || '';
    if (saved.GOOGLE_CLIENT_ID !== undefined) process.env.GOOGLE_CLIENT_ID = saved.GOOGLE_CLIENT_ID;
    if (saved.GOOGLE_CLIENT_SECRET !== undefined)
      process.env.GOOGLE_CLIENT_SECRET = saved.GOOGLE_CLIENT_SECRET;
    if (saved.GOOGLE_REDIRECT_URI !== undefined) process.env.GOOGLE_REDIRECT_URI = saved.GOOGLE_REDIRECT_URI;
  }
});

test('google start requests identity scopes only (no gmail.readonly)', async (t) => {
  const server = await startServer(0, { log: false, host: '127.0.0.1' });
  t.after(async () => {
    await stopServer();
  });
  const address = server.address();
  const baseUrl =
    address && typeof address === 'object' ? `http://localhost:${address.port}` : 'http://localhost';

  const flow = await beginGoogleOAuth(baseUrl);
  const scopes = assertGoogleScope(flow.location, ['openid', 'email', 'profile']);
  assert.ok(!scopes.includes('https://www.googleapis.com/auth/gmail.readonly'));
});

test('new user google signup creates account and chains to gmail connect without storing tokens in auth callback', async (t) => {
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
  assert.match(callback.headers.get('location') || '', /^\/api\/email\/connect\/start\?mode=auto/);
  const callbackCookies = getCookieMap(callback);
  const sessionCookie = callbackCookies.get('jt_session');
  assert.ok(sessionCookie);

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  assert.ok(user);
  assert.equal(user.auth_provider, 'google');

  const tokens = await getStoredTokens(db, user.id);
  assert.equal(tokens, null);

  const connectStart = await fetch(`${baseUrl}/api/email/connect/start?mode=auto`, {
    headers: { Cookie: sessionCookie },
    redirect: 'manual'
  });
  assert.equal(connectStart.status, 302);
  const gmailScopes = assertGoogleScope(connectStart.headers.get('location') || '', [
    'https://www.googleapis.com/auth/gmail.readonly'
  ]);
  assert.equal(gmailScopes.includes('openid'), false);

  const doneLocation = await completeAutoGmailConnect(baseUrl, sessionCookie, {
    accessToken: 'new-access',
    refreshToken: 'new-refresh'
  });
  assert.match(doneLocation, /gmail_connected=1/);

  const storedTokens = await getStoredTokens(db, user.id);
  assert.equal(storedTokens?.access_token, 'new-access');
  assert.equal(storedTokens?.refresh_token, 'new-refresh');
  assert.equal(storedTokens?.connected_email, email);
});

test('existing user with connected gmail is not overwritten by google sign-in', async (t) => {
  const server = await startServer(0, { log: false, host: '127.0.0.1' });
  t.after(async () => {
    await stopServer();
  });
  const address = server.address();
  const baseUrl =
    address && typeof address === 'object' ? `http://localhost:${address.port}` : 'http://localhost';

  const email = `google-existing-${crypto.randomUUID()}@example.com`;
  const userId = insertUser(email, 'password');
  await upsertTokens(
    db,
    userId,
    {
      access_token: 'existing-access',
      refresh_token: 'existing-refresh',
      scope: 'https://www.googleapis.com/auth/gmail.readonly'
    },
    email
  );

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

  const stored = await getStoredTokens(db, userId);
  assert.equal(stored?.access_token, 'existing-access');
  assert.equal(stored?.refresh_token, 'existing-refresh');
  assert.equal(stored?.connected_email, email);
});

test('existing user without gmail connection is chained to connect and can be attached', async (t) => {
  const server = await startServer(0, { log: false, host: '127.0.0.1' });
  t.after(async () => {
    await stopServer();
  });
  const address = server.address();
  const baseUrl =
    address && typeof address === 'object' ? `http://localhost:${address.port}` : 'http://localhost';

  const email = `google-attach-${crypto.randomUUID()}@example.com`;
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
  assert.match(callback.headers.get('location') || '', /^\/api\/email\/connect\/start\?mode=auto/);
  const callbackCookies = getCookieMap(callback);
  const sessionCookie = callbackCookies.get('jt_session');
  assert.ok(sessionCookie);

  const beforeConnect = await getStoredTokens(db, userId);
  assert.equal(beforeConnect, null);

  const doneLocation = await completeAutoGmailConnect(baseUrl, sessionCookie, {
    accessToken: 'attach-access',
    refreshToken: 'attach-refresh'
  });
  assert.match(doneLocation, /gmail_connected=1/);

  const afterConnect = await getStoredTokens(db, userId);
  assert.equal(afterConnect?.access_token, 'attach-access');
  assert.equal(afterConnect?.refresh_token, 'attach-refresh');
  assert.equal(afterConnect?.connected_email, email);
});
