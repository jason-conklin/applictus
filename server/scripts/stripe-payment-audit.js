#!/usr/bin/env node

require('dotenv').config();

const path = require('path');

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const PAYMENT_INTENT_ID = String(process.argv[2] || process.env.STRIPE_PAYMENT_INTENT_ID || '').trim();

function usage() {
  console.error('Usage: node server/scripts/stripe-payment-audit.js pi_...');
}

function toIsoFromUnix(seconds) {
  const value = Number(seconds);
  return Number.isFinite(value) && value > 0 ? new Date(value * 1000).toISOString() : null;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function compactObject(value) {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined && entryValue !== null && entryValue !== '')
  );
}

async function stripeGet(pathname, params = null) {
  const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secret) {
    throw new Error('STRIPE_SECRET_KEY is required');
  }
  const url = new URL(`${STRIPE_API_BASE}${pathname}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${secret}`
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(body?.error?.message || `Stripe request failed (${response.status})`);
    err.status = response.status;
    err.body = body;
    throw err;
  }
  return body;
}

async function findMatchingEvents({ paymentIntentId, sessionId }) {
  const targets = new Set([paymentIntentId, sessionId].filter(Boolean));
  const matches = [];
  for (const type of ['checkout.session.completed', 'payment_intent.succeeded']) {
    const events = await stripeGet('/events', { type, limit: 100 });
    for (const event of events?.data || []) {
      const object = event?.data?.object || {};
      if (targets.has(object.id) || targets.has(object.payment_intent)) {
        matches.push({
          id: event.id,
          type: event.type,
          created_at: toIsoFromUnix(event.created),
          livemode: Boolean(event.livemode),
          pending_webhooks: event.pending_webhooks,
          object_id: object.id || null,
          payment_intent: object.payment_intent || null
        });
      }
    }
  }
  return matches;
}

function tryInspectLocalDb({ userId, email, customerId }) {
  try {
    const Database = require('better-sqlite3');
    const dbPath = process.env.JOBTRACK_DB_PATH || path.join(__dirname, '..', 'data', 'jobtrack.db');
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const params = [];
    const clauses = [];
    if (userId) {
      clauses.push('id = ?');
      params.push(userId);
    }
    if (email) {
      clauses.push('lower(email) = lower(?)');
      params.push(email);
    }
    if (customerId) {
      clauses.push('stripe_customer_id = ?');
      params.push(customerId);
    }
    if (!clauses.length) {
      return { checked: false, reason: 'No user id, email, or Stripe customer id to query.' };
    }
    const rows = db
      .prepare(
        `SELECT id, email, plan_tier, plan_status, billing_plan, billing_type, plan_expires_at,
                monthly_tracked_email_limit, monthly_inbound_email_limit,
                tracked_email_count_current_month, inbound_email_count_current_month,
                stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end,
                billing_last_event_id, billing_last_event_at, billing_failure_state
           FROM users
          WHERE ${clauses.join(' OR ')}
          ORDER BY updated_at DESC
          LIMIT 10`
      )
      .all(...params);
    db.close();
    return { checked: true, db_path: dbPath, rows };
  } catch (err) {
    return {
      checked: false,
      error: err?.message ? String(err.message).slice(0, 260) : String(err)
    };
  }
}

