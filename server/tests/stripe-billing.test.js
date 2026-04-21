const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.NODE_ENV = 'test';
process.env.JOBTRACK_DB_PATH = ':memory:';
process.env.JOBTRACK_LOG_LEVEL = 'error';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_123';
process.env.STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_123';
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_123';
process.env.STRIPE_PRICE_ID_PRO_MONTHLY = process.env.STRIPE_PRICE_ID_PRO_MONTHLY || 'price_pro_monthly_test';
process.env.STRIPE_PRICE_ID_JOB_SEARCH = process.env.STRIPE_PRICE_ID_JOB_SEARCH || 'price_job_search_test';

const {
  BILLING_OPTIONS,
  createCheckoutSession,
  constructWebhookEvent,
  computeJobSearchPlanExpiration
} = require('../src/stripeBilling');

let startServer = null;
let stopServer = null;
let db = null;
try {
  const runtime = require('../src/index');
  startServer = runtime.startServer;
  stopServer = runtime.stopServer;
  db = runtime.db;
} catch (err) {
  const message = String(err && err.message ? err.message : err);
  const nativeFailure = /better-sqlite3|invalid ELF header|SQLITE_NATIVE_(OPEN|LOAD)_FAILED/i.test(message);
  if (!nativeFailure) {
    throw err;
  }
}

function buildBaseUrl(server) {
  const address = server.address();
  const port = address && typeof address === 'object' ? address.port : 3000;
  return `http://127.0.0.1:${port}`;
}

function signStripePayload(payload, secret, timestamp) {
  const raw = JSON.stringify(payload);
  const signed = `${timestamp}.${raw}`;
  const v1 = crypto.createHmac('sha256', secret).update(signed, 'utf8').digest('hex');
  return {
    raw,
    header: `t=${timestamp},v1=${v1}`
  };
}

function insertUser({ email, tier = 'free', status = 'active', billingPlan = 'free', billingType = 'none' }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const limit = tier === 'pro' ? 500 : 50;
  db.prepare(
    `INSERT INTO users (
      id, email, name, created_at, updated_at,
      plan_tier, plan_status, billing_plan, billing_type,
      monthly_tracked_email_limit, tracked_email_count_current_month, tracked_email_month_bucket
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, strftime('%Y-%m','now'))`
  ).run(id, email, 'Stripe Test User', now, now, tier, status, billingPlan, billingType, limit);
  return id;
}

function getUser(id) {
  return db
    .prepare(
      `SELECT id, email, plan_tier, plan_status, billing_plan, billing_type, plan_expires_at,
              stripe_customer_id, stripe_subscription_id, billing_failure_state,
              billing_last_event_id, billing_last_event_at,
              subscription_status, current_period_end, cancel_at_period_end
         FROM users
        WHERE id = ?`
    )
    .get(id);
}

function parseSetCookieHeaders(response) {
  if (!response || !response.headers) {
    return [];
  }
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }
  if (typeof response.headers.raw === 'function') {
    const raw = response.headers.raw()['set-cookie'];
    return Array.isArray(raw) ? raw : [];
  }
  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}

