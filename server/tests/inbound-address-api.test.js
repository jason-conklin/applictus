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

function buildInboundPayload(toEmail) {
  const stamp = Date.now();
  return {
    From: 'Recruiting Team <jobs@example-company.com>',
    FromFull: { Name: 'Recruiting Team', Email: 'jobs@example-company.com' },
    To: toEmail,
    ToFull: [{ Email: toEmail }],
    Subject: 'Interview invitation for Software Engineer',
    MessageID: `<postmark-${stamp}@example-company.com>`,
    Date: new Date().toISOString(),
    TextBody: 'We would like to speak with you. Please choose a time slot.',
    HtmlBody: '<p>We would like to speak with you.</p>',
    Headers: [{ Name: 'Message-ID', Value: `<rfc-${stamp}@example-company.com>` }]
  };
}

function buildGmailForwardingVerificationPayload(toEmail) {
  const stamp = Date.now();
  return {
    From: 'Gmail Team <forwarding-noreply@google.com>',
    FromFull: { Name: 'Gmail Team', Email: 'forwarding-noreply@google.com' },
    To: toEmail,
    ToFull: [{ Email: toEmail }],
    Subject: 'Gmail Forwarding Confirmation - Receive Mail from your account',
    MessageID: `<gmail-forwarding-${stamp}@google.com>`,
    Date: new Date().toISOString(),
    TextBody: [
      'Gmail Forwarding Confirmation',
      'Please confirm this forwarding request by visiting the link below:',
      'https://mail-settings.google.com/mail/?ui=2&ik=abc123&view=up&act=fwdconfirm',
      'Gmail Forwarding Confirmation Code: 123456'
    ].join('\n'),
    HtmlBody:
      '<p>Gmail Forwarding Confirmation</p><p><a href="https://mail-settings.google.com/mail/?ui=2&ik=abc123&view=up&act=fwdconfirm">Verify email</a></p>',
    Headers: [{ Name: 'Message-ID', Value: `<gmail-forwarding-rfc-${stamp}@google.com>` }]
  };
}

test('inbound address APIs create, confirm, rotate, and become active after inbound email', async (t) => {
  const { baseUrl, stop } = await startServerWithEnv({
    NODE_ENV: 'test',
    JOBTRACK_DB_PATH: ':memory:',
    JOBTRACK_LOG_LEVEL: 'error',
    INBOUND_DOMAIN: 'mail.applictus.com',
    POSTMARK_INBOUND_SECRET: 'test-inbound-secret'
  });
  t.after(stop);
  if (!baseUrl) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }

  const request = await createClient(baseUrl);
  const email = `inbound-${crypto.randomUUID()}@example.com`;
  const password = 'StrongPassword123!';
  const signup = await request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  assert.equal(signup.status, 200);

  const statusBefore = await request('/api/inbound/status');
  assert.equal(statusBefore.status, 200);
  assert.equal(statusBefore.body.setup_state, 'not_started');

  const addressRes = await request('/api/inbound/address');
  assert.equal(addressRes.status, 200);
  assert.ok(addressRes.body.address_email);
  assert.equal(addressRes.body.setup_state, 'awaiting_confirmation');

  const confirmRes = await request('/api/inbound/address/confirm', { method: 'POST' });
  assert.equal(confirmRes.status, 200);
  assert.equal(confirmRes.body.setup_state, 'awaiting_first_email');
  assert.ok(confirmRes.body.confirmed_at);

  const oldAddress = confirmRes.body.address_email;
  const rotateRes = await request('/api/inbound/address/rotate', { method: 'POST' });
  assert.equal(rotateRes.status, 200);
  assert.ok(rotateRes.body.address_email);
  assert.notEqual(rotateRes.body.address_email, oldAddress);
  assert.equal(rotateRes.body.setup_state, 'awaiting_confirmation');

  const inbound = await fetch(`${baseUrl}/api/inbound/postmark`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-applictus-inbound-secret': 'test-inbound-secret'
    },
    body: JSON.stringify(buildInboundPayload(rotateRes.body.address_email))
  });
  assert.equal(inbound.status, 200);

  const statusAfter = await request('/api/inbound/status');
  assert.equal(statusAfter.status, 200);
  assert.equal(statusAfter.body.setup_state, 'active');
  assert.equal(statusAfter.body.effective_connected, true);
  assert.ok(statusAfter.body.last_received_at);
});

