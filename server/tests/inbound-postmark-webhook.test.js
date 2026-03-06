const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { getOrCreateInboundAddress } = require('../src/inbound');

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

function buildPayload(toEmail) {
  return {
    From: 'Recruiting Team <jobs@example-company.com>',
    FromFull: { Name: 'Recruiting Team', Email: 'jobs@example-company.com' },
    To: toEmail,
    ToFull: [{ Email: toEmail }],
    Subject: 'Thanks for applying to Example Company',
    MessageID: `<postmark-${Date.now()}@example-company.com>`,
    Date: '2026-03-05T15:30:00.000Z',
    TextBody: 'Your application was received. We will review your resume shortly.',
    HtmlBody:
      '<p>Your application was received.</p><p>We will review your resume shortly.</p>',
    Headers: [{ Name: 'Message-ID', Value: `<rfc-${Date.now()}@example-company.com>` }]
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

  const first = await fetch(`${baseUrl}/api/inbound/postmark`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-applictus-inbound-secret': 'test-inbound-secret'
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

test('postmark webhook returns 202 for unmapped recipient and 401 for invalid secret', async (t) => {
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
      'Content-Type': 'application/json',
      'x-applictus-inbound-secret': 'test-inbound-secret'
    },
    body: JSON.stringify(payload)
  });
  const unmappedBody = await unmapped.json();
  assert.equal(unmapped.status, 202);
  assert.equal(unmappedBody.ok, true);
  assert.equal(unmappedBody.ignored, true);
});