function createAuthedClient(baseUrl) {
  const cookieJar = new Map();
  let csrfToken = '';

  function ingestCookies(response) {
    const setCookies = parseSetCookieHeaders(response);
    setCookies.forEach((cookie) => {
      const pair = String(cookie || '').split(';')[0];
      if (!pair.includes('=')) {
        return;
      }
      const [name, ...rest] = pair.split('=');
      if (!name) {
        return;
      }
      cookieJar.set(name.trim(), `${name.trim()}=${rest.join('=').trim()}`);
    });
  }

  function cookieHeader() {
    const values = Array.from(cookieJar.values());
    return values.length ? values.join('; ') : '';
  }

  async function refreshCsrf() {
    const cookie = cookieHeader();
    const response = await fetch(`${baseUrl}/api/auth/csrf`, {
      headers: cookie ? { Cookie: cookie } : {}
    });
    ingestCookies(response);
    const body = await response.json();
    csrfToken = body.csrfToken || '';
    return body;
  }

  async function request(pathname, { method = 'GET', body, headers = {} } = {}) {
    const upperMethod = String(method || 'GET').toUpperCase();
    const cookie = cookieHeader();
    const outboundHeaders = {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(upperMethod !== 'GET' && upperMethod !== 'HEAD' && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...headers
    };
    const response = await fetch(`${baseUrl}${pathname}`, {
      method: upperMethod,
      headers: outboundHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    ingestCookies(response);
    const json = await response.json().catch(() => ({}));
    if (pathname === '/api/auth/signup' || pathname === '/api/auth/login') {
      await refreshCsrf();
    }
    return { status: response.status, body: json, response };
  }

  return { refreshCsrf, request };
}

async function postWebhook(baseUrl, payload, timestamp) {
  const { raw, header } = signStripePayload(payload, process.env.STRIPE_WEBHOOK_SECRET, timestamp);
  const response = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': header
    },
    body: raw
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

test('createCheckoutSession creates monthly subscription checkout payload', async () => {
  let captured = null;
  const fakeFetch = async (_url, options = {}) => {
    captured = String(options.body || '');
    return {
      ok: true,
      json: async () => ({ id: 'cs_test_monthly', url: 'https://checkout.stripe.com/c/pay/cs_test_monthly' })
    };
  };

  const result = await createCheckoutSession({
    stripeSecretKey: 'sk_test_123',
    planKey: BILLING_OPTIONS.PRO_MONTHLY,
    mode: 'subscription',
    priceId: 'price_pro_monthly_test',
    userId: 'user-monthly',
    userEmail: 'monthly@example.com',
    successUrl: 'https://applictus.com/app?billing=success#dashboard',
    cancelUrl: 'https://applictus.com/app?billing=cancel#dashboard',
    fetchImpl: fakeFetch
  });

  const params = new URLSearchParams(captured);
  assert.equal(params.get('mode'), 'subscription');
  assert.equal(params.get('line_items[0][price]'), 'price_pro_monthly_test');
  assert.equal(params.get('metadata[plan_key]'), 'pro_monthly');
  assert.equal(params.get('subscription_data[metadata][plan_key]'), 'pro_monthly');
  assert.equal(result.id, 'cs_test_monthly');
  assert.match(result.url, /^https:\/\/checkout\.stripe\.com\//);
});

test('createCheckoutSession creates one-time job search checkout payload', async () => {
  let captured = null;
  const fakeFetch = async (_url, options = {}) => {
    captured = String(options.body || '');
    return {
      ok: true,
      json: async () => ({ id: 'cs_test_jobsearch', url: 'https://checkout.stripe.com/c/pay/cs_test_jobsearch' })
    };
  };

  const result = await createCheckoutSession({
    stripeSecretKey: 'sk_test_123',
    planKey: BILLING_OPTIONS.JOB_SEARCH_PLAN,
    mode: 'payment',
    priceId: 'price_job_search_test',
    userId: 'user-jobsearch',
    userEmail: 'jobsearch@example.com',
    successUrl: 'https://applictus.com/app?billing=success#dashboard',
    cancelUrl: 'https://applictus.com/app?billing=cancel#dashboard',
    fetchImpl: fakeFetch
  });

  const params = new URLSearchParams(captured);
  assert.equal(params.get('mode'), 'payment');
  assert.equal(params.get('line_items[0][price]'), 'price_job_search_test');
  assert.equal(params.get('metadata[plan_key]'), 'job_search_plan');
  assert.equal(params.get('payment_intent_data[metadata][plan_key]'), 'job_search_plan');
  assert.equal(result.id, 'cs_test_jobsearch');
  assert.match(result.url, /^https:\/\/checkout\.stripe\.com\//);
});

test('constructWebhookEvent validates stripe signature', () => {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = {
    id: 'evt_sig_test',
    type: 'checkout.session.completed',
    created: timestamp,
    data: { object: { id: 'cs_sig_test' } }
  };
  const signed = signStripePayload(payload, process.env.STRIPE_WEBHOOK_SECRET, timestamp);
  const event = constructWebhookEvent({
    rawBody: signed.raw,
    signatureHeader: signed.header,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    nowMs: timestamp * 1000
  });
  assert.equal(event.id, 'evt_sig_test');
});

test('billing checkout route creates monthly and one-time Stripe sessions for authenticated users', async (t) => {
  if (!startServer || !stopServer || !db) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }

  const server = await startServer(0, { log: false, host: '127.0.0.1' });
  const baseUrl = buildBaseUrl(server);
  t.after(async () => {
    await stopServer();
  });

  const client = createAuthedClient(baseUrl);
  await client.refreshCsrf();
  const signup = await client.request('/api/auth/signup', {
    method: 'POST',
    body: {
      email: `billing-route-${crypto.randomUUID()}@example.com`,
      password: 'StrongPass123!',
      name: 'Billing Route User'
    }
  });
  assert.equal(signup.status, 200);

  const originalFetch = global.fetch;
  const stripeBodies = [];
  global.fetch = async (url, options = {}) => {
    const target = String(url || '');
    if (target === 'https://api.stripe.com/v1/checkout/sessions') {
      const requestBody = String(options.body || '');
      stripeBodies.push(requestBody);
      const params = new URLSearchParams(requestBody);
      const mode = params.get('mode') || 'payment';
      const suffix = mode === 'subscription' ? 'monthly' : 'jobsearch';
      return {
        ok: true,
        json: async () => ({
          id: `cs_route_${suffix}_${stripeBodies.length}`,
          url: `https://checkout.stripe.com/c/pay/cs_route_${suffix}_${stripeBodies.length}`
        })
      };
    }
    return originalFetch(url, options);
  };

  try {
    const monthly = await client.request('/api/billing/create-checkout-session', {
      method: 'POST',
      body: { plan: 'pro_monthly' }
    });
    assert.equal(monthly.status, 200);
    assert.equal(monthly.body.plan_key, 'pro_monthly');
    assert.match(String(monthly.body.checkout_url || ''), /^https:\/\/checkout\.stripe\.com\//);

    const oneTime = await client.request('/api/billing/create-checkout-session', {
      method: 'POST',
      body: { plan: 'job_search_plan' }
    });
    assert.equal(oneTime.status, 200);
    assert.equal(oneTime.body.plan_key, 'job_search_plan');
    assert.match(String(oneTime.body.checkout_url || ''), /^https:\/\/checkout\.stripe\.com\//);

    assert.equal(stripeBodies.length, 2);
    const monthlyParams = new URLSearchParams(stripeBodies[0]);
    const oneTimeParams = new URLSearchParams(stripeBodies[1]);
    assert.equal(monthlyParams.get('mode'), 'subscription');
    assert.equal(monthlyParams.get('line_items[0][price]'), process.env.STRIPE_PRICE_ID_PRO_MONTHLY);
    assert.equal(monthlyParams.get('metadata[plan_key]'), 'pro_monthly');
    assert.equal(oneTimeParams.get('mode'), 'payment');
    assert.equal(oneTimeParams.get('line_items[0][price]'), process.env.STRIPE_PRICE_ID_JOB_SEARCH);
    assert.equal(oneTimeParams.get('metadata[plan_key]'), 'job_search_plan');
  } finally {
    global.fetch = originalFetch;
  }
});

test('billing cancel subscription schedules cancel_at_period_end and preserves Pro until period end', async (t) => {
  if (!startServer || !stopServer || !db) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }

  const server = await startServer(0, { log: false, host: '127.0.0.1' });
  const baseUrl = buildBaseUrl(server);
  t.after(async () => {
    await stopServer();
  });

  const client = createAuthedClient(baseUrl);
  await client.refreshCsrf();
  const signup = await client.request('/api/auth/signup', {
    method: 'POST',
    body: {
      email: `billing-cancel-${crypto.randomUUID()}@example.com`,
      password: 'StrongPass123!',
      name: 'Billing Cancel User'
    }
  });
  assert.equal(signup.status, 200);
  const userId = signup.body?.user?.id;
  assert.ok(userId);

  const nowIso = new Date().toISOString();
  db.prepare(
    `UPDATE users
        SET plan_tier = 'pro',
            plan_status = 'active',
            billing_plan = 'pro_monthly',
            billing_type = 'subscription',
            stripe_customer_id = ?,
            stripe_subscription_id = ?,
            monthly_tracked_email_limit = 500,
            monthly_inbound_email_limit = 3000,
            cancel_at_period_end = 0,
            subscription_status = 'active',
            updated_at = ?
      WHERE id = ?`
  ).run('cus_cancel_route_1', 'sub_cancel_route_1', nowIso, userId);

  const stripePeriodEnd = Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60;
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const target = String(url || '');
    if (target.endsWith('/v1/subscriptions/sub_cancel_route_1')) {
      const body = String(options.body || '');
      const params = new URLSearchParams(body);
      assert.equal(params.get('cancel_at_period_end'), 'true');
      return {
        ok: true,
        json: async () => ({
          id: 'sub_cancel_route_1',
          customer: 'cus_cancel_route_1',
          status: 'active',
          cancel_at_period_end: true,
          current_period_end: stripePeriodEnd
        })
      };
    }
    return originalFetch(url, options);
  };

  try {
    const cancelRes = await client.request('/api/billing/cancel-subscription', {
      method: 'POST',
      body: {}
    });
    assert.equal(cancelRes.status, 200);
    assert.equal(Boolean(cancelRes.body.cancel_at_period_end), true);
    assert.equal(String(cancelRes.body.subscription_status || ''), 'active');
    assert.ok(cancelRes.body.current_period_end);
  } finally {
    global.fetch = originalFetch;
  }

  const user = getUser(userId);
  assert.equal(String(user.plan_tier || '').toLowerCase(), 'pro');
  assert.equal(String(user.billing_plan || '').toLowerCase(), 'pro_monthly');
  assert.equal(String(user.subscription_status || '').toLowerCase(), 'active');
  assert.equal(Boolean(user.cancel_at_period_end), true);
  assert.ok(user.current_period_end);
});

test('billing webhook lifecycle updates plans and stays idempotent', async (t) => {
  if (!startServer || !stopServer || !db) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }
  const server = await startServer(0, { log: false, host: '127.0.0.1' });
  const baseUrl = buildBaseUrl(server);
  t.after(async () => {
    await stopServer();
  });

  const nowSec = Math.floor(Date.now() / 1000);

  await t.test('checkout.session.completed activates monthly pro', async () => {
    const userId = insertUser({ email: `stripe-monthly-${crypto.randomUUID()}@example.com` });
    const event = {
      id: `evt_monthly_checkout_${crypto.randomUUID()}`,
      type: 'checkout.session.completed',
      created: nowSec + 1,
      data: {
        object: {
          id: 'cs_monthly_1',
          mode: 'subscription',
          customer: 'cus_monthly_1',
          subscription: 'sub_monthly_1',
          metadata: {
            user_id: userId,
            plan_key: 'pro_monthly'
          }
        }
      }
    };

    const first = await postWebhook(baseUrl, event, event.created);
    assert.equal(first.status, 200);

    const user = getUser(userId);
    assert.equal(String(user.plan_tier || '').toLowerCase(), 'pro');
    assert.equal(String(user.billing_plan || '').toLowerCase(), 'pro_monthly');
    assert.equal(String(user.billing_type || '').toLowerCase(), 'subscription');
    assert.equal(user.stripe_customer_id, 'cus_monthly_1');
    assert.equal(user.stripe_subscription_id, 'sub_monthly_1');

    const replay = await postWebhook(baseUrl, event, event.created);
    assert.equal(replay.status, 200);
    assert.equal(Boolean(replay.body.duplicate), true);

    const replayUser = getUser(userId);
    assert.equal(replayUser.billing_last_event_id, event.id);
  });

  await t.test('invoice.payment_failed marks recoverable billing failure for monthly users', async () => {
    const userId = insertUser({
      email: `stripe-failed-${crypto.randomUUID()}@example.com`,
      tier: 'pro',
      status: 'active',
      billingPlan: 'pro_monthly',
      billingType: 'subscription'
    });
    db.prepare('UPDATE users SET stripe_customer_id = ?, stripe_subscription_id = ? WHERE id = ?').run(
      'cus_failed_1',
      'sub_failed_1',
      userId
    );
    const event = {
      id: `evt_invoice_failed_${crypto.randomUUID()}`,
      type: 'invoice.payment_failed',
      created: nowSec + 2,
      data: {
        object: {
          id: 'in_failed_1',
          customer: 'cus_failed_1',
          subscription: 'sub_failed_1'
        }
      }
    };
    const result = await postWebhook(baseUrl, event, event.created);
    assert.equal(result.status, 200);
    const user = getUser(userId);
    assert.equal(String(user.plan_tier || '').toLowerCase(), 'pro');
    assert.equal(String(user.billing_failure_state || '').toLowerCase(), 'payment_failed');
  });

  await t.test('customer.subscription.deleted downgrades recurring monthly users', async () => {
    const userId = insertUser({
      email: `stripe-cancel-${crypto.randomUUID()}@example.com`,
      tier: 'pro',
      status: 'active',
      billingPlan: 'pro_monthly',
      billingType: 'subscription'
    });
    db.prepare('UPDATE users SET stripe_customer_id = ?, stripe_subscription_id = ? WHERE id = ?').run(
      'cus_cancel_1',
      'sub_cancel_1',
      userId
    );
    const event = {
      id: `evt_sub_deleted_${crypto.randomUUID()}`,
      type: 'customer.subscription.deleted',
      created: nowSec + 3,
      data: {
        object: {
          id: 'sub_cancel_1',
          customer: 'cus_cancel_1'
        }
      }
    };
    const result = await postWebhook(baseUrl, event, event.created);
    assert.equal(result.status, 200);
    const user = getUser(userId);
    assert.equal(String(user.plan_tier || '').toLowerCase(), 'free');
    assert.equal(String(user.billing_plan || '').toLowerCase(), 'free');
    assert.equal(String(user.billing_type || '').toLowerCase(), 'none');
    assert.equal(user.stripe_subscription_id, null);
  });

  await t.test('checkout.session.completed activates one-time job search plan for 90 days', async () => {
    const userId = insertUser({ email: `stripe-onetime-${crypto.randomUUID()}@example.com` });
    const event = {
      id: `evt_onetime_checkout_${crypto.randomUUID()}`,
      type: 'checkout.session.completed',
      created: nowSec + 4,
      data: {
        object: {
          id: 'cs_onetime_1',
          mode: 'payment',
          customer: 'cus_onetime_1',
          metadata: {
            user_id: userId,
            plan_key: 'job_search_plan'
          }
        }
      }
    };
    const result = await postWebhook(baseUrl, event, event.created);
    assert.equal(result.status, 200);
    const user = getUser(userId);
    assert.equal(String(user.plan_tier || '').toLowerCase(), 'pro');
    assert.equal(String(user.billing_plan || '').toLowerCase(), 'job_search_plan');
    assert.equal(String(user.billing_type || '').toLowerCase(), 'one_time');
    assert.equal(user.stripe_customer_id, 'cus_onetime_1');
    assert.equal(user.stripe_subscription_id, null);
    assert.ok(user.plan_expires_at);

    const minExpected = new Date(computeJobSearchPlanExpiration({ now: new Date(event.created * 1000), days: 89 }))
      .getTime();
    const actualExpiry = new Date(user.plan_expires_at).getTime();
    assert.ok(actualExpiry >= minExpected);
  });

  await t.test('customer.subscription.deleted does not remove active one-time job search access', async () => {
    const userId = insertUser({
      email: `stripe-onetime-keep-${crypto.randomUUID()}@example.com`,
      tier: 'pro',
      status: 'active',
      billingPlan: 'job_search_plan',
      billingType: 'one_time'
    });
    const futureExpiry = computeJobSearchPlanExpiration({ now: new Date(), days: 90 });
    db.prepare('UPDATE users SET stripe_customer_id = ?, stripe_subscription_id = ?, plan_expires_at = ? WHERE id = ?')
      .run('cus_onetime_keep', 'sub_legacy_keep', futureExpiry, userId);

    const event = {
      id: `evt_sub_deleted_onetime_${crypto.randomUUID()}`,
      type: 'customer.subscription.deleted',
      created: nowSec + 5,
      data: {
        object: {
          id: 'sub_legacy_keep',
          customer: 'cus_onetime_keep'
        }
      }
    };
    const result = await postWebhook(baseUrl, event, event.created);
    assert.equal(result.status, 200);
    const user = getUser(userId);
    assert.equal(String(user.plan_tier || '').toLowerCase(), 'pro');
    assert.equal(String(user.billing_plan || '').toLowerCase(), 'job_search_plan');
    assert.equal(String(user.billing_type || '').toLowerCase(), 'one_time');
    assert.equal(user.stripe_subscription_id, null);
  });
});
