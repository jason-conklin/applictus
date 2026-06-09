const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

function requireFreshServer() {
  delete require.cache[require.resolve('../src/index')];
  delete require.cache[require.resolve('../src/app')];
  delete require.cache[require.resolve('../src/analyticsEvents')];
  return require('../src/index');
}

async function startServerWithEnv(envOverrides = {}) {
  const envBackup = { ...process.env };
  const restoreEnv = () => {
    for (const key of Object.keys(process.env)) {
      if (!Object.prototype.hasOwnProperty.call(envBackup, key)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, envBackup);
  };
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
        restoreEnv();
      }
    };
  } catch (err) {
    restoreEnv();
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

  function updateCookies(res) {
    const setCookies = res.headers.getSetCookie
      ? res.headers.getSetCookie()
      : res.headers.get('set-cookie')
      ? [res.headers.get('set-cookie')]
      : [];
    for (const entry of setCookies) {
      const value = entry.split(';')[0];
      const name = value.split('=')[0];
      if (name) cookieJar.set(name, value);
    }
  }

  function cookieHeader() {
    return Array.from(cookieJar.values()).join('; ');
  }

  async function refreshCsrf() {
    const res = await fetch(`${baseUrl}/api/auth/csrf`, {
      headers: cookieHeader() ? { Cookie: cookieHeader() } : {}
    });
    updateCookies(res);
    const body = await res.json().catch(() => ({}));
    csrf = body.csrfToken || '';
  }

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

async function postPublicEvent(baseUrl, payload) {
  const res = await fetch(`${baseUrl}/api/analytics/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return {
    status: res.status,
    body: await res.json().catch(() => ({}))
  };
}

test('traffic source classifier recognizes social, search, paid, direct, and unknown traffic', () => {
  const { classifyTrafficSource } = require('../src/analyticsEvents');
  const cases = [
    ['direct', { referrer: '' }, 'direct'],
    ['google organic referrer', { referrer: 'https://www.google.com/search?q=applictus' }, 'google_search'],
    ['google ads click id', { path: '/?gclid=test-click-id' }, 'google_ads'],
    ['google paid utm', { utmSource: 'google', utmMedium: 'cpc' }, 'google_ads'],
    ['instagram referrer', { referrer: 'https://l.instagram.com/?u=https%3A%2F%2Fapplictus.com' }, 'instagram'],
    ['instagram utm alias', { utmSource: 'ig' }, 'instagram'],
    ['tiktok referrer', { referrer: 'https://vm.tiktok.com/ZMabc/' }, 'tiktok'],
    ['youtube referrer', { referrer: 'https://youtu.be/demo' }, 'youtube'],
    ['linkedin referrer', { referrer: 'https://www.linkedin.com/feed/' }, 'linkedin'],
    ['reddit referrer', { referrer: 'https://www.reddit.com/r/jobs/' }, 'reddit'],
    ['x shortlink referrer', { referrer: 'https://t.co/demo' }, 'twitter'],
    ['unknown referrer', { referrer: 'https://newsletter.example.com/post' }, 'other']
  ];

  for (const [label, input, expected] of cases) {
    assert.equal(classifyTrafficSource(input), expected, label);
  }
});

test('admin analytics summary combines growth, product, revenue, traffic, and ingestion health', async (t) => {
  const { baseUrl, db, stop } = await startServerWithEnv({
    NODE_ENV: 'test',
    JOBTRACK_DB_PATH: ':memory:',
    JOBTRACK_LOG_LEVEL: 'error',
    INBOUND_DOMAIN: 'mail.applictus.com',
    INTERNAL_GMAIL_USERS: 'admin@example.com',
    ANALYTICS_PRO_MONTHLY_PRICE_CENTS: '999'
  });
  t.after(stop);
  if (!baseUrl || !db) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }

  const trafficEvents = [
    {
      visitor_id: 'visitor-direct',
      session_id: 'session-direct',
      path: '/',
      referrer: ''
    },
    {
      visitor_id: 'visitor-google',
      session_id: 'session-google',
      path: '/blog/job-application-tracker?utm_source=google&utm_medium=organic',
      referrer: 'https://www.google.com/search?q=applictus',
      utm_source: 'google',
      utm_medium: 'organic'
    },
    {
      visitor_id: 'visitor-google-ads',
      session_id: 'session-google-ads',
      path: '/?gclid=test-click-id&utm_source=google&utm_medium=cpc',
      referrer: '',
      utm_source: 'google',
      utm_medium: 'cpc',
      gclid: 'test-click-id'
    },
    {
      visitor_id: 'visitor-instagram',
      session_id: 'session-instagram',
      path: '/?utm_source=ig',
      referrer: 'https://l.instagram.com/?u=https%3A%2F%2Fapplictus.com',
      utm_source: 'ig'
    },
    {
      visitor_id: 'visitor-instagram',
      session_id: 'session-instagram',
      path: '/blog',
      referrer: 'https://www.instagram.com/'
    },
    {
      visitor_id: 'visitor-tiktok',
      session_id: 'session-tiktok',
      path: '/',
      referrer: 'https://vm.tiktok.com/ZMabc/'
    },
    {
      visitor_id: 'visitor-youtube',
      session_id: 'session-youtube',
      path: '/',
      referrer: 'https://m.youtube.com/watch?v=applictus'
    },
    {
      visitor_id: 'visitor-linkedin',
      session_id: 'session-linkedin',
      path: '/',
      referrer: 'https://www.linkedin.com/feed/'
    },
    {
      visitor_id: 'visitor-reddit',
      session_id: 'session-reddit',
      path: '/',
      referrer: 'https://www.reddit.com/r/jobs/'
    },
    {
      visitor_id: 'visitor-twitter',
      session_id: 'session-twitter',
      path: '/',
      referrer: 'https://t.co/demo'
    },
    {
      visitor_id: 'visitor-other',
      session_id: 'session-other',
      path: '/?utm_source=partner_unknown&utm_medium=bio',
      referrer: 'https://newsletter.example.com/post',
      utm_source: 'partner_unknown',
      utm_medium: 'bio'
    }
  ];

  for (const event of trafficEvents) {
    const result = await postPublicEvent(baseUrl, {
      event_name: 'page_view',
      ...event
    });
    assert.equal(result.status, 200);
  }

  const invalidEvent = await postPublicEvent(baseUrl, {
    event_name: 'subscription_started',
    visitor_id: 'visitor-bad',
    path: '/'
  });
  assert.equal(invalidEvent.status, 400);
  assert.equal(invalidEvent.body.error, 'UNSUPPORTED_ANALYTICS_EVENT');

  const adminRequest = await createClient(baseUrl);
  const adminSignup = await adminRequest('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin@example.com',
      password: 'StrongPassword123!'
    })
  });
  assert.equal(adminSignup.status, 200);
  const adminUserId = adminSignup.body.user.id;

  const userEmail = `analytics-user-${crypto.randomUUID()}@example.com`;
  const userRequest = await createClient(baseUrl);
  const userSignup = await userRequest('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: userEmail,
      password: 'StrongPassword123!'
    })
  });
  assert.equal(userSignup.status, 200);
  const userId = userSignup.body.user.id;

  const createApp = await userRequest('/api/applications', {
    method: 'POST',
    body: JSON.stringify({
      company_name: 'Example Co',
      job_title: 'Product Analyst',
      current_status: 'APPLIED'
    })
  });
  assert.equal(createApp.status, 200);

  db.prepare(
    `UPDATE users
        SET plan_tier = 'pro',
            plan_status = 'active',
            billing_plan = 'pro_monthly',
            billing_last_event_at = ?
      WHERE id = ?`
  ).run(new Date().toISOString(), userId);

  const forwardingUpdated = db.prepare(
    `UPDATE inbound_addresses
        SET forwarding_active_at = ?, last_received_at = ?
      WHERE user_id = ?`
  ).run(new Date().toISOString(), new Date().toISOString(), userId);
  if (!forwardingUpdated.changes) {
    db.prepare(
      `INSERT INTO inbound_addresses
        (id, user_id, address_local, address_email, is_active, status, confirmed_at, last_received_at, forwarding_active_at, created_at)
       VALUES (?, ?, ?, ?, 1, 'active', ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      userId,
      `analytics-${crypto.randomUUID()}`,
      `analytics-${crypto.randomUUID()}@mail.applictus.com`,
      new Date().toISOString(),
      new Date().toISOString(),
      new Date().toISOString(),
      new Date().toISOString()
    );
  }

  const { recordAnalyticsEvent, ANALYTICS_EVENT_NAMES } = require('../src/analyticsEvents');
  const recordedSubscription = await recordAnalyticsEvent(db, {
    eventName: ANALYTICS_EVENT_NAMES.SUBSCRIPTION_STARTED,
    userId,
    path: '/account',
    source: 'stripe',
    idempotencyKey: `test-subscription:${userId}`
  });
  assert.equal(recordedSubscription, true);

  const summaryRes = await adminRequest('/api/admin/analytics/summary');
  assert.equal(summaryRes.status, 200);
  const summary = summaryRes.body;

  assert.ok(summary.growth_funnel);
  assert.ok(summary.traffic_acquisition);
  assert.ok(summary.product_usage);
  assert.ok(summary.revenue);
  assert.ok(summary.system_ingestion_health);
  assert.ok(Array.isArray(summary.growth_funnel.stages));
  assert.equal(summary.growth_funnel.stages.length, 5);
  assert.ok(summary.growth_funnel.unique_visitors_30d >= 2);
  assert.ok(summary.growth_funnel.signups_30d >= 2);
  assert.ok(summary.growth_funnel.forwarding_setup_completions_30d >= 1);
  assert.ok(summary.growth_funnel.active_users_30d >= 1);
  assert.ok(summary.growth_funnel.paid_conversions_30d >= 1);
  assert.ok(summary.product_usage.active_users_7d >= 1);
  assert.ok(summary.product_usage.applications_tracked_total >= 1);
  assert.ok(summary.product_usage.average_applications_per_active_user >= 0);
  assert.ok(summary.revenue.paid_users >= 1);
  assert.ok(summary.revenue.mrr_cents >= 999);
  assert.ok(summary.revenue.signup_to_paid_conversion_rate_30d > 0);
  assert.equal(summary.traffic_acquisition.supports_utm_attribution, true);
  const trafficBySource = Object.fromEntries(
    summary.traffic_acquisition.traffic_sources_30d.map((source) => [source.source, source])
  );
  assert.ok(trafficBySource.direct.visitors >= 1);
  assert.ok(trafficBySource.google_search.visitors >= 1);
  assert.ok(trafficBySource.google_ads.visitors >= 1);
  assert.equal(trafficBySource.instagram.visitors, 1);
  assert.equal(trafficBySource.instagram.page_views, 2);
  assert.equal(trafficBySource.tiktok.visitors, 1);
  assert.equal(trafficBySource.youtube.visitors, 1);
  assert.equal(trafficBySource.linkedin.visitors, 1);
  assert.equal(trafficBySource.reddit.visitors, 1);
  assert.equal(trafficBySource.twitter.visitors, 1);
  assert.equal(trafficBySource.other.visitors, 1);
  assert.ok(
    summary.traffic_acquisition.other_breakdown_30d.some(
      (row) =>
        row.referrer_domain === 'newsletter.example.com' &&
        row.utm_source === 'partner_unknown' &&
        row.visitors === 1 &&
        row.page_views === 1
    )
  );
  assert.equal(summary.system_ingestion_health.tracked_emails_month, summary.tracked_emails_month);

  const firstApplicationEvent = db
    .prepare("SELECT * FROM analytics_events WHERE event_name = 'first_application_detected' AND user_id = ?")
    .get(userId);
  assert.ok(firstApplicationEvent);

  const trendRes = await adminRequest('/api/admin/analytics/trends?metric=unique_visitors&range=30d');
  assert.equal(trendRes.status, 200);
  assert.equal(trendRes.body.metric, 'unique_visitors');
  assert.equal(trendRes.body.bucket_type, 'day');
  assert.ok(Array.isArray(trendRes.body.points));
  assert.ok(trendRes.body.points.some((point) => Number(point.value || 0) >= 2));

  const nonAdminRes = await userRequest('/api/admin/analytics/summary');
  assert.equal(nonAdminRes.status, 403);
  assert.equal(nonAdminRes.body.error, 'ADMIN_ONLY');

  const adminSignupEvent = db
    .prepare("SELECT * FROM analytics_events WHERE event_name = 'signup' AND user_id = ?")
    .get(adminUserId);
  assert.ok(adminSignupEvent);
});
