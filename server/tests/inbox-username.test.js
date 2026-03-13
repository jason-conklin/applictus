const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { validateInboxUsername } = require('../src/inboxUsername');

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

test('validateInboxUsername accepts valid values and rejects invalid/reserved values', () => {
  assert.equal(validateInboxUsername('jason-conklin', { allowEmpty: false }).ok, true);
  assert.equal(validateInboxUsername('abc', { allowEmpty: false }).ok, true);
  assert.equal(validateInboxUsername('  Jason-Conklin  ', { allowEmpty: false }).value, 'jason-conklin');
  assert.equal(validateInboxUsername('ab', { allowEmpty: false }).ok, false);
  assert.equal(validateInboxUsername('jason--conklin', { allowEmpty: false }).code, 'INBOX_USERNAME_INVALID');
  assert.equal(validateInboxUsername('-jason', { allowEmpty: false }).code, 'INBOX_USERNAME_INVALID');
  assert.equal(validateInboxUsername('admin', { allowEmpty: false }).code, 'INBOX_USERNAME_RESERVED');
});

test('signup with inbox username creates human-readable forwarding address', async (t) => {
  const { baseUrl, stop } = await startServerWithEnv({
    NODE_ENV: 'test',
    JOBTRACK_DB_PATH: ':memory:',
    JOBTRACK_LOG_LEVEL: 'error',
    INBOUND_DOMAIN: 'mail.applictus.com'
  });
  t.after(stop);
  if (!baseUrl) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }

  const request = await createClient(baseUrl);
  const email = `human-${crypto.randomUUID()}@example.com`;
  const signup = await request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password: 'StrongPassword123!',
      inbox_username: 'JasonConklin'
    })
  });
  assert.equal(signup.status, 200);
  assert.equal(signup.body.user.inbox_username, 'jasonconklin');

  const inbound = await request('/api/inbound/address');
  assert.equal(inbound.status, 200);
  assert.equal(inbound.body.address_email, 'jasonconklin@mail.applictus.com');
  assert.equal(inbound.body.inbox_username, 'jasonconklin');
});

test('reserved and duplicate inbox usernames are rejected', async (t) => {
  const { baseUrl, stop } = await startServerWithEnv({
    NODE_ENV: 'test',
    JOBTRACK_DB_PATH: ':memory:',
    JOBTRACK_LOG_LEVEL: 'error',
    INBOUND_DOMAIN: 'mail.applictus.com'
  });
  t.after(stop);
  if (!baseUrl) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }

  const firstClient = await createClient(baseUrl);
  const firstSignup = await firstClient('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: `first-${crypto.randomUUID()}@example.com`,
      password: 'StrongPassword123!',
      inbox_username: 'clean-user'
    })
  });
  assert.equal(firstSignup.status, 200);

  const secondClient = await createClient(baseUrl);
  const duplicate = await secondClient('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: `second-${crypto.randomUUID()}@example.com`,
      password: 'StrongPassword123!',
      inbox_username: 'clean-user'
    })
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error, 'INBOX_USERNAME_TAKEN');

  const reserved = await secondClient('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: `third-${crypto.randomUUID()}@example.com`,
      password: 'StrongPassword123!',
      inbox_username: 'admin'
    })
  });
  assert.equal(reserved.status, 400);
  assert.equal(reserved.body.error, 'INBOX_USERNAME_RESERVED');
});

test('username signup rejects collisions with existing inbound address aliases', async (t) => {
  const { baseUrl, db, stop } = await startServerWithEnv({
    NODE_ENV: 'test',
    JOBTRACK_DB_PATH: ':memory:',
    JOBTRACK_LOG_LEVEL: 'error',
    INBOUND_DOMAIN: 'mail.applictus.com'
  });
  t.after(stop);
  if (!baseUrl || !db) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }

  const firstClient = await createClient(baseUrl);
  const firstSignup = await firstClient('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: `alias-owner-${crypto.randomUUID()}@example.com`,
      password: 'StrongPassword123!'
    })
  });
  assert.equal(firstSignup.status, 200);
  const ownerId = firstSignup.body.user.id;

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO inbound_addresses (id, user_id, address_local, address_email, is_active, created_at, rotated_at, confirmed_at, last_received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    ownerId,
    'collision-alias',
    'collision-alias@mail.applictus.com',
    1,
    now,
    null,
    null,
    null
  );

  const secondClient = await createClient(baseUrl);
  const blockedSignup = await secondClient('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: `alias-conflict-${crypto.randomUUID()}@example.com`,
      password: 'StrongPassword123!',
      inbox_username: 'Collision-Alias'
    })
  });
  assert.equal(blockedSignup.status, 409);
  assert.equal(blockedSignup.body.error, 'INBOX_USERNAME_TAKEN');
});

test('existing user fallback random address keeps legacy alias and blocks username changes after first set', async (t) => {
  const { baseUrl, db, stop } = await startServerWithEnv({
    NODE_ENV: 'test',
    JOBTRACK_DB_PATH: ':memory:',
    JOBTRACK_LOG_LEVEL: 'error',
    INBOUND_DOMAIN: 'mail.applictus.com'
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
      email: `fallback-${crypto.randomUUID()}@example.com`,
      password: 'StrongPassword123!'
    })
  });
  assert.equal(signup.status, 200);
  const userId = signup.body.user.id;

  const initialAddress = await request('/api/inbound/address');
  assert.equal(initialAddress.status, 200);
  assert.match(initialAddress.body.address_email, /^u_[a-f0-9]{20}@mail\.applictus\.com$/);
  const oldAddress = initialAddress.body.address_email;

  const setUsername = await request('/api/account/inbox-username', {
    method: 'POST',
    body: JSON.stringify({ inbox_username: 'clean-alias' })
  });
  assert.equal(setUsername.status, 200);
  assert.equal(setUsername.body.user.inbox_username, 'clean-alias');
  assert.equal(setUsername.body.inbound_status.address_email, 'clean-alias@mail.applictus.com');

  const rows = db
    .prepare(
      `SELECT address_email, is_active
       FROM inbound_addresses
       WHERE user_id = ?
       ORDER BY created_at ASC`
    )
    .all(userId);
  assert.equal(rows.length >= 2, true);
  const oldRow = rows.find((row) => row.address_email === oldAddress);
  const newRow = rows.find((row) => row.address_email === 'clean-alias@mail.applictus.com');
  assert.ok(oldRow);
  assert.ok(newRow);
  assert.equal(Number(oldRow.is_active), 1);
  assert.equal(Number(newRow.is_active), 1);

  const attemptedChange = await request('/api/account/inbox-username', {
    method: 'POST',
    body: JSON.stringify({ inbox_username: 'second-alias' })
  });
  assert.equal(attemptedChange.status, 409);
  assert.equal(attemptedChange.body.error, 'INBOX_USERNAME_IMMUTABLE');

  const afterRows = db
    .prepare(
      `SELECT address_email, is_active
       FROM inbound_addresses
       WHERE user_id = ?
       ORDER BY created_at ASC`
    )
    .all(userId);
  assert.equal(afterRows.length, rows.length);
  const originalAlias = afterRows.find((row) => row.address_email === oldAddress);
  assert.ok(originalAlias);
  assert.equal(Number(originalAlias.is_active), 1);
});
