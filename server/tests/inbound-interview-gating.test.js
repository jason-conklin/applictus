const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

function requireFreshServer() {
  delete require.cache[require.resolve('../src/index')];
  return require('../src/index');
}

async function startServerWithEnv(envOverrides = {}) {
  const envBackup = { ...process.env };
  Object.assign(process.env, envOverrides);
  try {
    const { startServer, stopServer, db } = requireFreshServer();
    const server = await startServer(0, { log: false, host: '127.0.0.1' });
    const address = server.address();
    const baseUrl =
      address && typeof address === 'object' ? `http://localhost:${address.port}` : 'http://localhost';
    return {
      baseUrl,
      db,
      stop: async () => {
        await stopServer();
        Object.assign(process.env, envBackup);
      }
    };
  } catch (err) {
    Object.assign(process.env, envBackup);
    const message = String(err?.message || err);
    if (/better-sqlite3|invalid ELF header|SQLITE_NATIVE_(OPEN|LOAD)_FAILED/i.test(message)) {
      return {
        baseUrl: null,
        db: null,
        stop: async () => {}
      };
    }
    throw err;
  }
}

async function createClient(baseUrl) {
  const cookieJar = new Map();
  let csrf = '';

  const updateCookies = (res) => {
    const setCookie = res.headers.get('set-cookie');
    if (!setCookie) return;
    const value = setCookie.split(';')[0];
    const name = value.split('=')[0];
    if (name) {
      cookieJar.set(name, value);
    }
  };

  const cookieHeader = () => Array.from(cookieJar.values()).join('; ');

  const refreshCsrf = async () => {
    const res = await fetch(`${baseUrl}/api/auth/csrf`, {
      headers: cookieHeader() ? { Cookie: cookieHeader() } : {}
    });
    updateCookies(res);
    const body = await res.json().catch(() => ({}));
    csrf = body.csrfToken || '';
  };

  await refreshCsrf();

  return async function request(path, { method = 'GET', body, headers = {} } = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(csrf && method !== 'GET' && method !== 'HEAD' ? { 'X-CSRF-Token': csrf } : {}),
        ...(cookieHeader() ? { Cookie: cookieHeader() } : {}),
        ...headers
      },
      body
    });
    updateCookies(res);
    const payload = await res.json().catch(() => ({}));
    if (path === '/api/auth/signup' || path === '/api/auth/login') {
      await refreshCsrf();
    }
    return { status: res.status, body: payload };
  };
}

async function postInbound(baseUrl, payload) {
  const res = await fetch(`${baseUrl}/api/inbound/postmark`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-applictus-inbound-secret': 'test-inbound-secret'
    },
    body: JSON.stringify(payload)
  });
  return {
    status: res.status,
    body: await res.json().catch(() => ({}))
  };
}

function buildGlassdoorPayload(toEmail) {
  const stamp = Date.now();
  return {
    From: 'Glassdoor Community <community@glassdoor.com>',
    To: toEmail,
    ToFull: [{ Email: toEmail }],
    Subject: 'Tech Buzz: General strike and hiring trends',
    MessageID: `<glassdoor-${stamp}@glassdoor.com>`,
    Date: new Date().toISOString(),
    TextBody: [
      'View more posts',
      'I have an interview for the role of Lead QA...',
      'read more',
      'read more',
      'comments',
      'unsubscribe'
    ].join('\n'),
    Headers: [{ Name: 'List-Unsubscribe', Value: '<mailto:unsubscribe@glassdoor.com>' }]
  };
}

function buildInterviewRequestPayload(toEmail) {
  const stamp = Date.now();
  return {
    From: 'Mike Maffattone <mike@multimixit.com>',
    To: toEmail,
    ToFull: [{ Email: toEmail }],
    Subject: 'Interview request for Software Developer role',
    MessageID: `<interview-${stamp}@multimixit.com>`,
    Date: new Date().toISOString(),
    TextBody: [
      'Hi Jason,',
      'We would like to speak with you about your application for the Software Developer position.',
      'Are you available Monday 3/2 from 3-5 pm or Tuesday 3/3 at 4:00 pm?',
      'I can send a Zoom invitation.',
      'Thanks,',
      'MultiMix IT Recruiting Team'
    ].join('\n')
  };
}

test('digest email is suppressed while real scheduling email remains interview_requested', async (t) => {
  const { baseUrl, db, stop } = await startServerWithEnv({
    NODE_ENV: 'test',
    JOBTRACK_DB_PATH: ':memory:',
    JOBTRACK_LOG_LEVEL: 'error',
    INBOUND_DOMAIN: 'mail.applictus.com',
    POSTMARK_INBOUND_SECRET: 'test-inbound-secret'
  });
  t.after(stop);
  if (!baseUrl || !db) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }

  const request = await createClient(baseUrl);
  const signup = await request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: `inbound-gating-${crypto.randomUUID()}@example.com`,
      password: 'StrongPassword123!'
    })
  });
  assert.equal(signup.status, 200);

  const addressRes = await request('/api/inbound/address');
  assert.equal(addressRes.status, 200);
  const toEmail = addressRes.body.address_email;

  const digest = await postInbound(baseUrl, buildGlassdoorPayload(toEmail));
  const interview = await postInbound(baseUrl, buildInterviewRequestPayload(toEmail));
  assert.equal(digest.status, 200);
  assert.equal(interview.status, 200);

  const syncRes = await request('/api/inbound/sync', {
    method: 'POST',
    body: JSON.stringify({})
  });
  assert.equal(syncRes.status, 200);
  assert.equal(syncRes.body.errors, 0);

  const rows = db
    .prepare(
      `SELECT subject, processing_status, processing_error, derived_status
       FROM inbound_messages
       ORDER BY created_at ASC`
    )
    .all();
  const digestRow = rows.find((row) => /tech buzz/i.test(String(row.subject || '')));
  const interviewRow = rows.find((row) => /interview request/i.test(String(row.subject || '')));
  assert.equal(String(digestRow.processing_status), 'ignored');
  assert.match(String(digestRow.processing_error || ''), /suppressed:bulk_digest/i);
  assert.equal(String(interviewRow.processing_status), 'processed');
  assert.equal(String(interviewRow.derived_status), 'interview_requested');
});
