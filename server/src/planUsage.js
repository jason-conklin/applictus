const PLAN_LIMITS = Object.freeze({
  free: 50,
  pro: 500
});

function currentMonthBucket(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function resolvePlanLimit(tier, explicitLimit) {
  const normalized = String(tier || 'free').toLowerCase();
  // Free tier limit is policy-driven and should not drift from legacy stored values.
  if (normalized === 'free') {
    return PLAN_LIMITS.free;
  }
  if (Number.isFinite(explicitLimit) && explicitLimit > 0) {
    return explicitLimit;
  }
  return PLAN_LIMITS[normalized] || PLAN_LIMITS.free;
}

function ensurePlanState(db, userId) {
  const bucket = currentMonthBucket();
  const row = db
    .prepare(
      `SELECT plan_tier, plan_status, monthly_tracked_email_limit, tracked_email_count_current_month, tracked_email_month_bucket
         FROM users WHERE id = ?`
    )
    .get(userId);
  if (!row) {
    throw new Error('USER_NOT_FOUND');
  }
  const planTier = row.plan_tier || 'free';
  const planStatus = row.plan_status || 'active';
  const limit = resolvePlanLimit(planTier, row.monthly_tracked_email_limit);
  const needsReset = !row.tracked_email_month_bucket || row.tracked_email_month_bucket !== bucket;
  if (needsReset) {
    db.prepare(
      `UPDATE users SET tracked_email_count_current_month = 0, tracked_email_month_bucket = ?, monthly_tracked_email_limit = COALESCE(monthly_tracked_email_limit, ?)
         WHERE id = ?`
    ).run(bucket, limit, userId);
    return {
      planTier,
      planStatus,
      limit,
      usage: 0,
      bucket
    };
  }
  return {
    planTier,
    planStatus,
    limit,
    usage: Number(row.tracked_email_count_current_month || 0),
    bucket
  };
}

function getGlobalCap() {
  const raw = process.env.GLOBAL_TRACKED_EMAIL_CAP;
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function readGlobalUsage(db, bucket) {
  const row = db
    .prepare(
      `SELECT SUM(tracked_email_count_current_month) AS total FROM users WHERE tracked_email_month_bucket = ?`
    )
    .get(bucket);
  return Number(row?.total || 0);
}

function planStatusBlocks(planStatus) {
  const normalized = String(planStatus || '').toLowerCase();
  if (!normalized || normalized === 'active') return false;
  return true;
}

/**
 * Apply tracked email usage for a user.
 *
 * Options:
 * - isJobRelated: boolean – only count if true
 * - newEvent: boolean – only count if this is a new tracked event (no duplicates)
 */
function applyTrackedEmailUsage(db, {
  userId,
  isJobRelated = true,
  newEvent = true
}) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('DB_REQUIRED');
  }
  if (!userId) {
    throw new Error('USER_ID_REQUIRED');
  }

  // Early exits for non-countable situations
  if (!isJobRelated || !newEvent) {
    return {
      allowed: true,
      counted: false,
      reason: 'not_countable',
      plan: null
    };
  }

  const plan = ensurePlanState(db, userId);
  const planStatusBlocked = planStatusBlocks(plan.planStatus);
  if (planStatusBlocked) {
    return {
      allowed: false,
      counted: false,
      reason: 'plan_inactive',
      plan
    };
  }

  const globalCap = getGlobalCap();
  const globalUsage = globalCap ? readGlobalUsage(db, plan.bucket) : null;
  if (globalCap && globalUsage >= globalCap && plan.planTier === 'free') {
    return {
      allowed: false,
      counted: false,
      reason: 'global_cap_reached',
      plan,
      global: { usage: globalUsage, cap: globalCap }
    };
  }

  if (plan.usage >= plan.limit) {
    return {
      allowed: false,
      counted: false,
      reason: 'user_cap_reached',
      plan
    };
  }

  db.prepare(
    `UPDATE users
       SET tracked_email_count_current_month = tracked_email_count_current_month + 1,
           tracked_email_month_bucket = COALESCE(tracked_email_month_bucket, ?)
       WHERE id = ?`
  ).run(plan.bucket, userId);

  return {
    allowed: true,
    counted: true,
    reason: null,
    plan: {
      ...plan,
      usage: plan.usage + 1
    },
    global: globalCap
      ? { usage: (globalUsage || 0) + 1, cap: globalCap }
      : null
  };
}

module.exports = {
  PLAN_LIMITS,
  currentMonthBucket,
  resolvePlanLimit,
  applyTrackedEmailUsage,
  ensurePlanState
};
