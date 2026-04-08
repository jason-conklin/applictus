const PLAN_LIMITS = Object.freeze({
  free: 50,
  pro: 500
});

const BILLING_TYPES = Object.freeze({
  NONE: 'none',
  SUBSCRIPTION: 'subscription',
  ONE_TIME: 'one_time'
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

function parseIsoMs(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBillingType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return BILLING_TYPES.NONE;
  }
  if (normalized === BILLING_TYPES.SUBSCRIPTION) {
    return BILLING_TYPES.SUBSCRIPTION;
  }
  if (normalized === BILLING_TYPES.ONE_TIME) {
    return BILLING_TYPES.ONE_TIME;
  }
  return BILLING_TYPES.NONE;
}

function ensurePlanStateSync(db, userId) {
  const bucket = currentMonthBucket();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const row = db
    .prepare(
      `SELECT plan_tier, plan_status, monthly_tracked_email_limit, tracked_email_count_current_month, tracked_email_month_bucket,
              billing_plan, billing_type, plan_expires_at, billing_failure_state
         FROM users WHERE id = ?`
    )
    .get(userId);
  if (!row) {
    throw new Error('USER_NOT_FOUND');
  }

  let planTier = row.plan_tier || 'free';
  let planStatus = row.plan_status || 'active';
  let billingPlan = String(row.billing_plan || '').trim().toLowerCase() || (planTier === 'pro' ? 'pro_monthly' : 'free');
  let billingType = normalizeBillingType(row.billing_type);
  let planExpiresAt = row.plan_expires_at || null;
  const planExpiresAtMs = parseIsoMs(planExpiresAt);
  let effectiveLimit = resolvePlanLimit(planTier, row.monthly_tracked_email_limit);

  const oneTimeActive =
    billingType === BILLING_TYPES.ONE_TIME && Number.isFinite(planExpiresAtMs) && planExpiresAtMs > nowMs;
  const oneTimeExpired =
    billingType === BILLING_TYPES.ONE_TIME &&
    (!Number.isFinite(planExpiresAtMs) || planExpiresAtMs <= nowMs);

  if (oneTimeActive) {
    const proLimit = resolvePlanLimit('pro', null);
    const currentLimit = resolvePlanLimit(planTier, row.monthly_tracked_email_limit);
    if (planTier !== 'pro' || planStatus !== 'active' || currentLimit !== proLimit) {
      db.prepare(
        `UPDATE users
           SET plan_tier = 'pro',
               plan_status = 'active',
               monthly_tracked_email_limit = ?,
               updated_at = ?
         WHERE id = ?`
      ).run(proLimit, nowIso, userId);
    }
    planTier = 'pro';
    planStatus = 'active';
    billingPlan = 'job_search_plan';
    billingType = BILLING_TYPES.ONE_TIME;
    effectiveLimit = proLimit;
  } else if (billingType === BILLING_TYPES.SUBSCRIPTION && String(planStatus || '').toLowerCase() === 'active') {
    const proLimit = resolvePlanLimit('pro', null);
    const currentLimit = resolvePlanLimit(planTier, row.monthly_tracked_email_limit);
    if (planTier !== 'pro' || currentLimit !== proLimit) {
      db.prepare(
        `UPDATE users
           SET plan_tier = 'pro',
               monthly_tracked_email_limit = ?,
               updated_at = ?
         WHERE id = ?`
      ).run(proLimit, nowIso, userId);
    }
    planTier = 'pro';
    billingPlan = billingPlan === 'job_search_plan' ? 'job_search_plan' : 'pro_monthly';
    billingType = BILLING_TYPES.SUBSCRIPTION;
    effectiveLimit = proLimit;
  } else if (oneTimeExpired) {
    const freeLimit = resolvePlanLimit('free', null);
    db.prepare(
      `UPDATE users
         SET plan_tier = 'free',
             plan_status = 'active',
             monthly_tracked_email_limit = ?,
             billing_plan = 'free',
             billing_type = 'none',
             plan_expires_at = NULL,
             billing_failure_state = NULL,
             stripe_subscription_id = NULL,
             updated_at = ?
       WHERE id = ?`
    ).run(freeLimit, nowIso, userId);
    planTier = 'free';
    planStatus = 'active';
    billingPlan = 'free';
    billingType = BILLING_TYPES.NONE;
    planExpiresAt = null;
    effectiveLimit = freeLimit;
  }

  const limit = effectiveLimit;
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
      bucket,
      billingPlan,
      billingType,
      planExpiresAt,
      billingFailureState: row.billing_failure_state || null
    };
  }
  return {
    planTier,
    planStatus,
    limit,
    usage: Number(row.tracked_email_count_current_month || 0),
    bucket,
    billingPlan,
    billingType,
    planExpiresAt,
    billingFailureState: row.billing_failure_state || null
  };
}

