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
    const message = String(err && err.message ? err.message : err);
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
    if (!setCookie) {
      return;
    }
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

  const request = async (path, { method = 'GET', body, headers = {} } = {}) => {
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

  return request;
}

function buildIndeedPayload(toEmail) {
  const stamp = Date.now();
  return {
    From: 'Indeed Apply <indeedapply@indeed.com>',
    To: toEmail,
    ToFull: [{ Email: toEmail }],
    Subject: 'Indeed Application: Jr. Python Developer',
    MessageID: `<indeed-${stamp}@indeed.com>`,
    Date: new Date().toISOString(),
    TextBody: [
      'Application submitted',
      'Jr. Python Developer',
      'EarthCam - Upper Saddle River, NJ (On-site)',
      'Next steps'
    ].join('\n'),
    Headers: [{ Name: 'Message-ID', Value: `<indeed-rfc-${stamp}@indeed.com>` }]
  };
}

function buildWorkablePayload(toEmail) {
  const stamp = Date.now();
  return {
    From: 'Workable <noreply@candidates.workablemail.com>',
    To: toEmail,
    ToFull: [{ Email: toEmail }],
    Subject: 'Thanks for applying to EarthCam',
    MessageID: `<workable-${stamp}@workablemail.com>`,
    Date: new Date().toISOString(),
    TextBody: [
      'EarthCam',
      'Your application for the Jr. Python Developer job was submitted successfully.',
      "Here's a copy of your application data",
      'Personal information',
      'Operations & Logistics Assistant'
    ].join('\n'),
    Headers: [{ Name: 'Message-ID', Value: `<workable-rfc-${stamp}@workablemail.com>` }]
  };
}

function buildGlassdoorDigestPayload(toEmail) {
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
      'comments',
      'unsubscribe'
    ].join('\n'),
    Headers: [
      { Name: 'List-Unsubscribe', Value: '<mailto:unsubscribe@glassdoor.com>' },
      { Name: 'Message-ID', Value: `<glassdoor-rfc-${stamp}@glassdoor.com>` }
    ]
  };
}

function buildGmailVerificationPayload(toEmail) {
  const stamp = Date.now();
  return {
    From: 'Gmail Team <forwarding-noreply@google.com>',
    To: toEmail,
    ToFull: [{ Email: toEmail }],
    Subject: 'Gmail Forwarding Confirmation - Receive Mail from your account',
    MessageID: `<gmail-fwd-${stamp}@google.com>`,
    Date: new Date().toISOString(),
    TextBody: [
      'Gmail Forwarding Confirmation Code: 123456',
      'To complete this verification step, return to your Gmail settings.'
    ].join('\n'),
    Headers: [{ Name: 'Message-ID', Value: `<gmail-fwd-rfc-${stamp}@google.com>` }]
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
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

test('inbound sync processes pending messages and derives company/role for Indeed + Workable', async (t) => {
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
      email: `inbound-sync-${crypto.randomUUID()}@example.com`,
      password: 'StrongPassword123!'
    })
  });
  assert.equal(signup.status, 200);

  const addressRes = await request('/api/inbound/address');
  assert.equal(addressRes.status, 200);
  const toEmail = addressRes.body.address_email;
  assert.ok(toEmail);

  const indeed = await postInbound(baseUrl, buildIndeedPayload(toEmail));
  const workable = await postInbound(baseUrl, buildWorkablePayload(toEmail));
  assert.equal(indeed.status, 200);
  assert.equal(workable.status, 200);

  const syncRes = await request('/api/inbound/sync', {
    method: 'POST',
    body: JSON.stringify({})
  });
  assert.equal(syncRes.status, 200);
  assert.equal(syncRes.body.status, 'ok');
  assert.equal(syncRes.body.errors, 0);
  assert.ok(syncRes.body.processed >= 2);
  assert.ok(syncRes.body.created + syncRes.body.updated >= 1);

  const rows = await db
    .prepare(
      `SELECT subject, processing_status, derived_company, derived_role
       FROM inbound_messages
       ORDER BY received_at ASC`
    )
    .all();
  const indeedRow = rows.find((row) => /indeed application:/i.test(String(row.subject || '')));
  const workableRow = rows.find((row) => /thanks for applying to earthcam/i.test(String(row.subject || '')));
  assert.equal(String(indeedRow.processing_status), 'processed');
  assert.equal(String(workableRow.processing_status), 'processed');
  assert.equal(indeedRow.derived_company, 'EarthCam');
  assert.equal(indeedRow.derived_role, 'Jr. Python Developer');
  assert.equal(workableRow.derived_company, 'EarthCam');
  assert.equal(workableRow.derived_role, 'Jr. Python Developer');

  const appRows = await db
    .prepare(
      `SELECT company_name, job_title, company_source, role_source, status_source,
              company_confidence, role_confidence, status_confidence
       FROM job_applications`
    )
    .all();
  assert.ok(appRows.length >= 1);
  for (const app of appRows) {
    assert.ok(['user', 'hint', 'parser', 'system'].includes(String(app.company_source || '')));
    assert.ok(['user', 'hint', 'parser', 'system'].includes(String(app.role_source || '')));
    assert.ok(['user', 'hint', 'parser', 'system'].includes(String(app.status_source || '')));
    assert.ok(Number(app.company_confidence) >= 0 && Number(app.company_confidence) <= 100);
    assert.ok(Number(app.role_confidence) >= 0 && Number(app.role_confidence) <= 100);
    assert.ok(Number(app.status_confidence) >= 0 && Number(app.status_confidence) <= 100);
  }
});

test('inbound sync ignores digest emails and Gmail forwarding verification messages', async (t) => {
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
      email: `inbound-ignore-${crypto.randomUUID()}@example.com`,
      password: 'StrongPassword123!'
    })
  });
  assert.equal(signup.status, 200);

  const addressRes = await request('/api/inbound/address');
  assert.equal(addressRes.status, 200);
  const toEmail = addressRes.body.address_email;

  const digest = await postInbound(baseUrl, buildGlassdoorDigestPayload(toEmail));
  const verification = await postInbound(baseUrl, buildGmailVerificationPayload(toEmail));
  assert.equal(digest.status, 200);
  assert.equal(verification.status, 200);

  const statusBeforeSync = await request('/api/inbound/status');
  assert.equal(statusBeforeSync.status, 200);
  assert.equal(statusBeforeSync.body.setup_state, 'active');
  assert.ok(statusBeforeSync.body.last_received_at);

  const syncRes = await request('/api/inbound/sync', {
    method: 'POST',
    body: JSON.stringify({})
  });
  assert.equal(syncRes.status, 200);
  assert.equal(syncRes.body.status, 'ok');
  assert.equal(syncRes.body.processed, 0);
  assert.equal(syncRes.body.ignored, 2);
  assert.equal(syncRes.body.errors, 0);

  const ignoredRows = await db
    .prepare(
      `SELECT subject, processing_status, processing_error
       FROM inbound_messages
       ORDER BY created_at ASC`
    )
    .all();
  const digestRow = ignoredRows.find((row) => /tech buzz/i.test(String(row.subject || '')));
  const verificationRow = ignoredRows.find((row) =>
    /gmail forwarding confirmation/i.test(String(row.subject || ''))
  );
  assert.equal(String(digestRow.processing_status), 'ignored');
  assert.match(String(digestRow.processing_error), /suppressed:bulk_digest/i);
  assert.equal(String(verificationRow.processing_status), 'ignored');
  assert.match(String(verificationRow.processing_error), /gmail_forwarding_verification/i);
});