async function tryInspectPostgresDb({ userId, email, customerId }) {
  const databaseUrl = String(process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || process.env.SUPABASE_DB_URL || '').trim();
  if (!databaseUrl) {
    return { checked: false, reason: 'DATABASE_URL is not configured.' };
  }
  let pool = null;
  try {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
      max: 1,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      allowExitOnIdle: true
    });
    const params = [];
    const clauses = [];
    if (userId) {
      params.push(userId);
      clauses.push(`id = $${params.length}::uuid`);
    }
    if (email) {
      params.push(email);
      clauses.push(`lower(email) = lower($${params.length})`);
    }
    if (customerId) {
      params.push(customerId);
      clauses.push(`stripe_customer_id = $${params.length}`);
    }
    if (!clauses.length) {
      return { checked: false, reason: 'No user id, email, or Stripe customer id to query.' };
    }
    const users = await pool.query(
      `SELECT id, email, plan_tier, plan_status, billing_plan, billing_type, plan_expires_at,
              monthly_tracked_email_limit, monthly_inbound_email_limit,
              tracked_email_count_current_month, inbound_email_count_current_month,
              stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end,
              billing_last_event_id, billing_last_event_at, billing_failure_state
         FROM public.users
        WHERE ${clauses.join(' OR ')}
        ORDER BY updated_at DESC
        LIMIT 10`,
      params
    );
    const inboundAddresses =
      userId
        ? await pool.query(
            `SELECT id, user_id, address_local, address_email, is_active, created_at, rotated_at
               FROM public.inbound_addresses
              WHERE user_id = $1::uuid
              ORDER BY created_at DESC
              LIMIT 10`,
            [userId]
          )
        : { rows: [] };
    return {
      checked: true,
      users: users.rows,
      inbound_addresses: inboundAddresses.rows
    };
  } catch (err) {
    return {
      checked: false,
      error: err?.message ? String(err.message).slice(0, 260) : String(err)
    };
  } finally {
    if (pool) {
      await pool.end().catch(() => {});
    }
  }
}

async function main() {
  if (!PAYMENT_INTENT_ID) {
    usage();
    process.exitCode = 2;
    return;
  }

  const paymentIntent = await stripeGet(`/payment_intents/${encodeURIComponent(PAYMENT_INTENT_ID)}`);
  const sessions = await stripeGet('/checkout/sessions', {
    payment_intent: PAYMENT_INTENT_ID,
    limit: 10
  });
  const session = Array.isArray(sessions?.data) && sessions.data.length ? sessions.data[0] : null;
  const customerId = paymentIntent.customer || session?.customer || null;
  const customer = customerId ? await stripeGet(`/customers/${encodeURIComponent(customerId)}`).catch(() => null) : null;
  const metadata = {
    ...(paymentIntent.metadata || {}),
    ...(session?.metadata || {})
  };
  const userId = metadata.user_id || metadata.userId || session?.client_reference_id || null;
  const customerEmail =
    normalizeEmail(session?.customer_details?.email) ||
    normalizeEmail(session?.customer_email) ||
    normalizeEmail(customer?.email) ||
    normalizeEmail(paymentIntent.receipt_email) ||
    normalizeEmail(metadata.user_email);
  const events = await findMatchingEvents({
    paymentIntentId: PAYMENT_INTENT_ID,
    sessionId: session?.id || null
  });
  const localDb = tryInspectLocalDb({
    userId,
    email: customerEmail,
    customerId
  });
  const postgresDb = await tryInspectPostgresDb({
    userId,
    email: customerEmail,
    customerId
  });

  const summary = {
    payment_intent: compactObject({
      id: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      created_at: toIsoFromUnix(paymentIntent.created),
      customer: customerId,
      receipt_email: paymentIntent.receipt_email || null,
      metadata: paymentIntent.metadata || {}
    }),
    checkout_session: session
      ? compactObject({
          id: session.id,
          status: session.status,
          payment_status: session.payment_status,
          mode: session.mode,
          amount_total: session.amount_total,
          currency: session.currency,
          customer: session.customer || null,
          customer_email: customerEmail || null,
          client_reference_id: session.client_reference_id || null,
          payment_intent: session.payment_intent || null,
          metadata: session.metadata || {}
        })
      : null,
    customer: customer
      ? compactObject({
          id: customer.id,
          email: customer.email || null,
          name: customer.name || null
        })
      : null,
    matching_recent_events: events,
    postgres_db: postgresDb,
    local_db: localDb
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(
    JSON.stringify(
      {
        error: err?.message || String(err),
        status: err?.status || null
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
