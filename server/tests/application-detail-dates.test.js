const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.NODE_ENV = 'test';
process.env.JOBTRACK_DB_PATH = ':memory:';
process.env.JOBTRACK_LOG_LEVEL = 'error';

const { startServer, stopServer, db } = require('../src/index');

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
      throw new Error(body.error || body.message || `HTTP ${response.status}`);
    }
    if (pathname === '/api/auth/login' || pathname === '/api/auth/signup') {
      await refreshCsrf();
    }
    return body;
  };
}

test('application detail normalizes event internal_date to epoch ms', async (t) => {
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

  const created = await request('/api/applications', {
    method: 'POST',
    body: JSON.stringify({ company_name: 'Acme', job_title: 'Engineer', current_status: 'APPLIED' })
  });
  const appId = created.id || created.application?.id || created.applicationId;
  assert.ok(appId);

  // Insert an email_event with ISO internal_date to mimic Postgres timestamptz serialization.
  const eventId = crypto.randomUUID();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  assert.ok(user);
  const nowIso = new Date().toISOString();
  db.prepare(
    `INSERT INTO email_events
      (id, user_id, application_id, provider, message_id, sender, subject, internal_date, snippet,
       detected_type, confidence_score, classification_confidence, ingest_decision, explanation, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    eventId,
    user.id,
    appId,
    'gmail',
    `msg-${crypto.randomUUID()}`,
    'hr@example.com',
    'Thanks for applying',
    '2026-02-05T12:34:56.000Z',
    'snippet',
    'confirmation',
    0.9,
    0.9,
    'ingested',
    'ok',
    nowIso,
    nowIso
  );

  const detail = await request(`/api/applications/${appId}`);
  assert.ok(Array.isArray(detail.events));
  assert.equal(detail.events.length, 1);
  assert.equal(typeof detail.events[0].internal_date, 'number');
  assert.ok(Number.isFinite(detail.events[0].internal_date));
});

