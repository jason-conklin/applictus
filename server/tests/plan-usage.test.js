const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyTrackedEmailUsage,
  applyInboundEmailReceiptUsage,
	  applyInboundOutcomeUsage,
	  currentMonthBucket,
	  resolveInboundLimit,
	  resolvePlanLimit,
	  resolveForwardingFairUseStatus
	} = require('../src/planUsage');

function createMockDb(initialUsers = []) {
  const users = new Map();
  initialUsers.forEach((u) => {
    users.set(u.id, {
      id: u.id,
      plan_tier: u.plan_tier || 'free',
      plan_status: u.plan_status || 'active',
      billing_plan: u.billing_plan || (u.plan_tier === 'pro' ? 'pro_monthly' : 'free'),
      billing_type: u.billing_type || (u.plan_tier === 'pro' ? 'subscription' : 'none'),
      plan_expires_at: u.plan_expires_at || null,
      billing_failure_state: u.billing_failure_state || null,
      monthly_tracked_email_limit: u.monthly_tracked_email_limit ?? null,
      tracked_email_count_current_month: u.tracked_email_count_current_month ?? 0,
      tracked_email_month_bucket: u.tracked_email_month_bucket || null,
      monthly_inbound_email_limit: u.monthly_inbound_email_limit ?? null,
      inbound_email_count_current_month: u.inbound_email_count_current_month ?? 0,
      inbound_email_month_bucket: u.inbound_email_month_bucket || null,
      inbound_email_relevant_count_current_month: u.inbound_email_relevant_count_current_month ?? 0,
      inbound_email_dropped_count_current_month: u.inbound_email_dropped_count_current_month ?? 0,
      inbound_email_dropped_irrelevant_count_current_month: u.inbound_email_dropped_irrelevant_count_current_month ?? 0,
      inbound_email_dropped_over_cap_count_current_month: u.inbound_email_dropped_over_cap_count_current_month ?? 0
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
          if (normalized.includes('inbound_email_count_current_month = coalesce(inbound_email_count_current_month, 0) + 1')) {
            const bucket = args[0];
            const userId = args[1];
            const row = users.get(userId);
            if (!row) throw new Error('USER_NOT_FOUND');
            row.inbound_email_month_bucket = row.inbound_email_month_bucket || bucket;
            row.inbound_email_count_current_month = Number(row.inbound_email_count_current_month || 0) + 1;
            users.set(userId, row);
            return { changes: 1 };
          }
          if (
            normalized.includes('inbound_email_relevant_count_current_month = coalesce(inbound_email_relevant_count_current_month, 0) + ?') &&
            normalized.includes('inbound_email_dropped_count_current_month = coalesce(inbound_email_dropped_count_current_month, 0) + ?') &&
            normalized.includes('inbound_email_dropped_irrelevant_count_current_month = coalesce(inbound_email_dropped_irrelevant_count_current_month, 0) + ?') &&
            normalized.includes('inbound_email_dropped_over_cap_count_current_month = coalesce(inbound_email_dropped_over_cap_count_current_month, 0) + ?')
          ) {
            const incrementRelevant = Number(args[0] || 0);
            const incrementDropped = Number(args[1] || 0);
            const incrementDroppedIrrelevant = Number(args[2] || 0);
            const incrementDroppedOverCap = Number(args[3] || 0);
            const bucket = args[4];
            const userId = args[5];
            const row = users.get(userId);
            if (!row) throw new Error('USER_NOT_FOUND');
            row.inbound_email_relevant_count_current_month =
              Number(row.inbound_email_relevant_count_current_month || 0) + incrementRelevant;
            row.inbound_email_dropped_count_current_month =
              Number(row.inbound_email_dropped_count_current_month || 0) + incrementDropped;
            row.inbound_email_dropped_irrelevant_count_current_month =
              Number(row.inbound_email_dropped_irrelevant_count_current_month || 0) + incrementDroppedIrrelevant;
            row.inbound_email_dropped_over_cap_count_current_month =
              Number(row.inbound_email_dropped_over_cap_count_current_month || 0) + incrementDroppedOverCap;
            row.inbound_email_month_bucket = row.inbound_email_month_bucket || bucket;
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
          if (
            normalized.includes('set monthly_tracked_email_limit = ?') &&
            normalized.includes('where id = ?') &&
            !normalized.includes('tracked_email_count_current_month = 0')
          ) {
            const trackedLimit = args[0];
            const userId = args[1];
            const row = users.get(userId);
            if (!row) throw new Error('USER_NOT_FOUND');
            row.monthly_tracked_email_limit = trackedLimit;
            users.set(userId, row);
            return { changes: 1 };
          }
          if (normalized.includes('set inbound_email_count_current_month = 0')) {
            const bucket = args[0];
            const inboundLimit = args[1];
            const userId = args[2];
            const row = users.get(userId);
            if (!row) throw new Error('USER_NOT_FOUND');
            row.inbound_email_count_current_month = 0;
            row.inbound_email_relevant_count_current_month = 0;
            row.inbound_email_dropped_count_current_month = 0;
            row.inbound_email_dropped_irrelevant_count_current_month = 0;
            row.inbound_email_dropped_over_cap_count_current_month = 0;
            row.inbound_email_month_bucket = bucket;
            if (row.monthly_inbound_email_limit == null) {
              row.monthly_inbound_email_limit = inboundLimit;
            }
            users.set(userId, row);
            return { changes: 1 };
          }
          if (
            normalized.includes('set monthly_inbound_email_limit = ?') &&
            normalized.includes('where id = ?')
          ) {
            const inboundLimit = args[0];
            const userId = args[1];
            const row = users.get(userId);
            if (!row) throw new Error('USER_NOT_FOUND');
            row.monthly_inbound_email_limit = inboundLimit;
            users.set(userId, row);
            return { changes: 1 };
          }
          if (
            normalized.includes('set plan_tier = ?') &&
            normalized.includes('billing_plan = ?') &&
            normalized.includes('monthly_tracked_email_limit = ?') &&
            normalized.includes('monthly_inbound_email_limit = ?') &&
            normalized.includes('updated_at = ?') &&
            normalized.includes('where id = ?')
          ) {
            const [planTier, billingPlan, trackedLimit, inboundLimit, _updatedAt, userId] = args;
            const row = users.get(userId);
            if (!row) throw new Error('USER_NOT_FOUND');
            row.plan_tier = planTier;
            row.billing_plan = billingPlan;
            row.monthly_tracked_email_limit = trackedLimit;
            row.monthly_inbound_email_limit = inboundLimit;
            users.set(userId, row);
            return { changes: 1 };
          }
          if (
            normalized.includes("set plan_tier = 'pro'") &&
            normalized.includes('monthly_tracked_email_limit = ?') &&
            normalized.includes('monthly_inbound_email_limit = ?') &&
            normalized.includes('updated_at = ?') &&
            normalized.includes('where id = ?')
          ) {
	            const trackedLimit = args[0] ?? null;
	            const inboundLimit = args[1] ?? null;
            const userId = args[3];
            const row = users.get(userId);
            if (!row) throw new Error('USER_NOT_FOUND');
            row.plan_tier = 'pro';
            row.monthly_tracked_email_limit = trackedLimit;
            row.monthly_inbound_email_limit = inboundLimit;
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

test('paid tracked-update limits resolve as unlimited', () => {
  assert.equal(resolvePlanLimit('pro', null, 'pro_monthly'), null);
  assert.equal(resolvePlanLimit('pro', null, 'job_search_plan'), null);
  assert.equal(resolvePlanLimit('free', null, 'free'), 50);
});

test('pro user is not blocked at the former 500 tracked-update limit', () => {
  const db = createMockDb([{
    id: 'u1',
    plan_tier: 'pro',
    billing_plan: 'pro_monthly',
    billing_type: 'subscription',
    tracked_email_count_current_month: 500,
    tracked_email_month_bucket: currentMonthBucket()
  }]);
  const res = applyTrackedEmailUsage(db, { userId: 'u1', isJobRelated: true, newEvent: true });
  assert.equal(res.allowed, true);
  assert.equal(res.counted, true);
  assert.equal(res.plan.limit, null);
  assert.equal(db._dump()[0].tracked_email_count_current_month, 501);
});

test('job search plan user is not blocked at the former 500 tracked-update limit', () => {
  const db = createMockDb([{
    id: 'u1',
    plan_tier: 'pro',
    billing_plan: 'job_search_plan',
    billing_type: 'one_time',
    plan_expires_at: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
    tracked_email_count_current_month: 500,
    tracked_email_month_bucket: currentMonthBucket()
  }]);
  const res = applyTrackedEmailUsage(db, { userId: 'u1', isJobRelated: true, newEvent: true });
  assert.equal(res.allowed, true);
  assert.equal(res.counted, true);
  assert.equal(res.plan.limit, null);
  assert.equal(db._dump()[0].tracked_email_count_current_month, 501);
});

test('ignored email does not count', () => {
  const db = createMockDb([{ id: 'u1', plan_tier: 'free' }]);
	  const res = applyTrackedEmailUsage(db, { userId: 'u1', isJobRelated: false, newEvent: true });
	  assert.equal(res.allowed, true);
	  assert.equal(res.counted, false);
	  assert.equal(db._dump()[0].tracked_email_count_current_month, 0);
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

test('async db plan usage keeps pro users as pro and applies unlimited tracked limit', async () => {
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
	  assert.equal(res.plan.limit, null);
	  assert.equal(db._dump()[0].tracked_email_count_current_month, 1);
	});

test('raw inbound counting and tracked usage stay separate', () => {
  const bucket = currentMonthBucket();
  const db = createMockDb([
    {
      id: 'u1',
      plan_tier: 'free',
      monthly_inbound_email_limit: 150,
      inbound_email_count_current_month: 0,
      inbound_email_month_bucket: bucket,
      tracked_email_count_current_month: 0,
      tracked_email_month_bucket: bucket
    }
  ]);

  const receipt = applyInboundEmailReceiptUsage(db, { userId: 'u1', countable: true });
  assert.equal(receipt.counted, true);
  assert.equal(receipt.cap.usage, 1);
  assert.equal(receipt.cap.overCap, false);

  const outcome = applyInboundOutcomeUsage(db, {
    userId: 'u1',
    dropped: true,
    dropReason: 'irrelevant'
  });
  assert.equal(outcome.counted, true);

  const row = db._dump()[0];
  assert.equal(row.inbound_email_count_current_month, 1);
  assert.equal(row.inbound_email_dropped_count_current_month, 1);
  assert.equal(row.inbound_email_dropped_irrelevant_count_current_month, 1);
  assert.equal(row.tracked_email_count_current_month, 0);
});

test('raw inbound cap blocks only when usage exceeds configured cap', () => {
  const originalFreeInboundLimit = process.env.JOBTRACK_FREE_MONTHLY_INBOUND_LIMIT;
  process.env.JOBTRACK_FREE_MONTHLY_INBOUND_LIMIT = '2';
  try {
    const bucket = currentMonthBucket();
    const db = createMockDb([
      {
        id: 'u1',
        plan_tier: 'free',
        monthly_inbound_email_limit: 2,
        inbound_email_count_current_month: 1,
        inbound_email_month_bucket: bucket,
        tracked_email_count_current_month: 0,
        tracked_email_month_bucket: bucket
      }
    ]);

    const second = applyInboundEmailReceiptUsage(db, { userId: 'u1', countable: true });
    assert.equal(second.cap.usage, 2);
    assert.equal(second.cap.overCap, false);

    const third = applyInboundEmailReceiptUsage(db, { userId: 'u1', countable: true });
    assert.equal(third.cap.usage, 3);
    assert.equal(third.cap.overCap, true);
  } finally {
    if (originalFreeInboundLimit === undefined) {
      delete process.env.JOBTRACK_FREE_MONTHLY_INBOUND_LIMIT;
    } else {
      process.env.JOBTRACK_FREE_MONTHLY_INBOUND_LIMIT = originalFreeInboundLimit;
    }
  }
});

test('paid raw inbound is counted without a hard monthly cap', () => {
  const bucket = currentMonthBucket();
  const paidInboundLimit = resolveInboundLimit('pro', null, 'pro_monthly');
  const db = createMockDb([
    {
      id: 'u1',
      plan_tier: 'pro',
      billing_plan: 'pro_monthly',
      billing_type: 'subscription',
      monthly_inbound_email_limit: paidInboundLimit,
      inbound_email_count_current_month: 1000,
      inbound_email_month_bucket: bucket,
      tracked_email_count_current_month: 0,
      tracked_email_month_bucket: bucket
    }
  ]);

  assert.equal(paidInboundLimit, null);
  const receipt = applyInboundEmailReceiptUsage(db, { userId: 'u1', countable: true });
  assert.equal(receipt.cap.usage, 1001);
  assert.equal(receipt.cap.limit, 0);
  assert.equal(receipt.cap.overCap, false);
});

test('high raw forwarded volume triggers paid forwarding warning', () => {
  const status = resolveForwardingFairUseStatus({
    planTier: 'pro',
    billingPlan: 'pro_monthly',
    inboundUsage: 2000,
    inboundRelevant: 1700,
    thresholds: {
      paidWarningThreshold: 1000,
      paidReviewThreshold: 2000,
      paidDailySpikeThreshold: 250,
      paidPauseThreshold: 5000,
      lowRelevanceMinVolume: 100,
      minRelevanceRate: 0.2
    }
  });
  assert.equal(status.status, 'high_forwarding_volume');
  assert.equal(status.level, 'strong');
});

test('low relevance rate triggers paid filter-review warning', () => {
  const status = resolveForwardingFairUseStatus({
    planTier: 'pro',
    billingPlan: 'pro_monthly',
    inboundUsage: 150,
    inboundRelevant: 10,
    thresholds: {
      paidWarningThreshold: 1000,
      paidReviewThreshold: 2000,
      paidDailySpikeThreshold: 250,
      paidPauseThreshold: 5000,
      lowRelevanceMinVolume: 100,
      minRelevanceRate: 0.2
    }
  });
  assert.equal(status.status, 'filter_review_recommended');
  assert.equal(status.reason, 'low_relevance_rate');
});

test('inbound month rollover resets inbound counters before counting', () => {
  const db = createMockDb([
    {
      id: 'u1',
      plan_tier: 'free',
      monthly_inbound_email_limit: 150,
      inbound_email_count_current_month: 42,
      inbound_email_month_bucket: '1999-12',
      inbound_email_relevant_count_current_month: 19,
      inbound_email_dropped_count_current_month: 23,
      inbound_email_dropped_irrelevant_count_current_month: 20,
      inbound_email_dropped_over_cap_count_current_month: 3
    }
  ]);

  const receipt = applyInboundEmailReceiptUsage(db, { userId: 'u1', countable: true });
  assert.equal(receipt.counted, true);
  assert.equal(receipt.cap.usage, 1);
  assert.equal(receipt.cap.overCap, false);

  const row = db._dump()[0];
  assert.equal(row.inbound_email_month_bucket, currentMonthBucket());
  assert.equal(row.inbound_email_count_current_month, 1);
  assert.equal(row.inbound_email_relevant_count_current_month, 0);
  assert.equal(row.inbound_email_dropped_count_current_month, 0);
  assert.equal(row.inbound_email_dropped_irrelevant_count_current_month, 0);
  assert.equal(row.inbound_email_dropped_over_cap_count_current_month, 0);
});
