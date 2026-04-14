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

function buildForwardedLinkedInPayload(toEmail, userEmail) {
  const stamp = Date.now();
  return {
    From: `Jason Conklin <${userEmail}>`,
    To: toEmail,
    ToFull: [{ Email: toEmail }],
    Subject: 'Fwd: Jason, your application was sent to Cassidy',
    MessageID: `<forwarded-linkedin-${stamp}@gmail.com>`,
    Date: new Date().toISOString(),
    TextBody: [
      'Forwarding this to Applictus.',
      '',
      '---------- Forwarded message ---------',
      'From: LinkedIn Jobs <jobs-noreply@linkedin.com>',
      'Date: Thu, Mar 12, 2026 at 10:31 AM',
      'Subject: Jason, your application was sent to Cassidy',
      `To: ${userEmail}`,
      '',
      'Cassidy',
      'Software Engineer',
      'Cassidy · New York, NY (On-site)'
    ].join('\n'),
    Headers: [{ Name: 'Message-ID', Value: `<forwarded-linkedin-rfc-${stamp}@gmail.com>` }]
  };
}

function buildForwardedWorkablePayload(toEmail, userEmail) {
  const stamp = Date.now();
  return {
    From: `Jason Conklin <${userEmail}>`,
    To: toEmail,
    ToFull: [{ Email: toEmail }],
    Subject: 'FW: Thanks for applying to EarthCam',
    MessageID: `<forwarded-workable-${stamp}@gmail.com>`,
    Date: new Date().toISOString(),
    TextBody: [
      'FYI',
      '',
      '---------- Forwarded message ---------',
      'From: Workable <noreply@candidates.workablemail.com>',
      'Date: Thu, Mar 12, 2026 at 11:02 AM',
      'Subject: Thanks for applying to EarthCam',
      `To: ${userEmail}`,
      '',
      'EarthCam',
      'Your application for the Jr. Python Developer job was submitted successfully.',
      "Here's a copy of your application data...",
      'Personal information',
      'Operations & Logistics Assistant'
    ].join('\n'),
    Headers: [{ Name: 'Message-ID', Value: `<forwarded-workable-rfc-${stamp}@gmail.com>` }]
  };
}

function buildForwardedIndeedPayload(toEmail, userEmail) {
  const stamp = Date.now();
  return {
    From: `Jason Conklin <${userEmail}>`,
    To: toEmail,
    ToFull: [{ Email: toEmail }],
    Subject: 'Fwd: Indeed Application: Mobile Developer',
    MessageID: `<forwarded-indeed-${stamp}@gmail.com>`,
    Date: new Date().toISOString(),
    TextBody: [
      'Forwarding this one too.',
      '',
      '---------- Forwarded message ---------',
      'From: Indeed Apply <indeedapply@indeed.com>',
      'Date: Thu, Mar 12, 2026 at 11:18 AM',
      'Subject: Indeed Application: Mobile Developer',
      `To: ${userEmail}`,
      '',
      'Application submitted',
      'Mobile Developer',
      'Visual Computer Solutions - Freehold, NJ 07728'
    ].join('\n'),
    Headers: [{ Name: 'Message-ID', Value: `<forwarded-indeed-rfc-${stamp}@gmail.com>` }]
  };
}

