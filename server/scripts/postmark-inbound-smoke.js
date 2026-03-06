require('dotenv').config();

const crypto = require('crypto');
const { openDb, migrate } = require('../src/db');
const { getOrCreateInboundAddress } = require('../src/inbound');

async function awaitMaybe(value) {
  return value && typeof value.then === 'function' ? await value : value;
}

function nowIso() {
  return new Date().toISOString();
}

async function ensureUser(db, { userId, email, name }) {
  const existingById = userId
    ? await awaitMaybe(db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(userId))
    : null;
  if (existingById) {
    return existingById;
  }

  const existingByEmail = await awaitMaybe(
    db.prepare('SELECT id, email, name FROM users WHERE email = ?').get(email)
  );
  if (existingByEmail) {
    return existingByEmail;
  }

  const id = userId || crypto.randomUUID();
  const createdAt = nowIso();
  await awaitMaybe(
    db
      .prepare(
        `INSERT INTO users (id, email, name, auth_provider, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, email, name || null, 'password', createdAt, createdAt)
  );
  return { id, email, name };
}

async function postSampleWebhook({ baseUrl, secret, toEmail }) {
  const payload = {
    From: 'Recruiter Team <jobs@example-company.com>',
    FromFull: { Name: 'Recruiter Team', Email: 'jobs@example-company.com' },
    To: toEmail,
    ToFull: [{ Email: toEmail }],
    Subject: 'Application update for Software Engineer',
    MessageID: `<postmark-smoke-${Date.now()}@example-company.com>`,
    Date: new Date().toISOString(),
    TextBody: 'Thanks for applying to Example Company. We would like to schedule an interview.',
    HtmlBody:
      '<p>Thanks for applying to Example Company.</p><p>We would like to schedule an interview.</p>',
    Headers: [{ Name: 'Message-ID', Value: `<rfc-smoke-${Date.now()}@example-company.com>` }]
  };

  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/inbound/postmark`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-applictus-inbound-secret': secret
    },
    body: JSON.stringify(payload)
  });
  const body = await response.text();
  return { status: response.status, body };
}

async function main() {
  const db = openDb();
  migrate(db);

  const userId = process.env.POSTMARK_SMOKE_USER_ID || null;
  const userEmail = process.env.POSTMARK_SMOKE_USER_EMAIL || `inbound-smoke-${Date.now()}@example.com`;
  const userName = process.env.POSTMARK_SMOKE_USER_NAME || 'Inbound Smoke';

  try {
    const user = await ensureUser(db, {
      userId,
      email: userEmail,
      name: userName
    });
    const address = await getOrCreateInboundAddress(db, user.id, {
      inboundDomain: process.env.INBOUND_DOMAIN
    });

    // eslint-disable-next-line no-console
    console.log('[postmark-smoke] user', user);
    // eslint-disable-next-line no-console
    console.log('[postmark-smoke] inbound address', address.address_email);

    if (process.env.POSTMARK_SMOKE_SEND === '1') {
      const secret = String(process.env.POSTMARK_INBOUND_SECRET || '').trim();
      if (!secret) {
        throw new Error('POSTMARK_INBOUND_SECRET is required when POSTMARK_SMOKE_SEND=1');
      }
      const baseUrl = process.env.APP_API_BASE_URL || 'http://localhost:3000';
      const result = await postSampleWebhook({
        baseUrl,
        secret,
        toEmail: address.address_email
      });
      // eslint-disable-next-line no-console
      console.log('[postmark-smoke] webhook response', result);
    } else {
      // eslint-disable-next-line no-console
      console.log('[postmark-smoke] POSTMARK_SMOKE_SEND is not enabled; skipped webhook POST.');
    }
  } finally {
    if (db && typeof db.close === 'function') {
      await awaitMaybe(db.close());
    }
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[postmark-smoke] failed:', err && err.message ? err.message : err);
  process.exit(1);
});
