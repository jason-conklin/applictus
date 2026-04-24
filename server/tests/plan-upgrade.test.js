const test = require('node:test');
const assert = require('node:assert/strict');

let Database = null;
try {
  Database = require('better-sqlite3');
} catch (_) {
  Database = null;
}

const { updateUserPlan, getUserPlan } = require('../src/billing');
const { resolvePlanLimit } = require('../src/planUsage');

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
      plan_tier TEXT DEFAULT 'free',
      plan_status TEXT DEFAULT 'active',
      billing_plan TEXT DEFAULT 'free',
      billing_type TEXT DEFAULT 'none',
      plan_expires_at TEXT,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      billing_failure_state TEXT,
      billing_last_event_id TEXT,
      billing_last_event_at TEXT,
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
      subscription_status TEXT,
      current_period_end TEXT,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0
    );
  `);
  return db;
}

test('upgrade free -> pro sets unlimited paid limits and status', (t) => {
  const db = setupDb();
  if (!db) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }
  db.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run('u1', 'u1@test.com');
  updateUserPlan(db, { userId: 'u1', tier: 'pro', status: 'active' });
  const plan = getUserPlan(db, 'u1');
  assert.equal(plan.tier, 'pro');
	  assert.equal(plan.status, 'active');
	  assert.equal(plan.limit, resolvePlanLimit('pro', null));
	  assert.equal(plan.inbound_limit, null);
});

test('dev-set plan to pro via helper', (t) => {
  const db = setupDb();
  if (!db) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }
  db.prepare('INSERT INTO users (id, email, plan_tier) VALUES (?, ?, ?)').run('u1', 'u1@test.com', 'free');
  updateUserPlan(db, { userId: 'u1', tier: 'pro', status: 'active' });
  const plan = getUserPlan(db, 'u1');
  assert.equal(plan.tier, 'pro');
});

test('downgrade pro -> free resets limit', (t) => {
  const db = setupDb();
  if (!db) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }
  db.prepare('INSERT INTO users (id, email, plan_tier, monthly_tracked_email_limit) VALUES (?, ?, ?, ?)')
    .run('u1', 'u1@test.com', 'pro', 500);
  updateUserPlan(db, { userId: 'u1', tier: 'free', status: 'active' });
  const plan = getUserPlan(db, 'u1');
  assert.equal(plan.tier, 'free');
  assert.equal(plan.limit, resolvePlanLimit('free', null));
  assert.equal(plan.inbound_limit, 150);
});
