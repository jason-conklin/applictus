const PLAN_LIMITS = Object.freeze({
  free: 50,
  pro: 500
});

const INBOUND_PLAN_LIMITS = Object.freeze({
  free: 300,
  pro: 3000
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

function resolveConfiguredInboundLimit(tier) {
  const normalized = String(tier || 'free').toLowerCase();
  const key = normalized === 'pro' ? 'JOBTRACK_PRO_MONTHLY_INBOUND_LIMIT' : 'JOBTRACK_FREE_MONTHLY_INBOUND_LIMIT';
  const parsed = Number(process.env[key] || '');
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.max(1, Math.floor(parsed));
  }
  return INBOUND_PLAN_LIMITS[normalized] || INBOUND_PLAN_LIMITS.free;
}

function resolveInboundLimit(tier, explicitLimit) {
  if (Number.isFinite(explicitLimit) && explicitLimit > 0) {
    return Math.max(1, Math.floor(explicitLimit));
  }
  return resolveConfiguredInboundLimit(tier);
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
              monthly_inbound_email_limit, inbound_email_count_current_month, inbound_email_month_bucket,
              inbound_email_relevant_count_current_month, inbound_email_dropped_count_current_month,
              inbound_email_dropped_irrelevant_count_current_month, inbound_email_dropped_over_cap_count_current_month,
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
  let inboundLimit = resolveInboundLimit(planTier, row.monthly_inbound_email_limit);

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
               monthly_inbound_email_limit = ?,
               updated_at = ?
         WHERE id = ?`
      ).run(proLimit, resolveInboundLimit('pro', null), nowIso, userId);
    }
    planTier = 'pro';
    planStatus = 'active';
    billingPlan = 'job_search_plan';
    billingType = BILLING_TYPES.ONE_TIME;
    effectiveLimit = proLimit;
    inboundLimit = resolveInboundLimit('pro', null);
  } else if (billingType === BILLING_TYPES.SUBSCRIPTION && String(planStatus || '').toLowerCase() === 'active') {
    const proLimit = resolvePlanLimit('pro', null);
    const currentLimit = resolvePlanLimit(planTier, row.monthly_tracked_email_limit);
    const proInboundLimit = resolveInboundLimit('pro', null);
    const currentInboundLimit = resolveInboundLimit(planTier, row.monthly_inbound_email_limit);
    if (planTier !== 'pro' || currentLimit !== proLimit || currentInboundLimit !== proInboundLimit) {
      db.prepare(
        `UPDATE users
           SET plan_tier = 'pro',
               monthly_tracked_email_limit = ?,
               monthly_inbound_email_limit = ?,
               updated_at = ?
         WHERE id = ?`
      ).run(proLimit, proInboundLimit, nowIso, userId);
    }
    planTier = 'pro';
    billingPlan = billingPlan === 'job_search_plan' ? 'job_search_plan' : 'pro_monthly';
    billingType = BILLING_TYPES.SUBSCRIPTION;
    effectiveLimit = proLimit;
    inboundLimit = proInboundLimit;
  } else if (oneTimeExpired) {
    const freeLimit = resolvePlanLimit('free', null);
    const freeInboundLimit = resolveInboundLimit('free', null);
    db.prepare(
      `UPDATE users
         SET plan_tier = 'free',
             plan_status = 'active',
             monthly_tracked_email_limit = ?,
             monthly_inbound_email_limit = ?,
             billing_plan = 'free',
             billing_type = 'none',
             plan_expires_at = NULL,
             billing_failure_state = NULL,
             stripe_subscription_id = NULL,
             updated_at = ?
       WHERE id = ?`
    ).run(freeLimit, freeInboundLimit, nowIso, userId);
    planTier = 'free';
    planStatus = 'active';
    billingPlan = 'free';
    billingType = BILLING_TYPES.NONE;
    planExpiresAt = null;
    effectiveLimit = freeLimit;
    inboundLimit = freeInboundLimit;
  }

  const limit = effectiveLimit;
  let inboundUsage = Number(row.inbound_email_count_current_month || 0);
  let inboundRelevant = Number(row.inbound_email_relevant_count_current_month || 0);
  let inboundDropped = Number(row.inbound_email_dropped_count_current_month || 0);
  let inboundDroppedIrrelevant = Number(row.inbound_email_dropped_irrelevant_count_current_month || 0);
  let inboundDroppedOverCap = Number(row.inbound_email_dropped_over_cap_count_current_month || 0);
  const needsReset = !row.tracked_email_month_bucket || row.tracked_email_month_bucket !== bucket;
  if (needsReset) {
    db.prepare(
      `UPDATE users SET tracked_email_count_current_month = 0, tracked_email_month_bucket = ?, monthly_tracked_email_limit = COALESCE(monthly_tracked_email_limit, ?)
         WHERE id = ?`
    ).run(bucket, limit, userId);
  }

  const needsInboundReset = !row.inbound_email_month_bucket || row.inbound_email_month_bucket !== bucket;
  if (needsInboundReset) {
    db.prepare(
      `UPDATE users
          SET inbound_email_count_current_month = 0,
              inbound_email_relevant_count_current_month = 0,
              inbound_email_dropped_count_current_month = 0,
              inbound_email_dropped_irrelevant_count_current_month = 0,
              inbound_email_dropped_over_cap_count_current_month = 0,
              inbound_email_month_bucket = ?,
              monthly_inbound_email_limit = COALESCE(monthly_inbound_email_limit, ?)
        WHERE id = ?`
    ).run(bucket, inboundLimit, userId);
    inboundUsage = 0;
    inboundRelevant = 0;
    inboundDropped = 0;
    inboundDroppedIrrelevant = 0;
    inboundDroppedOverCap = 0;
  } else {
    db.prepare(
      `UPDATE users
          SET monthly_inbound_email_limit = COALESCE(monthly_inbound_email_limit, ?)
        WHERE id = ?`
    ).run(inboundLimit, userId);
  }

  return {
    planTier,
    planStatus,
    limit,
    usage: needsReset ? 0 : Number(row.tracked_email_count_current_month || 0),
    bucket,
    inboundLimit,
    inboundUsage,
    inboundBucket: needsInboundReset ? bucket : row.inbound_email_month_bucket || bucket,
    inboundRelevant,
    inboundDropped,
    inboundDroppedIrrelevant,
    inboundDroppedOverCap,
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
              monthly_inbound_email_limit, inbound_email_count_current_month, inbound_email_month_bucket,
              inbound_email_relevant_count_current_month, inbound_email_dropped_count_current_month,
              inbound_email_dropped_irrelevant_count_current_month, inbound_email_dropped_over_cap_count_current_month,
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
  let inboundLimit = resolveInboundLimit(planTier, row.monthly_inbound_email_limit);

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
                 monthly_inbound_email_limit = ?,
                 updated_at = ?
           WHERE id = ?`
        )
        .run(proLimit, resolveInboundLimit('pro', null), nowIso, userId);
    }
    planTier = 'pro';
    planStatus = 'active';
    billingPlan = 'job_search_plan';
    billingType = BILLING_TYPES.ONE_TIME;
    effectiveLimit = proLimit;
    inboundLimit = resolveInboundLimit('pro', null);
  } else if (billingType === BILLING_TYPES.SUBSCRIPTION && String(planStatus || '').toLowerCase() === 'active') {
    const proLimit = resolvePlanLimit('pro', null);
    const currentLimit = resolvePlanLimit(planTier, row.monthly_tracked_email_limit);
    const proInboundLimit = resolveInboundLimit('pro', null);
    const currentInboundLimit = resolveInboundLimit(planTier, row.monthly_inbound_email_limit);
    if (planTier !== 'pro' || currentLimit !== proLimit || currentInboundLimit !== proInboundLimit) {
      await db
        .prepare(
          `UPDATE users
             SET plan_tier = 'pro',
                 monthly_tracked_email_limit = ?,
                 monthly_inbound_email_limit = ?,
                 updated_at = ?
           WHERE id = ?`
        )
        .run(proLimit, proInboundLimit, nowIso, userId);
    }
    planTier = 'pro';
    billingPlan = billingPlan === 'job_search_plan' ? 'job_search_plan' : 'pro_monthly';
    billingType = BILLING_TYPES.SUBSCRIPTION;
    effectiveLimit = proLimit;
    inboundLimit = proInboundLimit;
  } else if (oneTimeExpired) {
    const freeLimit = resolvePlanLimit('free', null);
    const freeInboundLimit = resolveInboundLimit('free', null);
    await db
      .prepare(
        `UPDATE users
           SET plan_tier = 'free',
               plan_status = 'active',
               monthly_tracked_email_limit = ?,
               monthly_inbound_email_limit = ?,
               billing_plan = 'free',
               billing_type = 'none',
               plan_expires_at = NULL,
               billing_failure_state = NULL,
               stripe_subscription_id = NULL,
               updated_at = ?
         WHERE id = ?`
      )
      .run(freeLimit, freeInboundLimit, nowIso, userId);
    planTier = 'free';
    planStatus = 'active';
    billingPlan = 'free';
    billingType = BILLING_TYPES.NONE;
    planExpiresAt = null;
    effectiveLimit = freeLimit;
    inboundLimit = freeInboundLimit;
  }

  const limit = effectiveLimit;
  let inboundUsage = Number(row.inbound_email_count_current_month || 0);
  let inboundRelevant = Number(row.inbound_email_relevant_count_current_month || 0);
  let inboundDropped = Number(row.inbound_email_dropped_count_current_month || 0);
  let inboundDroppedIrrelevant = Number(row.inbound_email_dropped_irrelevant_count_current_month || 0);
  let inboundDroppedOverCap = Number(row.inbound_email_dropped_over_cap_count_current_month || 0);
  const needsReset = !row.tracked_email_month_bucket || row.tracked_email_month_bucket !== bucket;
  if (needsReset) {
    await db
      .prepare(
        `UPDATE users SET tracked_email_count_current_month = 0, tracked_email_month_bucket = ?, monthly_tracked_email_limit = COALESCE(monthly_tracked_email_limit, ?)
           WHERE id = ?`
      )
      .run(bucket, limit, userId);
  }

  const needsInboundReset = !row.inbound_email_month_bucket || row.inbound_email_month_bucket !== bucket;
  if (needsInboundReset) {
    await db
      .prepare(
        `UPDATE users
            SET inbound_email_count_current_month = 0,
                inbound_email_relevant_count_current_month = 0,
                inbound_email_dropped_count_current_month = 0,
                inbound_email_dropped_irrelevant_count_current_month = 0,
                inbound_email_dropped_over_cap_count_current_month = 0,
                inbound_email_month_bucket = ?,
                monthly_inbound_email_limit = COALESCE(monthly_inbound_email_limit, ?)
          WHERE id = ?`
      )
      .run(bucket, inboundLimit, userId);
    inboundUsage = 0;
    inboundRelevant = 0;
    inboundDropped = 0;
    inboundDroppedIrrelevant = 0;
    inboundDroppedOverCap = 0;
  } else {
    await db
      .prepare(
        `UPDATE users
            SET monthly_inbound_email_limit = COALESCE(monthly_inbound_email_limit, ?)
          WHERE id = ?`
      )
      .run(inboundLimit, userId);
  }

  return {
    planTier,
    planStatus,
    limit,
    usage: needsReset ? 0 : Number(row.tracked_email_count_current_month || 0),
    bucket,
    inboundLimit,
    inboundUsage,
    inboundBucket: needsInboundReset ? bucket : row.inbound_email_month_bucket || bucket,
    inboundRelevant,
    inboundDropped,
    inboundDroppedIrrelevant,
    inboundDroppedOverCap,
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

function applyInboundEmailReceiptUsageSync(db, {
  userId,
  countable = true
}) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('DB_REQUIRED');
  }
  if (!userId) {
    throw new Error('USER_ID_REQUIRED');
  }
  if (!countable) {
    return {
      counted: false,
      reason: 'not_countable',
      plan: null
    };
  }

  const plan = ensurePlanStateSync(db, userId);
  const inboundBucket = plan.inboundBucket || plan.bucket;
  db.prepare(
    `UPDATE users
       SET inbound_email_count_current_month = COALESCE(inbound_email_count_current_month, 0) + 1,
           inbound_email_month_bucket = COALESCE(inbound_email_month_bucket, ?)
     WHERE id = ?`
  ).run(inboundBucket, userId);
  const nextUsage = Number(plan.inboundUsage || 0) + 1;
  const limit = Number(plan.inboundLimit || 0);
  return {
    counted: true,
    reason: null,
    plan: {
      ...plan,
      inboundUsage: nextUsage,
      inboundBucket
    },
    cap: {
      usage: nextUsage,
      limit,
      overCap: limit > 0 ? nextUsage > limit : false
    }
  };
}

