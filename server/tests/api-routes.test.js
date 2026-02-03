const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.NODE_ENV = 'test';
process.env.JOBTRACK_DB_PATH = ':memory:';
process.env.JOBTRACK_LOG_LEVEL = 'error';
process.env.GOOGLE_CLIENT_ID = 'test-google-client';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback';

const { startServer, stopServer, db } = require('../src/index');

async function requestRaw(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: {
      'Content-Type': 'application/json'
    },
    ...options
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function createClient(baseUrl) {
  const cookieJar = new Map();
  let csrfToken = '';

  function updateCookieFromResponse(response) {
    const setCookies = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : response.headers.get('set-cookie')
      ? [response.headers.get('set-cookie')]
      : [];
    if (!setCookies.length) {
      return;
    }
    for (const entry of setCookies) {
      const value = entry.split(';')[0];
      const name = value.split('=')[0];
      if (name) {
        cookieJar.set(name, value);
      }
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
      const detail = body.error || body.message || `HTTP ${response.status}`;
      if (process.env.DEBUG_TEST_REQUESTS) {
        // Preserve rich context for debugging without polluting the canonical error code expected by tests
        // eslint-disable-next-line no-console
        console.error(`${pathname} ${response.status} ${detail}`);
      }
      throw new Error(detail);
    }
    if (pathname === '/api/auth/login' || pathname === '/api/auth/signup') {
      await refreshCsrf();
    }
    return body;
  };
}

function getCookiesFromResponse(response) {
  const cookies = new Map();
  const setCookies = response.headers.getSetCookie
    ? response.headers.getSetCookie()
    : response.headers.get('set-cookie')
    ? [response.headers.get('set-cookie')]
    : [];
  for (const entry of setCookies) {
    const value = entry.split(';')[0];
    const name = value.split('=')[0];
    if (name) {
      cookies.set(name, value);
    }
  }
  return cookies;
}

test('critical API routes respond with expected shape', async (t) => {
  const server = await startServer(0, { log: false, host: '127.0.0.1' });
  const address = server.address();
  const baseUrl =
    address && typeof address === 'object' ? `http://localhost:${address.port}` : 'http://localhost';
  t.after(async () => {
    await stopServer();
  });
  const request = await createClient(baseUrl);

  const unauth = await requestRaw(baseUrl, '/api/applications');
  assert.equal(unauth.status, 401);
  assert.equal(unauth.body.error, 'AUTH_REQUIRED');

  const email = `tester-${crypto.randomUUID()}@example.com`;
  const shortPassword = 'short';
  const weakSignup = await request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password: shortPassword })
  }).catch((err) => ({ error: err.message }));
  assert.equal(weakSignup.error, 'PASSWORD_TOO_SHORT');

  const password = 'Password12345!';
  const signup = await request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  assert.ok(signup.user);

  // duplicate signup returns conflict
  const dup = await request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  }).catch((err) => err);
  assert.equal(dup.message || dup.error, 'ACCOUNT_EXISTS');

  const storedUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  assert.ok(storedUser.password_hash);
  assert.notEqual(storedUser.password_hash, password);

  const badLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'WrongPassword123!' })
  }).catch((err) => err);
  assert.equal(badLogin.message, 'INVALID_CREDENTIALS');

  await request('/api/applications', {
    method: 'POST',
    body: JSON.stringify({ company_name: 'Acme', job_title: 'Engineer', current_status: 'APPLIED' })
  });
  await request('/api/applications', {
    method: 'POST',
    body: JSON.stringify({ company_name: 'Beta', job_title: 'Designer', current_status: 'UNDER_REVIEW' })
  });

  const listAll = await request('/api/applications?limit=10&offset=0');
  assert.equal(listAll.total, 2);
  const firstId = listAll.applications[0].id;

  const deleteResult = await request(`/api/applications/${firstId}`, { method: 'DELETE' });
  assert.equal(deleteResult.ok, true);
  assert.equal(deleteResult.deletedApplicationId, firstId);

  const listAfterDelete = await request('/api/applications?limit=10&offset=0');
  assert.equal(listAfterDelete.total, 1);

  // Another user cannot delete someone else's application (404)
  const request2 = await createClient(baseUrl);
  await request2('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email: `tester2-${crypto.randomUUID()}@example.com`, password })
  });
  const deleteOther = await request2(`/api/applications/${firstId}`, { method: 'DELETE' }).catch(
    (err) => err.message
  );
  assert.equal(deleteOther, 'NOT_FOUND');

  const list = await request('/api/applications?limit=1&offset=0');
  assert.equal(list.applications.length, 1);

  const pipeline = await request('/api/applications/pipeline?per_status_limit=5');
  assert.ok(Array.isArray(pipeline.columns));
  const counted = pipeline.columns.reduce((sum, col) => sum + (col.count || 0), 0);
  assert.ok(counted >= 1);

  const detail = await request(`/api/applications/${list.applications[0].id}`);
  assert.ok(detail.application);
  assert.ok(Array.isArray(detail.events));

  const googleStart = await fetch(`${baseUrl}/api/auth/google/start`, { redirect: 'manual' });
  assert.equal(googleStart.status, 302);
  const startCookies = getCookiesFromResponse(googleStart);
  const stateCookie = startCookies.get('jt_google_state');
  assert.ok(stateCookie);
  const stateMatch = stateCookie.match(/jt_google_state=([^;]+)/);
  assert.ok(stateMatch);
  const stateValue = stateMatch[1];

  const googleEmail = `google-${crypto.randomUUID()}@example.com`;
  const googleCallback = await fetch(
    `${baseUrl}/api/auth/google/callback?state=${stateValue}&test_email=${encodeURIComponent(googleEmail)}`,
    {
      headers: {
        Cookie: stateCookie.split(';')[0]
      },
      redirect: 'manual'
    }
  );
  assert.equal(googleCallback.status, 302);
  const callbackCookies = getCookiesFromResponse(googleCallback);
  const googleSession = callbackCookies.get('jt_session');
  assert.ok(googleSession);

  const googleSessionResult = await fetch(`${baseUrl}/api/auth/session`, {
    headers: {
      Cookie: googleSession.split(';')[0]
    }
  });
  const googleSessionBody = await googleSessionResult.json();
  assert.equal(googleSessionResult.status, 200);
  assert.equal(googleSessionBody.user.email, googleEmail);
});