function buildUserReplyPayload(toEmail, userEmail) {
  const stamp = Date.now();
  return {
    From: `Jason Conklin <${userEmail}>`,
    To: toEmail,
    ToFull: [{ Email: toEmail }],
    Subject: 'Re: Interview scheduling',
    MessageID: `<outbound-reply-${stamp}@gmail.com>`,
    Date: new Date().toISOString(),
    TextBody: [
      'Tuesday, March 3rd at 4:00 PM works for me.',
      'Thanks!',
      'Jason'
    ].join('\n'),
    Headers: [{ Name: 'Message-ID', Value: `<outbound-reply-rfc-${stamp}@gmail.com>` }]
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

function buildLinkedInAnalyticsPayload(toEmail) {
  const stamp = Date.now();
  return {
    From: 'LinkedIn Notifications <notifications-noreply@linkedin.com>',
    To: toEmail,
    ToFull: [{ Email: toEmail }],
    Subject: 'Jason, your posts got 37 impressions last week',
    MessageID: `<linkedin-analytics-${stamp}@linkedin.com>`,
    Date: new Date().toISOString(),
    TextBody: [
      'Your audience showed up this week.',
      'View all analytics',
      'Start your next post',
      'Posting at least once a week can help your content perform better.',
      'Reactions, comments, and reposts are up.'
    ].join('\n'),
    Headers: [{ Name: 'Message-ID', Value: `<linkedin-analytics-rfc-${stamp}@linkedin.com>` }]
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

test('inbound sync excludes LinkedIn analytics notifications from application ingestion', async (t) => {
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
      email: `linkedin-analytics-${crypto.randomUUID()}@example.com`,
      password: 'StrongPassword123!'
    })
  });
  assert.equal(signup.status, 200);

  const addressRes = await request('/api/inbound/address');
  assert.equal(addressRes.status, 200);
  const toEmail = addressRes.body.address_email;
  assert.ok(toEmail);

  const applicationsBefore = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM job_applications
       WHERE archived = 0`
    )
    .get();
  const baselineApplicationCount = Number(applicationsBefore.count || 0);

  const analyticsNotice = await postInbound(baseUrl, buildLinkedInAnalyticsPayload(toEmail));
  assert.equal(analyticsNotice.status, 200);

  const syncRes = await request('/api/inbound/sync', {
    method: 'POST',
    body: JSON.stringify({})
  });
  assert.equal(syncRes.status, 200);
  assert.equal(syncRes.body.status, 'ok');
  assert.equal(syncRes.body.processed, 0);
  assert.equal(syncRes.body.ignored, 1);

  const row = await db
    .prepare(
      `SELECT processing_status, processing_error
       FROM inbound_messages
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get();
  assert.equal(String(row.processing_status), 'ignored');
  assert.match(
    String(row.processing_error || ''),
    /suppressed:excluded_non_job_linkedin_notification/i
  );

  const applications = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM job_applications
       WHERE archived = 0`
    )
    .get();
  assert.equal(Number(applications.count || 0), baselineApplicationCount);
});

test('inbound sync unwraps manually forwarded LinkedIn confirmations and creates applications', async (t) => {
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
  const userEmail = `forwarded-linkedin-${crypto.randomUUID()}@example.com`;
  const signup = await request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: userEmail,
      password: 'StrongPassword123!'
    })
  });
  assert.equal(signup.status, 200);

  const addressRes = await request('/api/inbound/address');
  assert.equal(addressRes.status, 200);
  const toEmail = addressRes.body.address_email;
  assert.ok(toEmail);

  const forwarded = await postInbound(baseUrl, buildForwardedLinkedInPayload(toEmail, userEmail));
  assert.equal(forwarded.status, 200);

  const syncRes = await request('/api/inbound/sync', {
    method: 'POST',
    body: JSON.stringify({})
  });
  assert.equal(syncRes.status, 200);
  assert.equal(syncRes.body.status, 'ok');
  assert.ok(syncRes.body.processed >= 1);
  assert.equal(syncRes.body.ignored, 0);

  const inboundRow = await db
    .prepare(
      `SELECT processing_status, derived_company, derived_role, derived_debug_json
       FROM inbound_messages
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get();
  assert.equal(String(inboundRow.processing_status), 'processed');
  assert.equal(inboundRow.derived_company, 'Cassidy');
  assert.equal(inboundRow.derived_role, 'Software Engineer');

  const debug = JSON.parse(String(inboundRow.derived_debug_json || '{}'));
  assert.equal(debug?.forwarding_wrapper?.detected, true);
  assert.equal(debug?.forwarding_wrapper?.used_original_for_parsing, true);
  assert.equal(debug?.forwarding_wrapper?.original_from_email, 'jobs-noreply@linkedin.com');
  assert.equal(String(debug?.provider_id || ''), 'linkedin_jobs');
  assert.equal(debug?.linkedin_role_line_detected, 'Software Engineer');
  assert.equal(debug?.linkedin_role_cleaned, 'Software Engineer');
  assert.equal(debug?.role_source, 'line_above_company');

  const applications = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM job_applications
       WHERE archived = 0`
    )
    .get();
  assert.ok(Number(applications.count) >= 1);
});

test('inbound sync still suppresses genuine user-authored outbound replies', async (t) => {
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
  const userEmail = `outbound-suppression-${crypto.randomUUID()}@example.com`;
  const signup = await request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: userEmail,
      password: 'StrongPassword123!'
    })
  });
  assert.equal(signup.status, 200);

  const addressRes = await request('/api/inbound/address');
  assert.equal(addressRes.status, 200);
  const toEmail = addressRes.body.address_email;

  const outbound = await postInbound(baseUrl, buildUserReplyPayload(toEmail, userEmail));
  assert.equal(outbound.status, 200);

  const syncRes = await request('/api/inbound/sync', {
    method: 'POST',
    body: JSON.stringify({})
  });
  assert.equal(syncRes.status, 200);
  assert.equal(syncRes.body.processed, 0);
  assert.equal(syncRes.body.ignored, 1);

  const row = await db
    .prepare(
      `SELECT processing_status, processing_error
       FROM inbound_messages
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get();
  assert.equal(String(row.processing_status), 'ignored');
  assert.match(String(row.processing_error || ''), /suppressed:outbound_user/i);
});

