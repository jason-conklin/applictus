const test = require('node:test');
const assert = require('node:assert/strict');

const Database = require('better-sqlite3');

const { updateUserPlan, getUserPlan } = require('../src/billing');
const { resolvePlanLimit } = require('../src/planUsage');

function setupDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT,
      plan_tier TEXT DEFAULT 'free',
      plan_status TEXT DEFAULT 'active',
      monthly_tracked_email_limit INTEGER,
      tracked_email_count_current_month INTEGER DEFAULT 0,
      tracked_email_month_bucket TEXT
    );
  `);
  return db;
}

test('upgrade free -> pro sets limit and status', () => {
  const db = setupDb();
  db.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run('u1', 'u1@test.com');
  updateUserPlan(db, { userId: 'u1', tier: 'pro', status: 'active' });
  const plan = getUserPlan(db, 'u1');
  assert.equal(plan.tier, 'pro');
  assert.equal(plan.status, 'active');
  assert.equal(plan.limit, resolvePlanLimit('pro', null));
});

test('dev-set plan to pro via helper', () => {
  const db = setupDb();
  db.prepare('INSERT INTO users (id, email, plan_tier) VALUES (?, ?, ?)').run('u1', 'u1@test.com', 'free');
  updateUserPlan(db, { userId: 'u1', tier: 'pro', status: 'active' });
  const plan = getUserPlan(db, 'u1');
  assert.equal(plan.tier, 'pro');
});

test('downgrade pro -> free resets limit', () => {
  const db = setupDb();
  db.prepare('INSERT INTO users (id, email, plan_tier, monthly_tracked_email_limit) VALUES (?, ?, ?, ?)')
    .run('u1', 'u1@test.com', 'pro', 500);
  updateUserPlan(db, { userId: 'u1', tier: 'free', status: 'active' });
  const plan = getUserPlan(db, 'u1');
  assert.equal(plan.tier, 'free');
  assert.equal(plan.limit, resolvePlanLimit('free', null));
});