async function applyInboundEmailReceiptUsageAsync(db, {
  userId,
  countable = true
}) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('DB_REQUIRED');
  }
  if (!userId) {
    throw new Error('USER_ID_REQUIRED');
  }
  if (!countable) {
    return {
      counted: false,
      reason: 'not_countable',
      plan: null
    };
  }

  const plan = await ensurePlanStateAsync(db, userId);
  const inboundBucket = plan.inboundBucket || plan.bucket;
  await db
    .prepare(
      `UPDATE users
         SET inbound_email_count_current_month = COALESCE(inbound_email_count_current_month, 0) + 1,
             inbound_email_month_bucket = COALESCE(inbound_email_month_bucket, ?)
       WHERE id = ?`
    )
    .run(inboundBucket, userId);
  const nextUsage = Number(plan.inboundUsage || 0) + 1;
  const limit = Number(plan.inboundLimit || 0);
  return {
    counted: true,
    reason: null,
    plan: {
      ...plan,
      inboundUsage: nextUsage,
      inboundBucket
    },
    cap: {
      usage: nextUsage,
      limit,
      overCap: limit > 0 ? nextUsage > limit : false
    }
  };
}

function applyInboundEmailReceiptUsage(db, args) {
  if (db && db.isAsync) {
    return applyInboundEmailReceiptUsageAsync(db, args);
  }
  return applyInboundEmailReceiptUsageSync(db, args);
}