test('inbound status exposes Gmail forwarding verification helper and readiness transition', async (t) => {
  const { baseUrl, stop } = await startServerWithEnv({
    NODE_ENV: 'test',
    JOBTRACK_DB_PATH: ':memory:',
    JOBTRACK_LOG_LEVEL: 'error',
    INBOUND_DOMAIN: 'mail.applictus.com',
    POSTMARK_INBOUND_SECRET: 'test-inbound-secret'
  });
  t.after(stop);
  if (!baseUrl) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }

  const request = await createClient(baseUrl);
  const email = `inbound-verify-${crypto.randomUUID()}@example.com`;
  const password = 'StrongPassword123!';
  const signup = await request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  assert.equal(signup.status, 200);

  const addressRes = await request('/api/inbound/address');
  assert.equal(addressRes.status, 200);
  const toEmail = addressRes.body.address_email;
  assert.ok(toEmail);

  const verificationInbound = await fetch(`${baseUrl}/api/inbound/postmark`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-applictus-inbound-secret': 'test-inbound-secret'
    },
    body: JSON.stringify(buildGmailForwardingVerificationPayload(toEmail))
  });
  assert.equal(verificationInbound.status, 200);

  const pendingStatus = await request('/api/inbound/status');
  assert.equal(pendingStatus.status, 200);
  assert.equal(pendingStatus.body.forwarding_readiness, 'gmail_verification_pending');
  assert.equal(pendingStatus.body.gmail_verification_pending, true);
  assert.equal(pendingStatus.body.address_reachable, true);
  assert.equal(pendingStatus.body.inbox_reachable, true);
  assert.equal(pendingStatus.body.gmail_forwarding_active, false);
  assert.equal(pendingStatus.body.setup_complete, false);
  assert.notEqual(pendingStatus.body.setup_state, 'active');
  assert.ok(pendingStatus.body.gmail_forwarding_verification);
  assert.equal(pendingStatus.body.gmail_forwarding_verification.confirmation_code, '123456');
  assert.match(
    String(pendingStatus.body.gmail_forwarding_verification.confirmation_url || ''),
    /mail-settings\.google\.com/i
  );

  const normalInbound = await fetch(`${baseUrl}/api/inbound/postmark`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-applictus-inbound-secret': 'test-inbound-secret'
    },
    body: JSON.stringify(buildInboundPayload(toEmail))
  });
  assert.equal(normalInbound.status, 200);

  const activeStatus = await request('/api/inbound/status');
  assert.equal(activeStatus.status, 200);
  assert.equal(activeStatus.body.forwarding_readiness, 'forwarding_active');
  assert.equal(activeStatus.body.gmail_verification_pending, false);
});