async function ensurePlanStateAsync(db, userId) {
  const bucket = currentMonthBucket();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const row = await db
    .prepare(
      `SELECT plan_tier, plan_status, monthly_tracked_email_limit, tracked_email_count_current_month, tracked_email_month_bucket,
              billing_plan, billing_type, plan_expires_at, billing_failure_state
         FROM users WHERE id = ?`
    )
    .get(userId);
  if (!row) {
    throw new Error('USER_NOT_FOUND');
  }

  let planTier = row.plan_tier || 'free';
  let planStatus = row.plan_status || 'active';
  let billingPlan = String(row.billing_plan || '').trim().toLowerCase() || (planTier === 'pro' ? 'pro_monthly' : 'free');
  let billingType = normalizeBillingType(row.billing_type);
  let planExpiresAt = row.plan_expires_at || null;
  const planExpiresAtMs = parseIsoMs(planExpiresAt);
  let effectiveLimit = resolvePlanLimit(planTier, row.monthly_tracked_email_limit);

  const oneTimeActive =
    billingType === BILLING_TYPES.ONE_TIME && Number.isFinite(planExpiresAtMs) && planExpiresAtMs > nowMs;
  const oneTimeExpired =
    billingType === BILLING_TYPES.ONE_TIME &&
    (!Number.isFinite(planExpiresAtMs) || planExpiresAtMs <= nowMs);

  if (oneTimeActive) {
    const proLimit = resolvePlanLimit('pro', null);
    const currentLimit = resolvePlanLimit(planTier, row.monthly_tracked_email_limit);
    if (planTier !== 'pro' || planStatus !== 'active' || currentLimit !== proLimit) {
      await db
        .prepare(
          `UPDATE users
             SET plan_tier = 'pro',
                 plan_status = 'active',
                 monthly_tracked_email_limit = ?,
                 updated_at = ?
           WHERE id = ?`
        )
        .run(proLimit, nowIso, userId);
    }
    planTier = 'pro';
    planStatus = 'active';
    billingPlan = 'job_search_plan';
    billingType = BILLING_TYPES.ONE_TIME;
    effectiveLimit = proLimit;
  } else if (billingType === BILLING_TYPES.SUBSCRIPTION && String(planStatus || '').toLowerCase() === 'active') {
    const proLimit = resolvePlanLimit('pro', null);
    const currentLimit = resolvePlanLimit(planTier, row.monthly_tracked_email_limit);
    if (planTier !== 'pro' || currentLimit !== proLimit) {
      await db
        .prepare(
          `UPDATE users
             SET plan_tier = 'pro',
                 monthly_tracked_email_limit = ?,
                 updated_at = ?
           WHERE id = ?`
        )
        .run(proLimit, nowIso, userId);
    }
    planTier = 'pro';
    billingPlan = billingPlan === 'job_search_plan' ? 'job_search_plan' : 'pro_monthly';
    billingType = BILLING_TYPES.SUBSCRIPTION;
    effectiveLimit = proLimit;
  } else if (oneTimeExpired) {
    const freeLimit = resolvePlanLimit('free', null);
    await db
      .prepare(
        `UPDATE users
           SET plan_tier = 'free',
               plan_status = 'active',
               monthly_tracked_email_limit = ?,
               billing_plan = 'free',
               billing_type = 'none',
               plan_expires_at = NULL,
               billing_failure_state = NULL,
               stripe_subscription_id = NULL,
               updated_at = ?
         WHERE id = ?`
      )
      .run(freeLimit, nowIso, userId);
    planTier = 'free';
    planStatus = 'active';
    billingPlan = 'free';
    billingType = BILLING_TYPES.NONE;
    planExpiresAt = null;
    effectiveLimit = freeLimit;
  }

  const limit = effectiveLimit;
  const needsReset = !row.tracked_email_month_bucket || row.tracked_email_month_bucket !== bucket;
  if (needsReset) {
    await db
      .prepare(
        `UPDATE users SET tracked_email_count_current_month = 0, tracked_email_month_bucket = ?, monthly_tracked_email_limit = COALESCE(monthly_tracked_email_limit, ?)
           WHERE id = ?`
      )
      .run(bucket, limit, userId);
    return {
      planTier,
      planStatus,
      limit,
      usage: 0,
      bucket,
      billingPlan,
      billingType,
      planExpiresAt,
      billingFailureState: row.billing_failure_state || null
    };
  }
  return {
    planTier,
    planStatus,
    limit,
    usage: Number(row.tracked_email_count_current_month || 0),
    bucket,
    billingPlan,
    billingType,
    planExpiresAt,
    billingFailureState: row.billing_failure_state || null
  };
}

function ensurePlanState(db, userId) {
  if (db && db.isAsync) {
    return ensurePlanStateAsync(db, userId);
  }
  return ensurePlanStateSync(db, userId);
}

function getGlobalCap() {
  const raw = process.env.GLOBAL_TRACKED_EMAIL_CAP;
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function readGlobalUsageSync(db, bucket) {
  const row = db
    .prepare(
      `SELECT SUM(tracked_email_count_current_month) AS total FROM users WHERE tracked_email_month_bucket = ?`
    )
    .get(bucket);
  return Number(row?.total || 0);
}

async function readGlobalUsageAsync(db, bucket) {
  const row = await db
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
function applyTrackedEmailUsageSync(db, {
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
  const globalUsage = globalCap ? readGlobalUsageSync(db, plan.bucket) : null;
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

async function applyTrackedEmailUsageAsync(db, {
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

  if (!isJobRelated || !newEvent) {
    return {
      allowed: true,
      counted: false,
      reason: 'not_countable',
      plan: null
    };
  }

  const plan = await ensurePlanStateAsync(db, userId);
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
  const globalUsage = globalCap ? await readGlobalUsageAsync(db, plan.bucket) : null;
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

  await db
    .prepare(
      `UPDATE users
         SET tracked_email_count_current_month = tracked_email_count_current_month + 1,
             tracked_email_month_bucket = COALESCE(tracked_email_month_bucket, ?)
         WHERE id = ?`
    )
    .run(plan.bucket, userId);

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

function applyTrackedEmailUsage(db, args) {
  if (db && db.isAsync) {
    return applyTrackedEmailUsageAsync(db, args);
  }
  return applyTrackedEmailUsageSync(db, args);
}

module.exports = {
  PLAN_LIMITS,
  BILLING_TYPES,
  currentMonthBucket,
  resolvePlanLimit,
  applyTrackedEmailUsage,
  ensurePlanState
};