function applyInboundOutcomeUsageSync(db, {
  userId,
  relevant = false,
  dropped = false,
  dropReason = null
}) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('DB_REQUIRED');
  }
  if (!userId) {
    throw new Error('USER_ID_REQUIRED');
  }
  const incrementRelevant = relevant ? 1 : 0;
  const incrementDropped = dropped ? 1 : 0;
  const normalizedDropReason = String(dropReason || '').trim().toLowerCase();
  const incrementDroppedIrrelevant = dropped && normalizedDropReason === 'irrelevant' ? 1 : 0;
  const incrementDroppedOverCap =
    dropped && (normalizedDropReason === 'raw_inbound_cap' || normalizedDropReason === 'raw_inbound_cap_reached')
      ? 1
      : 0;
  if (!incrementRelevant && !incrementDropped && !incrementDroppedIrrelevant && !incrementDroppedOverCap) {
    return {
      counted: false,
      reason: 'not_countable',
      plan: null
    };
  }

  const plan = ensurePlanStateSync(db, userId);
  const inboundBucket = plan.inboundBucket || plan.bucket;
  db.prepare(
    `UPDATE users
       SET inbound_email_relevant_count_current_month = COALESCE(inbound_email_relevant_count_current_month, 0) + ?,
           inbound_email_dropped_count_current_month = COALESCE(inbound_email_dropped_count_current_month, 0) + ?,
           inbound_email_dropped_irrelevant_count_current_month = COALESCE(inbound_email_dropped_irrelevant_count_current_month, 0) + ?,
           inbound_email_dropped_over_cap_count_current_month = COALESCE(inbound_email_dropped_over_cap_count_current_month, 0) + ?,
           inbound_email_month_bucket = COALESCE(inbound_email_month_bucket, ?)
     WHERE id = ?`
  ).run(
    incrementRelevant,
    incrementDropped,
    incrementDroppedIrrelevant,
    incrementDroppedOverCap,
    inboundBucket,
    userId
  );

  return {
    counted: true,
    reason: null,
    plan: {
      ...plan,
      inboundRelevant: Number(plan.inboundRelevant || 0) + incrementRelevant,
      inboundDropped: Number(plan.inboundDropped || 0) + incrementDropped,
      inboundDroppedIrrelevant: Number(plan.inboundDroppedIrrelevant || 0) + incrementDroppedIrrelevant,
      inboundDroppedOverCap: Number(plan.inboundDroppedOverCap || 0) + incrementDroppedOverCap
    }
  };
}