test('inbound setup test email sends to user email and forwarded token completes setup', async (t) => {
  const { baseUrl, db, stop } = await startServerWithEnv({
    NODE_ENV: 'test',
    JOBTRACK_DB_PATH: ':memory:',
    JOBTRACK_LOG_LEVEL: 'error',
    INBOUND_DOMAIN: 'mail.applictus.com',
    POSTMARK_INBOUND_SECRET: 'test-inbound-secret',
    POSTMARK_SERVER_TOKEN: 'test-outbound-token',
    POSTMARK_FROM_EMAIL: 'Applictus <no-reply@applictus.test>',
    POSTMARK_OUTBOUND_MESSAGE_STREAM: 'outbound',
    POSTMARK_API_URL: 'https://postmark.test/email'
  });
  t.after(stop);
  if (!baseUrl || !db) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }
  const postmarkRequests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    if (String(url) === 'https://postmark.test/email') {
      const bodyText = String(options.body || '');
      let body = {};
      try {
        body = bodyText ? JSON.parse(bodyText) : {};
      } catch (_) {
        body = {};
      }
      postmarkRequests.push({
        method: options.method || 'GET',
        token: options.headers?.['X-Postmark-Server-Token'] || '',
        body
      });
      return new Response(JSON.stringify({ MessageID: 'setup-test-message-id', ErrorCode: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return originalFetch(url, options);
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const request = await createClient(baseUrl);
  const email = `inbound-test-email-${crypto.randomUUID()}@example.com`;
  const password = 'StrongPassword123!';
  const signup = await request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  assert.equal(signup.status, 200);

  const addressRes = await request('/api/inbound/address');
  assert.equal(addressRes.status, 200);
  assert.ok(addressRes.body.address_email);

  const verificationInbound = await fetch(`${baseUrl}/api/inbound/postmark`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-applictus-inbound-secret': 'test-inbound-secret'
    },
    body: JSON.stringify(buildGmailForwardingVerificationPayload(addressRes.body.address_email))
  });
  assert.equal(verificationInbound.status, 200);

  const testEmailRes = await request('/api/inbound/test-email', { method: 'POST', body: JSON.stringify({}) });
  assert.equal(testEmailRes.status, 200);
  assert.equal(testEmailRes.body.ok, true);
  assert.equal(testEmailRes.body.sent, true);
  assert.equal(testEmailRes.body.already_received, false);
  assert.equal(testEmailRes.body.status.address_email, addressRes.body.address_email);
  assert.equal(postmarkRequests.length, 1);
  assert.equal(postmarkRequests[0].method, 'POST');
  assert.equal(postmarkRequests[0].token, 'test-outbound-token');
  assert.equal(postmarkRequests[0].body.To, email);
  assert.notEqual(postmarkRequests[0].body.To, addressRes.body.address_email);
  assert.equal(postmarkRequests[0].body.From, 'Applictus <no-reply@applictus.test>');
  assert.equal(postmarkRequests[0].body.MessageStream, 'outbound');
  assert.match(String(postmarkRequests[0].body.Subject || ''), /Application submitted/i);
  assert.match(String(postmarkRequests[0].body.Subject || ''), /Applictus setup test/i);
  const tokenMatch = String(postmarkRequests[0].body.TextBody || '').match(/Applictus setup test token:\s*([a-f0-9]+)/i);
  assert.ok(tokenMatch);
  assert.ok(tokenMatch[1]);
  const tokenRow = db
    .prepare('SELECT setup_test_token_hash, setup_test_sent_at FROM inbound_addresses WHERE address_email = ?')
    .get(addressRes.body.address_email);
  assert.ok(tokenRow.setup_test_token_hash);
  assert.ok(tokenRow.setup_test_sent_at);

  const forwardedPayload = buildInboundPayload(addressRes.body.address_email);
  forwardedPayload.Subject = postmarkRequests[0].body.Subject;
  forwardedPayload.TextBody = postmarkRequests[0].body.TextBody;
  forwardedPayload.HtmlBody = postmarkRequests[0].body.HtmlBody;
  forwardedPayload.MessageID = `<forwarded-setup-test-${Date.now()}@gmail.example>`;
  forwardedPayload.Headers = [{ Name: 'Message-ID', Value: `<forwarded-setup-test-rfc-${Date.now()}@gmail.example>` }];
  const forwardedInbound = await fetch(`${baseUrl}/api/inbound/postmark`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-applictus-inbound-secret': 'test-inbound-secret'
    },
    body: JSON.stringify(forwardedPayload)
  });
  const forwardedBody = await forwardedInbound.json();
  assert.equal(forwardedInbound.status, 200);
  assert.equal(forwardedBody.ok, true);
  assert.equal(forwardedBody.ignored, true);
  assert.equal(forwardedBody.reason, 'setup_test_email_received');

  const completeStatus = await request('/api/inbound/status');
  assert.equal(completeStatus.status, 200);
  assert.equal(completeStatus.body.forwarding_readiness, 'forwarding_active');
  assert.equal(completeStatus.body.gmail_forwarding_active, true);
  assert.equal(completeStatus.body.setup_complete, true);
  assert.ok(completeStatus.body.setup_test_received_at);

  const appCount = db
    .prepare('SELECT COUNT(*) AS count FROM job_applications WHERE user_id = ?')
    .get(signup.body.user.id);
  assert.equal(Number(appCount.count), 0);
});

test('inbound setup test email reports missing outbound config clearly', async (t) => {
  const { baseUrl, stop } = await startServerWithEnv({
    NODE_ENV: 'test',
    JOBTRACK_DB_PATH: ':memory:',
    JOBTRACK_LOG_LEVEL: 'error',
    INBOUND_DOMAIN: 'mail.applictus.com',
    POSTMARK_INBOUND_SECRET: 'test-inbound-secret',
    POSTMARK_SERVER_TOKEN: 'test-outbound-token',
    POSTMARK_FROM_EMAIL: 'Applictus <no-reply@applictus.test>',
    POSTMARK_OUTBOUND_MESSAGE_STREAM: ''
  });
  t.after(stop);
  if (!baseUrl) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }

  const request = await createClient(baseUrl);
  const email = `missing-config-${crypto.randomUUID()}@example.com`;
  const password = 'StrongPassword123!';
  const signup = await request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  assert.equal(signup.status, 200);

  const addressRes = await request('/api/inbound/address');
  assert.equal(addressRes.status, 200);
  const verificationInbound = await fetch(`${baseUrl}/api/inbound/postmark`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-applictus-inbound-secret': 'test-inbound-secret'
    },
    body: JSON.stringify(buildGmailForwardingVerificationPayload(addressRes.body.address_email))
  });
  assert.equal(verificationInbound.status, 200);

  const testEmailRes = await request('/api/inbound/test-email', { method: 'POST', body: JSON.stringify({}) });
  assert.equal(testEmailRes.status, 503);
  assert.equal(testEmailRes.body.error, 'OUTBOUND_EMAIL_NOT_CONFIGURED');
  assert.ok(Array.isArray(testEmailRes.body.missing));
  assert.ok(testEmailRes.body.missing.includes('POSTMARK_OUTBOUND_MESSAGE_STREAM'));
  assert.match(String(testEmailRes.body.message || ''), /POSTMARK_OUTBOUND_MESSAGE_STREAM/);
});
