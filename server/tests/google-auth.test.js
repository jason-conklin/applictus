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
  const cookies = getCookieMap(start);
  const stateCookie = cookies.get('jt_google_state');
  assert.ok(stateCookie);
  const match = stateCookie.match(/jt_google_state=([^;]+)/);
  assert.ok(match);
  return {
    state: decodeURIComponent(match[1]),
    cookie: stateCookie
  };
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

test('new user google signup creates account and stores gmail tokens', async (t) => {
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
    `${baseUrl}/api/auth/google/callback?state=${encodeURIComponent(flow.state)}&test_email=${encodeURIComponent(email)}&test_access_token=new-access&test_refresh_token=new-refresh`,
    {
      headers: { Cookie: flow.cookie },
      redirect: 'manual'
    }
  );
  assert.equal(callback.status, 302);

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  assert.ok(user);
  assert.equal(user.auth_provider, 'google');

  const tokens = await getStoredTokens(db, user.id);
  assert.equal(tokens?.access_token, 'new-access');
  assert.equal(tokens?.refresh_token, 'new-refresh');
  assert.equal(tokens?.connected_email, email);
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
    `${baseUrl}/api/auth/google/callback?state=${encodeURIComponent(flow.state)}&test_email=${encodeURIComponent(email)}&test_access_token=newer-access&test_refresh_token=newer-refresh`,
    {
      headers: { Cookie: flow.cookie },
      redirect: 'manual'
    }
  );
  assert.equal(callback.status, 302);

  const stored = await getStoredTokens(db, userId);
  assert.equal(stored?.access_token, 'existing-access');
  assert.equal(stored?.refresh_token, 'existing-refresh');
  assert.equal(stored?.connected_email, email);
});

test('existing user without gmail connection is attached during google sign-in', async (t) => {
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
    `${baseUrl}/api/auth/google/callback?state=${encodeURIComponent(flow.state)}&test_email=${encodeURIComponent(email)}&test_access_token=attach-access&test_refresh_token=attach-refresh`,
    {
      headers: { Cookie: flow.cookie },
      redirect: 'manual'
    }
  );
  assert.equal(callback.status, 302);

  const stored = await getStoredTokens(db, userId);
  assert.equal(stored?.access_token, 'attach-access');
  assert.equal(stored?.refresh_token, 'attach-refresh');
  assert.equal(stored?.connected_email, email);
});
