const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { getOrCreateInboundAddress, rotateInboundAddress } = require('../src/inbound');

function requireFreshServer() {
  delete require.cache[require.resolve('../src/index')];
  return require('../src/index');
}

async function awaitMaybe(value) {
  return value && typeof value.then === 'function' ? await value : value;
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

async function createUser(db, { id, email }) {
  const now = new Date().toISOString();
  await awaitMaybe(
    db
      .prepare(
        `INSERT INTO users (id, email, name, auth_provider, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, email, 'Inbound Tester', 'password', now, now)
  );
}

function buildPayload(toEmail, overrides = {}) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  return {
    From: 'Recruiting Team <jobs@example-company.com>',
    FromFull: { Name: 'Recruiting Team', Email: 'jobs@example-company.com' },
    To: toEmail,
    ToFull: [{ Email: toEmail }],
    Subject: overrides.subject || 'Thanks for applying to Example Company',
    MessageID: overrides.messageId || `<postmark-${stamp}@example-company.com>`,
    Date: '2026-03-05T15:30:00.000Z',
    TextBody: overrides.textBody || 'Your application was received. We will review your resume shortly.',
    HtmlBody:
      '<p>Your application was received.</p><p>We will review your resume shortly.</p>',
    Headers: [{ Name: 'Message-ID', Value: overrides.rfcMessageId || `<rfc-${stamp}@example-company.com>` }]
  };
}

test('postmark webhook persists pending inbound message and dedupes duplicates', async (t) => {
  const { baseUrl, db, stop } = await startServerWithEnv({
    NODE_ENV: 'test',
    JOBTRACK_DB_PATH: ':memory:',
    JOBTRACK_LOG_LEVEL: 'error',
    POSTMARK_INBOUND_SECRET: 'test-inbound-secret',
    INBOUND_DOMAIN: 'mail.applictus.com'
  });
  t.after(stop);
  if (!baseUrl || !db) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }

  const userId = crypto.randomUUID();
  await createUser(db, { id: userId, email: `inbound-${Date.now()}@example.com` });
  const inboundAddress = await getOrCreateInboundAddress(db, userId, {
    inboundDomain: 'mail.applictus.com'
  });
  const payload = buildPayload(inboundAddress.address_email);

  const first = await fetch(`${baseUrl}/api/inbound/postmark?secret=test-inbound-secret`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const firstBody = await first.json();
  assert.equal(first.status, 200);
  assert.equal(firstBody.ok, true);
  assert.equal(firstBody.deduped, false);

  const second = await fetch(`${baseUrl}/api/inbound/postmark`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-applictus-inbound-secret': 'test-inbound-secret'
    },
    body: JSON.stringify(payload)
  });
  const secondBody = await second.json();
  assert.equal(second.status, 200);
  assert.equal(secondBody.ok, true);
  assert.equal(secondBody.deduped, true);

  const inboundCount = await awaitMaybe(
    db.prepare('SELECT COUNT(*) AS count FROM inbound_messages WHERE user_id = ?').get(userId)
  );
  assert.equal(Number(inboundCount.count), 1);
  const webhookEventCount = await awaitMaybe(
    db
      .prepare("SELECT COUNT(*) AS count FROM inbound_webhook_events WHERE user_id = ? AND reason = 'accepted'")
      .get(userId)
  );
  assert.equal(Number(webhookEventCount.count), 1);

  const pendingRow = await awaitMaybe(
    db
      .prepare(
        `SELECT processing_status, processed_at, derived_event_id
         FROM inbound_messages
         WHERE user_id = ?
         LIMIT 1`
      )
      .get(userId)
  );
  assert.equal(String(pendingRow.processing_status || ''), 'pending');
  assert.equal(pendingRow.processed_at, null);
  assert.equal(pendingRow.derived_event_id, null);
});

test('postmark webhook returns success for unmapped recipient and 401 for invalid secret', async (t) => {
  const { baseUrl, stop } = await startServerWithEnv({
    NODE_ENV: 'test',
    JOBTRACK_DB_PATH: ':memory:',
    JOBTRACK_LOG_LEVEL: 'error',
    POSTMARK_INBOUND_SECRET: 'test-inbound-secret',
    INBOUND_DOMAIN: 'mail.applictus.com'
  });
  t.after(stop);
  if (!baseUrl) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }

  const payload = buildPayload('u_unknown@mail.applictus.com');

  const unauthorized = await fetch(`${baseUrl}/api/inbound/postmark`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-applictus-inbound-secret': 'wrong-secret'
    },
    body: JSON.stringify(payload)
  });
  assert.equal(unauthorized.status, 401);

  const unmapped = await fetch(`${baseUrl}/api/inbound/postmark`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const unmappedWithoutAuth = await unmapped.json();
  assert.equal(unmapped.status, 401);
  assert.equal(unmappedWithoutAuth.error, 'UNAUTHORIZED');

  const unmappedWithQueryAuth = await fetch(`${baseUrl}/api/inbound/postmark?secret=test-inbound-secret`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const unmappedBody = await unmappedWithQueryAuth.json();
  assert.equal(unmappedWithQueryAuth.status, 200);
  assert.equal(unmappedBody.ok, true);
  assert.equal(unmappedBody.ignored, true);
  assert.equal(unmappedBody.reason, 'unknown_recipient');
});

test('postmark webhook drops disabled inbound address before storage', async (t) => {
  const { baseUrl, db, stop } = await startServerWithEnv({
    NODE_ENV: 'test',
    JOBTRACK_DB_PATH: ':memory:',
    JOBTRACK_LOG_LEVEL: 'error',
    POSTMARK_INBOUND_SECRET: 'test-inbound-secret',
    INBOUND_DOMAIN: 'mail.applictus.com'
  });
  t.after(stop);
  if (!baseUrl || !db) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }

  const userId = crypto.randomUUID();
  await createUser(db, { id: userId, email: `disabled-inbound-${Date.now()}@example.com` });
  const inboundAddress = await getOrCreateInboundAddress(db, userId, {
    inboundDomain: 'mail.applictus.com'
  });
  await awaitMaybe(
    db
      .prepare("UPDATE inbound_addresses SET is_active = 0, status = 'disabled' WHERE id = ?")
      .run(inboundAddress.id)
  );

  const res = await fetch(`${baseUrl}/api/inbound/postmark?secret=test-inbound-secret`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildPayload(inboundAddress.address_email))
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.ignored, true);
  assert.equal(body.reason, 'inbox_address_disabled');

  const inboundCount = await awaitMaybe(
    db.prepare('SELECT COUNT(*) AS count FROM inbound_messages WHERE user_id = ?').get(userId)
  );
  assert.equal(Number(inboundCount.count), 0);
});

test('postmark webhook drops rotated old inbound address before storage', async (t) => {
  const { baseUrl, db, stop } = await startServerWithEnv({
    NODE_ENV: 'test',
    JOBTRACK_DB_PATH: ':memory:',
    JOBTRACK_LOG_LEVEL: 'error',
    POSTMARK_INBOUND_SECRET: 'test-inbound-secret',
    INBOUND_DOMAIN: 'mail.applictus.com'
  });
  t.after(stop);
  if (!baseUrl || !db) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }

  const userId = crypto.randomUUID();
  await createUser(db, { id: userId, email: `rotated-inbound-${Date.now()}@example.com` });
  const oldAddress = await getOrCreateInboundAddress(db, userId, {
    inboundDomain: 'mail.applictus.com'
  });
  const newAddress = await rotateInboundAddress(db, userId, {
    inboundDomain: 'mail.applictus.com'
  });
  assert.notEqual(newAddress.address_email, oldAddress.address_email);

  const res = await fetch(`${baseUrl}/api/inbound/postmark?secret=test-inbound-secret`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildPayload(oldAddress.address_email))
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.ignored, true);
  assert.equal(body.reason, 'inbox_address_disabled');

  const inboundCount = await awaitMaybe(
    db.prepare('SELECT COUNT(*) AS count FROM inbound_messages WHERE user_id = ?').get(userId)
  );
  assert.equal(Number(inboundCount.count), 0);
});

test('postmark webhook returns 503 when POSTMARK_INBOUND_SECRET is missing', async (t) => {
  const { baseUrl, stop } = await startServerWithEnv({
    NODE_ENV: 'test',
    JOBTRACK_DB_PATH: ':memory:',
    JOBTRACK_LOG_LEVEL: 'error',
    POSTMARK_INBOUND_SECRET: '',
    INBOUND_DOMAIN: 'mail.applictus.com'
  });
  t.after(stop);
  if (!baseUrl) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }

  const payload = buildPayload('u_unknown@mail.applictus.com');
  const response = await fetch(`${baseUrl}/api/inbound/postmark?secret=any-secret`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.error, 'INBOUND_NOT_READY');
  assert.equal(body.message, 'POSTMARK_INBOUND_SECRET not configured');
});

test('postmark webhook enforces per-user processing cap before storage', async (t) => {
  const { baseUrl, db, stop } = await startServerWithEnv({
    NODE_ENV: 'test',
    JOBTRACK_DB_PATH: ':memory:',
    JOBTRACK_LOG_LEVEL: 'error',
    POSTMARK_INBOUND_SECRET: 'test-inbound-secret',
    INBOUND_DOMAIN: 'mail.applictus.com',
    JOBTRACK_FREE_MONTHLY_INBOUND_LIMIT: '2'
  });
  t.after(stop);
  if (!baseUrl || !db) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }

  const userId = crypto.randomUUID();
  await createUser(db, { id: userId, email: `inbound-cap-${Date.now()}@example.com` });
  const inboundAddress = await getOrCreateInboundAddress(db, userId, {
    inboundDomain: 'mail.applictus.com'
  });

  for (let i = 1; i <= 2; i += 1) {
    const payload = buildPayload(inboundAddress.address_email, {
      subject: `Inbound cap warmup ${i}`,
      messageId: `<postmark-cap-${i}-${Date.now()}@example-company.com>`,
      rfcMessageId: `<rfc-cap-${i}-${Date.now()}@example-company.com>`
    });
    const res = await fetch(`${baseUrl}/api/inbound/postmark?secret=test-inbound-secret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.ignored, undefined);
  }

  const overCapPayload = buildPayload(inboundAddress.address_email, {
    subject: 'Inbound cap overage',
    messageId: `<postmark-cap-over-${Date.now()}@example-company.com>`,
    rfcMessageId: `<rfc-cap-over-${Date.now()}@example-company.com>`
  });
  const overCapRes = await fetch(`${baseUrl}/api/inbound/postmark?secret=test-inbound-secret`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(overCapPayload)
  });
  const overCapBody = await overCapRes.json();
  assert.equal(overCapRes.status, 200);
  assert.equal(overCapBody.ok, true);
  assert.equal(overCapBody.ignored, true);
  assert.equal(overCapBody.reason, 'processing_cap_reached');

  const userRow = await awaitMaybe(
    db
      .prepare(
        `SELECT inbound_email_count_current_month,
                inbound_email_dropped_count_current_month,
                inbound_email_dropped_over_cap_count_current_month,
                tracked_email_count_current_month
           FROM users
          WHERE id = ?`
      )
      .get(userId)
  );
  assert.equal(Number(userRow.inbound_email_count_current_month), 3);
  assert.equal(Number(userRow.inbound_email_dropped_count_current_month), 1);
  assert.equal(Number(userRow.inbound_email_dropped_over_cap_count_current_month), 1);
  assert.equal(Number(userRow.tracked_email_count_current_month), 0);
  const inboundCount = await awaitMaybe(
    db.prepare('SELECT COUNT(*) AS count FROM inbound_messages WHERE user_id = ?').get(userId)
  );
  assert.equal(Number(inboundCount.count), 2);
});