async function applyInboundOutcomeUsageAsync(db, {
  userId,
  relevant = false,
  dropped = false,
  dropReason = null
}) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('DB_REQUIRED');
  }
  if (!userId) {
    throw new Error('USER_ID_REQUIRED');
  }
  const incrementRelevant = relevant ? 1 : 0;
  const incrementDropped = dropped ? 1 : 0;
  const normalizedDropReason = String(dropReason || '').trim().toLowerCase();
  const incrementDroppedIrrelevant = dropped && normalizedDropReason === 'irrelevant' ? 1 : 0;
  const incrementDroppedOverCap =
    dropped && (normalizedDropReason === 'raw_inbound_cap' || normalizedDropReason === 'raw_inbound_cap_reached')
      ? 1
      : 0;
  if (!incrementRelevant && !incrementDropped && !incrementDroppedIrrelevant && !incrementDroppedOverCap) {
    return {
      counted: false,
      reason: 'not_countable',
      plan: null
    };
  }

  const plan = await ensurePlanStateAsync(db, userId);
  const inboundBucket = plan.inboundBucket || plan.bucket;
  await db
    .prepare(
      `UPDATE users
         SET inbound_email_relevant_count_current_month = COALESCE(inbound_email_relevant_count_current_month, 0) + ?,
             inbound_email_dropped_count_current_month = COALESCE(inbound_email_dropped_count_current_month, 0) + ?,
             inbound_email_dropped_irrelevant_count_current_month = COALESCE(inbound_email_dropped_irrelevant_count_current_month, 0) + ?,
             inbound_email_dropped_over_cap_count_current_month = COALESCE(inbound_email_dropped_over_cap_count_current_month, 0) + ?,
             inbound_email_month_bucket = COALESCE(inbound_email_month_bucket, ?)
       WHERE id = ?`
    )
    .run(
      incrementRelevant,
      incrementDropped,
      incrementDroppedIrrelevant,
      incrementDroppedOverCap,
      inboundBucket,
      userId
    );

  return {
    counted: true,
    reason: null,
    plan: {
      ...plan,
      inboundRelevant: Number(plan.inboundRelevant || 0) + incrementRelevant,
      inboundDropped: Number(plan.inboundDropped || 0) + incrementDropped,
      inboundDroppedIrrelevant: Number(plan.inboundDroppedIrrelevant || 0) + incrementDroppedIrrelevant,
      inboundDroppedOverCap: Number(plan.inboundDroppedOverCap || 0) + incrementDroppedOverCap
    }
  };
}

function applyInboundOutcomeUsage(db, args) {
  if (db && db.isAsync) {
    return applyInboundOutcomeUsageAsync(db, args);
  }
  return applyInboundOutcomeUsageSync(db, args);
}

module.exports = {
  PLAN_LIMITS,
  INBOUND_PLAN_LIMITS,
  BILLING_TYPES,
  currentMonthBucket,
  resolvePlanLimit,
  resolveInboundLimit,
  applyTrackedEmailUsage,
  applyInboundEmailReceiptUsage,
  applyInboundOutcomeUsage,
  ensurePlanState
};
