const test = require('node:test');
const assert = require('node:assert/strict');

const { applyTrackedEmailUsage, currentMonthBucket } = require('../src/planUsage');

function createMockDb(initialUsers = []) {
  const users = new Map();
  initialUsers.forEach((u) => {
    users.set(u.id, {
      id: u.id,
      plan_tier: u.plan_tier || 'free',
      plan_status: u.plan_status || 'active',
      monthly_tracked_email_limit: u.monthly_tracked_email_limit ?? null,
      tracked_email_count_current_month: u.tracked_email_count_current_month ?? 0,
      tracked_email_month_bucket: u.tracked_email_month_bucket || null
    });
  });

  function selectUser(id) {
    const row = users.get(id);
    if (!row) return undefined;
    return { ...row };
  }

  function sumUsage(bucket) {
    let total = 0;
    users.forEach((u) => {
      if (u.tracked_email_month_bucket === bucket) {
        total += Number(u.tracked_email_count_current_month || 0);
      }
    });
    return total;
  }

  return {
    prepare(sql) {
      const normalized = sql.toLowerCase();
      return {
        get: (...args) => {
          if (normalized.includes('from users where id = ?')) {
            return selectUser(args[0]);
          }
          if (normalized.includes('sum(tracked_email_count_current_month)')) {
            return { total: sumUsage(args[0]) };
          }
          throw new Error(`unsupported get sql: ${sql}`);
        },
        run: (...args) => {
          if (normalized.includes('tracked_email_count_current_month = tracked_email_count_current_month + 1')) {
            const bucket = args[0];
            const userId = args[1];
            const row = users.get(userId);
            if (!row) throw new Error('USER_NOT_FOUND');
            row.tracked_email_month_bucket = row.tracked_email_month_bucket || bucket;
            row.tracked_email_count_current_month = Number(row.tracked_email_count_current_month || 0) + 1;
            users.set(userId, row);
            return { changes: 1 };
          }
          if (normalized.includes('tracked_email_count_current_month = 0')) {
            const bucket = args[0];
            const limit = args[1];
            const userId = args[2];
            const row = users.get(userId);
            if (!row) throw new Error('USER_NOT_FOUND');
            row.tracked_email_count_current_month = 0;
            row.tracked_email_month_bucket = bucket;
            if (row.monthly_tracked_email_limit == null) {
              row.monthly_tracked_email_limit = limit;
            }
            users.set(userId, row);
            return { changes: 1 };
          }
          throw new Error(`unsupported run sql: ${sql}`);
        }
      };
    },
    _dump() {
      return Array.from(users.values()).map((u) => ({ ...u }));
    }
  };
}

function createAsyncMockDb(initialUsers = []) {
  const syncDb = createMockDb(initialUsers);
  return {
    isAsync: true,
    prepare(sql) {
      const stmt = syncDb.prepare(sql);
      return {
        get: async (...args) => stmt.get(...args),
        run: async (...args) => stmt.run(...args),
        all: async (...args) => (stmt.all ? stmt.all(...args) : [])
      };
    },
    _dump() {
      return syncDb._dump();
    }
  };
}

test('free user under limit increments usage', () => {
  const db = createMockDb([{ id: 'u1', plan_tier: 'free', tracked_email_count_current_month: 0 }]);
  const res = applyTrackedEmailUsage(db, { userId: 'u1', isJobRelated: true, newEvent: true });
  assert.equal(res.allowed, true);
  assert.equal(res.counted, true);
  assert.equal(db._dump()[0].tracked_email_count_current_month, 1);
});

test('free user at limit is blocked', () => {
  const db = createMockDb([{
    id: 'u1',
    plan_tier: 'free',
    tracked_email_count_current_month: 50,
    tracked_email_month_bucket: currentMonthBucket()
  }]);
  const res = applyTrackedEmailUsage(db, { userId: 'u1', isJobRelated: true, newEvent: true });
  assert.equal(res.allowed, false);
  assert.equal(res.reason, 'user_cap_reached');
});

test('pro user under limit allowed', () => {
  const db = createMockDb([{
    id: 'u1',
    plan_tier: 'pro',
    tracked_email_count_current_month: 499,
    tracked_email_month_bucket: currentMonthBucket()
  }]);
  const res = applyTrackedEmailUsage(db, { userId: 'u1', isJobRelated: true, newEvent: true });
  assert.equal(res.allowed, true);
  assert.equal(res.counted, true);
});

test('ignored email does not count', () => {
  const db = createMockDb([{ id: 'u1', plan_tier: 'free' }]);
  const res = applyTrackedEmailUsage(db, { userId: 'u1', isJobRelated: false, newEvent: true });
  assert.equal(res.allowed, true);
  assert.equal(res.counted, false);
});

test('duplicate event does not count', () => {
  const db = createMockDb([{ id: 'u1', plan_tier: 'free', tracked_email_count_current_month: 2 }]);
  const res = applyTrackedEmailUsage(db, { userId: 'u1', isJobRelated: true, newEvent: false });
  assert.equal(res.allowed, true);
  assert.equal(res.counted, false);
  assert.equal(db._dump()[0].tracked_email_count_current_month, 2);
});

test('month rollover resets usage', () => {
  const db = createMockDb([{
    id: 'u1',
    plan_tier: 'free',
    tracked_email_count_current_month: 49,
    tracked_email_month_bucket: '1999-12'
  }]);
  const res = applyTrackedEmailUsage(db, { userId: 'u1', isJobRelated: true, newEvent: true });
  assert.equal(res.allowed, true);
  assert.equal(res.counted, true);
  const row = db._dump()[0];
  assert.equal(row.tracked_email_count_current_month, 1);
  assert.equal(row.tracked_email_month_bucket, currentMonthBucket());
});

test('global cap blocks free but not pro', () => {
  const bucket = currentMonthBucket();
  const db = createMockDb([
    { id: 'u1', plan_tier: 'free', tracked_email_count_current_month: 2, tracked_email_month_bucket: bucket },
    { id: 'u2', plan_tier: 'free', tracked_email_count_current_month: 1, tracked_email_month_bucket: bucket },
    { id: 'u3', plan_tier: 'pro', tracked_email_count_current_month: 0, tracked_email_month_bucket: bucket }
  ]);
  process.env.GLOBAL_TRACKED_EMAIL_CAP = '3';
  const blocked = applyTrackedEmailUsage(db, { userId: 'u1', isJobRelated: true, newEvent: true });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'global_cap_reached');
  const allowedPro = applyTrackedEmailUsage(db, { userId: 'u3', isJobRelated: true, newEvent: true });
  assert.equal(allowedPro.allowed, true);
  delete process.env.GLOBAL_TRACKED_EMAIL_CAP;
});

test('async db plan usage keeps pro users as pro and applies pro limit', async () => {
  const db = createAsyncMockDb([
    {
      id: 'u1',
      plan_tier: 'pro',
      plan_status: 'active',
      billing_plan: 'pro_monthly',
      billing_type: 'subscription',
      monthly_tracked_email_limit: 500,
      tracked_email_count_current_month: 0,
      tracked_email_month_bucket: currentMonthBucket()
    }
  ]);
  const res = await applyTrackedEmailUsage(db, { userId: 'u1', isJobRelated: true, newEvent: true });
  assert.equal(res.allowed, true);
  assert.equal(res.counted, true);
  assert.equal(res.plan.planTier, 'pro');
  assert.equal(res.plan.limit, 500);
  assert.equal(db._dump()[0].tracked_email_count_current_month, 1);
});