test('rotating inbound address preserves existing applications and history', async (t) => {
  const { db, stop } = await startServerWithEnv({
    NODE_ENV: 'test',
    JOBTRACK_DB_PATH: ':memory:',
    JOBTRACK_LOG_LEVEL: 'error',
    INBOUND_DOMAIN: 'mail.applictus.com'
  });
  t.after(stop);
  if (!db) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }

  const userId = crypto.randomUUID();
  await createUser(db, { id: userId, email: `rotate-preserve-${Date.now()}@example.com` });
  const oldAddress = await getOrCreateInboundAddress(db, userId, {
    inboundDomain: 'mail.applictus.com'
  });
  const appId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const now = new Date().toISOString();
  await awaitMaybe(
    db
      .prepare(
        `INSERT INTO job_applications
         (id, user_id, company, role, status, status_updated_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(appId, userId, 'Example Company', 'Product Manager', 'applied', now, now, now)
  );
  await awaitMaybe(
    db
      .prepare(
        `INSERT INTO email_events
         (id, user_id, application_id, provider, message_id, subject_snippet, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(eventId, userId, appId, 'postmark', `event-${Date.now()}@example.com`, 'Application received', now)
  );

  const newAddress = await rotateInboundAddress(db, userId, {
    inboundDomain: 'mail.applictus.com'
  });
  assert.notEqual(newAddress.address_email, oldAddress.address_email);

  const oldRow = await awaitMaybe(
    db.prepare('SELECT is_active, status FROM inbound_addresses WHERE id = ?').get(oldAddress.id)
  );
  assert.equal(Number(oldRow.is_active), 0);
  assert.equal(oldRow.status, 'rotated');

  const appCount = await awaitMaybe(
    db.prepare('SELECT COUNT(*) AS count FROM job_applications WHERE user_id = ?').get(userId)
  );
  const eventCount = await awaitMaybe(
    db.prepare('SELECT COUNT(*) AS count FROM email_events WHERE user_id = ? AND application_id = ?').get(userId, appId)
  );
  assert.equal(Number(appCount.count), 1);
  assert.equal(Number(eventCount.count), 1);
});