test('inbound sync unwraps manually forwarded Workable confirmations', async (t) => {
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
  const userEmail = `forwarded-workable-${crypto.randomUUID()}@example.com`;
  const signup = await request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: userEmail,
      password: 'StrongPassword123!'
    })
  });
  assert.equal(signup.status, 200);

  const addressRes = await request('/api/inbound/address');
  assert.equal(addressRes.status, 200);
  const toEmail = addressRes.body.address_email;

  const forwarded = await postInbound(baseUrl, buildForwardedWorkablePayload(toEmail, userEmail));
  assert.equal(forwarded.status, 200);

  const syncRes = await request('/api/inbound/sync', {
    method: 'POST',
    body: JSON.stringify({})
  });
  assert.equal(syncRes.status, 200);
  assert.ok(syncRes.body.processed >= 1);

  const row = await db
    .prepare(
      `SELECT processing_status, derived_company, derived_role, derived_debug_json
       FROM inbound_messages
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get();
  assert.equal(String(row.processing_status), 'processed');
  assert.equal(row.derived_company, 'EarthCam');
  assert.equal(row.derived_role, 'Jr. Python Developer');
  const debug = JSON.parse(String(row.derived_debug_json || '{}'));
  assert.equal(debug?.forwarding_wrapper?.detected, true);
  assert.equal(debug?.forwarding_wrapper?.original_from_email, 'noreply@candidates.workablemail.com');
});

test('inbound sync unwraps manually forwarded Indeed confirmations', async (t) => {
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
  const userEmail = `forwarded-indeed-${crypto.randomUUID()}@example.com`;
  const signup = await request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: userEmail,
      password: 'StrongPassword123!'
    })
  });
  assert.equal(signup.status, 200);

  const addressRes = await request('/api/inbound/address');
  assert.equal(addressRes.status, 200);
  const toEmail = addressRes.body.address_email;

  const forwarded = await postInbound(baseUrl, buildForwardedIndeedPayload(toEmail, userEmail));
  assert.equal(forwarded.status, 200);

  const syncRes = await request('/api/inbound/sync', {
    method: 'POST',
    body: JSON.stringify({})
  });
  assert.equal(syncRes.status, 200);
  assert.ok(syncRes.body.processed >= 1);

  const row = await db
    .prepare(
      `SELECT processing_status, derived_company, derived_role, derived_debug_json
       FROM inbound_messages
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get();
  assert.equal(String(row.processing_status), 'processed');
  assert.equal(row.derived_company, 'Visual Computer Solutions');
  assert.equal(row.derived_role, 'Mobile Developer');
  const debug = JSON.parse(String(row.derived_debug_json || '{}'));
  assert.equal(debug?.forwarding_wrapper?.detected, true);
  assert.equal(debug?.forwarding_wrapper?.original_from_email, 'indeedapply@indeed.com');
});
