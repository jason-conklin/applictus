const test = require('node:test');
const assert = require('node:assert/strict');

let Database = null;
try {
  Database = require('better-sqlite3');
} catch (_) {
  Database = null;
}
const { ensurePlanState, resolvePlanLimit } = require('../src/planUsage');

function setupDb() {
  if (!Database) {
    return null;
  }
  let db = null;
  try {
    db = new Database(':memory:');
  } catch (_) {
    return null;
  }
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT,
      created_at TEXT,
      updated_at TEXT,
      plan_tier TEXT DEFAULT 'free',
      plan_status TEXT DEFAULT 'active',
      billing_plan TEXT DEFAULT 'free',
      billing_type TEXT DEFAULT 'none',
      plan_expires_at TEXT,
      stripe_subscription_id TEXT,
      monthly_tracked_email_limit INTEGER,
      tracked_email_count_current_month INTEGER DEFAULT 0,
      tracked_email_month_bucket TEXT,
      monthly_inbound_email_limit INTEGER,
      inbound_email_count_current_month INTEGER DEFAULT 0,
      inbound_email_month_bucket TEXT,
      inbound_email_relevant_count_current_month INTEGER DEFAULT 0,
      inbound_email_dropped_count_current_month INTEGER DEFAULT 0,
      inbound_email_dropped_irrelevant_count_current_month INTEGER DEFAULT 0,
      inbound_email_dropped_over_cap_count_current_month INTEGER DEFAULT 0,
      billing_failure_state TEXT
    );
  `);
  return db;
}

test('ensurePlanState treats active one-time job search plan as Pro', (t) => {
  if (!Database) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }
  const db = setupDb();
  if (!db) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }
  const userId = 'user_active_one_time';
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO users (
      id, email, created_at, updated_at, plan_tier, plan_status, billing_plan, billing_type, plan_expires_at, monthly_tracked_email_limit
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, 'active@example.com', now, now, 'free', 'active', 'job_search_plan', 'one_time', future, 50);

  const plan = ensurePlanState(db, userId);
	  assert.equal(plan.planTier, 'pro');
	  assert.equal(plan.planStatus, 'active');
	  assert.equal(plan.limit, resolvePlanLimit('pro', null));
	  assert.equal(plan.inboundLimit, null);
  assert.equal(plan.billingType, 'one_time');
  assert.equal(plan.billingPlan, 'job_search_plan');

  const row = db
    .prepare('SELECT plan_tier, plan_status, monthly_tracked_email_limit, monthly_inbound_email_limit FROM users WHERE id = ?')
    .get(userId);
	  assert.equal(String(row.plan_tier || '').toLowerCase(), 'pro');
	  assert.equal(String(row.plan_status || '').toLowerCase(), 'active');
	  assert.equal(row.monthly_tracked_email_limit, null);
	  assert.equal(row.monthly_inbound_email_limit, null);
});

test('ensurePlanState downgrades expired one-time plan back to Free', (t) => {
  if (!Database) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }
  const db = setupDb();
  if (!db) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }
  const userId = 'user_expired_one_time';
  const now = new Date().toISOString();
  const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO users (
      id, email, created_at, updated_at, plan_tier, plan_status, billing_plan, billing_type, plan_expires_at, stripe_subscription_id, monthly_tracked_email_limit
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, 'expired@example.com', now, now, 'pro', 'active', 'job_search_plan', 'one_time', past, 'sub_old', 500);

  const plan = ensurePlanState(db, userId);
  assert.equal(plan.planTier, 'free');
  assert.equal(plan.planStatus, 'active');
  assert.equal(plan.limit, resolvePlanLimit('free', null));
  assert.equal(plan.inboundLimit, 150);
  assert.equal(plan.billingType, 'none');
  assert.equal(plan.billingPlan, 'free');
  assert.equal(plan.planExpiresAt, null);

  const row = db
    .prepare(
      'SELECT plan_tier, billing_plan, billing_type, plan_expires_at, stripe_subscription_id, monthly_tracked_email_limit, monthly_inbound_email_limit FROM users WHERE id = ?'
    )
    .get(userId);
  assert.equal(String(row.plan_tier || '').toLowerCase(), 'free');
  assert.equal(String(row.billing_plan || '').toLowerCase(), 'free');
  assert.equal(String(row.billing_type || '').toLowerCase(), 'none');
  assert.equal(row.plan_expires_at, null);
  assert.equal(row.stripe_subscription_id, null);
  assert.equal(Number(row.monthly_tracked_email_limit || 0), resolvePlanLimit('free', null));
  assert.equal(Number(row.monthly_inbound_email_limit || 0), 150);
});
