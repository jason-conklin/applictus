const BILLING_OPTIONS = Object.freeze({
  FREE: 'free',
  PRO_MONTHLY: 'pro_monthly',
  JOB_SEARCH_PLAN: 'job_search_plan'
});

const PLAN_CONFIGS = Object.freeze({
  [BILLING_OPTIONS.FREE]: Object.freeze({
    tracked: 50,
    inboundDefault: 150,
    inboundEnvKeys: Object.freeze(['JOBTRACK_FREE_MONTHLY_INBOUND_LIMIT'])
  }),
  [BILLING_OPTIONS.PRO_MONTHLY]: Object.freeze({
    tracked: null,
    inboundDefault: null,
    inboundEnvKeys: Object.freeze([])
  }),
  [BILLING_OPTIONS.JOB_SEARCH_PLAN]: Object.freeze({
    tracked: null,
    inboundDefault: null,
    inboundEnvKeys: Object.freeze([])
  })
});

const PLAN_LIMITS = Object.freeze({
  free: PLAN_CONFIGS[BILLING_OPTIONS.FREE].tracked,
  pro: PLAN_CONFIGS[BILLING_OPTIONS.PRO_MONTHLY].tracked
});

const INBOUND_PLAN_LIMITS = Object.freeze({
  free: PLAN_CONFIGS[BILLING_OPTIONS.FREE].inboundDefault,
  pro: PLAN_CONFIGS[BILLING_OPTIONS.PRO_MONTHLY].inboundDefault
});

const FORWARDING_FILTER_STATUSES = Object.freeze({
  HEALTHY: 'healthy',
  FILTER_REVIEW_RECOMMENDED: 'filter_review_recommended',
  HIGH_FORWARDING_VOLUME: 'high_forwarding_volume',
  INGESTION_PAUSED_OR_LIMITED: 'ingestion_paused_or_limited'
});

const FORWARDING_FAIR_USE_DEFAULTS = Object.freeze({
  paidWarningThreshold: 1000,
  paidReviewThreshold: 2000,
  paidDailySpikeThreshold: 250,
  paidPauseThreshold: 5000,
  lowRelevanceMinVolume: 100,
  minRelevanceRate: 0.2
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

function normalizePlanTier(value) {
  const normalized = String(value || 'free').trim().toLowerCase();
  return normalized === 'pro' ? 'pro' : 'free';
}

function normalizeBillingPlan(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === BILLING_OPTIONS.JOB_SEARCH_PLAN) {
    return BILLING_OPTIONS.JOB_SEARCH_PLAN;
  }
  if (normalized === BILLING_OPTIONS.PRO_MONTHLY) {
    return BILLING_OPTIONS.PRO_MONTHLY;
  }
  return BILLING_OPTIONS.FREE;
}

function resolvePlanKey(tier, billingPlan = null) {
  const normalizedTier = normalizePlanTier(tier);
  const normalizedBillingPlan = normalizeBillingPlan(billingPlan);
  if (normalizedBillingPlan === BILLING_OPTIONS.JOB_SEARCH_PLAN) {
    return BILLING_OPTIONS.JOB_SEARCH_PLAN;
  }
  if (normalizedTier === 'pro' || normalizedBillingPlan === BILLING_OPTIONS.PRO_MONTHLY) {
    return BILLING_OPTIONS.PRO_MONTHLY;
  }
  return BILLING_OPTIONS.FREE;
}

function resolveConfiguredInboundLimit(planKey) {
  const config = PLAN_CONFIGS[planKey] || PLAN_CONFIGS[BILLING_OPTIONS.FREE];
  const envKeys = Array.isArray(config.inboundEnvKeys) ? config.inboundEnvKeys : [];
  for (const key of envKeys) {
    const parsed = Number(process.env[key] || '');
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.max(1, Math.floor(parsed));
    }
  }
  return config.inboundDefault;
}

function resolvePlanLimit(tier, _explicitLimit = null, billingPlan = null) {
  const planKey = resolvePlanKey(tier, billingPlan);
  const config = PLAN_CONFIGS[planKey] || PLAN_CONFIGS[BILLING_OPTIONS.FREE];
  if (config.tracked == null) {
    return null;
  }
  return Number(config.tracked);
}

function resolveInboundLimit(tier, _explicitLimit = null, billingPlan = null) {
  const planKey = resolvePlanKey(tier, billingPlan);
  return resolveConfiguredInboundLimit(planKey);
}

function readPositiveIntegerEnv(keys, fallback) {
  const envKeys = Array.isArray(keys) ? keys : [keys];
  for (const key of envKeys) {
    const parsed = Number(process.env[key] || '');
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.max(1, Math.floor(parsed));
    }
  }
  return fallback;
}

function readRatioEnv(keys, fallback) {
  const envKeys = Array.isArray(keys) ? keys : [keys];
  for (const key of envKeys) {
    const parsed = Number(process.env[key] || '');
    if (Number.isFinite(parsed) && parsed > 0 && parsed < 1) {
      return parsed;
    }
  }
  return fallback;
}

function resolveForwardingFairUseThresholds() {
  return {
    paidWarningThreshold: readPositiveIntegerEnv(
      ['JOBTRACK_PAID_FORWARDING_WARNING_THRESHOLD', 'JOBTRACK_PAID_FORWARDING_SOFT_THRESHOLD'],
      FORWARDING_FAIR_USE_DEFAULTS.paidWarningThreshold
    ),
    paidReviewThreshold: readPositiveIntegerEnv(
      ['JOBTRACK_PAID_FORWARDING_REVIEW_THRESHOLD', 'JOBTRACK_PAID_FORWARDING_STRONG_THRESHOLD'],
      FORWARDING_FAIR_USE_DEFAULTS.paidReviewThreshold
    ),
    paidDailySpikeThreshold: readPositiveIntegerEnv(
      'JOBTRACK_PAID_FORWARDING_DAILY_SPIKE_THRESHOLD',
      FORWARDING_FAIR_USE_DEFAULTS.paidDailySpikeThreshold
    ),
    paidPauseThreshold: readPositiveIntegerEnv(
      'JOBTRACK_PAID_FORWARDING_PAUSE_THRESHOLD',
      FORWARDING_FAIR_USE_DEFAULTS.paidPauseThreshold
    ),
    lowRelevanceMinVolume: readPositiveIntegerEnv(
      'JOBTRACK_PAID_FORWARDING_LOW_RELEVANCE_MIN_VOLUME',
      FORWARDING_FAIR_USE_DEFAULTS.lowRelevanceMinVolume
    ),
    minRelevanceRate: readRatioEnv(
      'JOBTRACK_PAID_FORWARDING_MIN_RELEVANCE_RATE',
      FORWARDING_FAIR_USE_DEFAULTS.minRelevanceRate
    )
  };
}

function isPaidPlan({ planTier, billingPlan } = {}) {
  const planKey = resolvePlanKey(planTier, billingPlan);
  return planKey === BILLING_OPTIONS.PRO_MONTHLY || planKey === BILLING_OPTIONS.JOB_SEARCH_PLAN;
}

function formatRelevanceRate(value) {
  return Number.isFinite(value) ? Number(value.toFixed(4)) : null;
}

function resolveForwardingFairUseStatus({
  planTier = 'free',
  billingPlan = null,
  inboundUsage = 0,
  inboundRelevant = 0,
  inboundDroppedIrrelevant = 0,
  inboundDroppedOverCap = 0,
  dailyInboundUsage = 0,
  thresholds = resolveForwardingFairUseThresholds()
} = {}) {
  const usage = Math.max(0, Math.floor(Number(inboundUsage || 0)));
  const relevant = Math.max(0, Math.floor(Number(inboundRelevant || 0)));
  const droppedIrrelevant = Math.max(0, Math.floor(Number(inboundDroppedIrrelevant || 0)));
  const droppedOverCap = Math.max(0, Math.floor(Number(inboundDroppedOverCap || 0)));
  const dailyUsage = Math.max(0, Math.floor(Number(dailyInboundUsage || 0)));
  const relevanceRate = usage > 0 ? relevant / usage : 1;
  const paid = isPaidPlan({ planTier, billingPlan });

  if (!paid) {
    return {
      status: FORWARDING_FILTER_STATUSES.HEALTHY,
      level: 'none',
      label: 'Smart filter healthy',
      detail: 'Forwarding volume is normal.',
      reason: 'free_quota_managed',
      thresholds,
      relevanceRate: formatRelevanceRate(relevanceRate)
    };
  }

  if (droppedOverCap > 0) {
    return {
      status: FORWARDING_FILTER_STATUSES.INGESTION_PAUSED_OR_LIMITED,
      level: 'strong',
      label: 'Forwarding limited',
      detail: 'Forwarding volume is unusually high. Review your Gmail filter before sending more emails.',
      reason: 'over_cap_drop_detected',
      thresholds,
      relevanceRate: formatRelevanceRate(relevanceRate)
    };
  }

  if (
    usage >= thresholds.paidReviewThreshold ||
    usage >= thresholds.paidPauseThreshold ||
    dailyUsage >= thresholds.paidDailySpikeThreshold
  ) {
    return {
      status: FORWARDING_FILTER_STATUSES.HIGH_FORWARDING_VOLUME,
      level: 'strong',
      label: 'High forwarding volume',
      detail: 'Forwarding volume is high. Tighten your Gmail filter so only job-related emails are forwarded.',
      reason:
        usage >= thresholds.paidPauseThreshold
          ? 'monthly_volume_severe'
          : usage >= thresholds.paidReviewThreshold
            ? 'monthly_volume_high'
            : 'daily_spike',
      thresholds,
      relevanceRate: formatRelevanceRate(relevanceRate)
    };
  }

  if (
    usage >= thresholds.lowRelevanceMinVolume &&
    Number.isFinite(relevanceRate) &&
    relevanceRate < thresholds.minRelevanceRate
  ) {
    return {
      status: FORWARDING_FILTER_STATUSES.FILTER_REVIEW_RECOMMENDED,
      level: 'soft',
      label: 'Filter review recommended',
      detail: 'Most forwarded emails are not job updates. Review your Gmail filter to keep your timeline cleaner.',
      reason: 'low_relevance_rate',
      thresholds,
      relevanceRate: formatRelevanceRate(relevanceRate)
    };
  }

  if (usage >= thresholds.paidWarningThreshold || droppedIrrelevant >= thresholds.lowRelevanceMinVolume) {
    return {
      status: FORWARDING_FILTER_STATUSES.FILTER_REVIEW_RECOMMENDED,
      level: 'soft',
      label: 'Filter review recommended',
      detail: 'Forwarding volume is rising. A focused Gmail filter keeps tracking accurate and private.',
      reason: usage >= thresholds.paidWarningThreshold ? 'monthly_volume_warning' : 'irrelevant_volume_warning',
      thresholds,
      relevanceRate: formatRelevanceRate(relevanceRate)
    };
  }

  return {
    status: FORWARDING_FILTER_STATUSES.HEALTHY,
    level: 'none',
    label: 'Smart filter healthy',
    detail: 'Forwarding looks focused on job-related emails.',
    reason: 'healthy',
    thresholds,
    relevanceRate: formatRelevanceRate(relevanceRate)
  };
}

function planLimitsEqual(left, right) {
  const normalizedLeft = left == null ? null : Number(left);
  const normalizedRight = right == null ? null : Number(right);
  if (normalizedLeft == null || normalizedRight == null) {
    return normalizedLeft == null && normalizedRight == null;
  }
  return normalizedLeft === normalizedRight;
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

function resolveExpectedPlanEntitlements({ planTier, billingPlan }) {
  const normalizedTier = normalizePlanTier(planTier);
  const resolvedBillingPlan = normalizeBillingPlan(billingPlan);
  const effectivePlanKey = resolvePlanKey(normalizedTier, resolvedBillingPlan);
  return {
    planTier: effectivePlanKey === BILLING_OPTIONS.FREE ? 'free' : 'pro',
    billingPlan:
      effectivePlanKey === BILLING_OPTIONS.JOB_SEARCH_PLAN
        ? BILLING_OPTIONS.JOB_SEARCH_PLAN
        : effectivePlanKey === BILLING_OPTIONS.PRO_MONTHLY
          ? BILLING_OPTIONS.PRO_MONTHLY
          : BILLING_OPTIONS.FREE,
    trackedLimit: resolvePlanLimit(normalizedTier, null, effectivePlanKey),
    inboundLimit: resolveInboundLimit(normalizedTier, null, effectivePlanKey)
  };
}

function runMonthlyTrackedResetSync(db, {
  userId,
  trackedMonthBucket,
  bucket,
  trackedLimit
}) {
  const needsReset = !trackedMonthBucket || trackedMonthBucket !== bucket;
  if (needsReset) {
    db.prepare(
      `UPDATE users
          SET tracked_email_count_current_month = 0,
              tracked_email_month_bucket = ?,
              monthly_tracked_email_limit = ?
        WHERE id = ?`
    ).run(bucket, trackedLimit, userId);
  } else {
    db.prepare(
      `UPDATE users
          SET monthly_tracked_email_limit = ?
        WHERE id = ?`
    ).run(trackedLimit, userId);
  }
  return needsReset;
}

async function runMonthlyTrackedResetAsync(db, {
  userId,
  trackedMonthBucket,
  bucket,
  trackedLimit
}) {
  const needsReset = !trackedMonthBucket || trackedMonthBucket !== bucket;
  if (needsReset) {
    await db
      .prepare(
        `UPDATE users
            SET tracked_email_count_current_month = 0,
                tracked_email_month_bucket = ?,
                monthly_tracked_email_limit = ?
          WHERE id = ?`
      )
      .run(bucket, trackedLimit, userId);
  } else {
    await db
      .prepare(
        `UPDATE users
            SET monthly_tracked_email_limit = ?
          WHERE id = ?`
      )
      .run(trackedLimit, userId);
  }
  return needsReset;
}

function runMonthlyInboundResetSync(db, {
  userId,
  inboundMonthBucket,
  bucket,
  inboundLimit
}) {
  const needsReset = !inboundMonthBucket || inboundMonthBucket !== bucket;
  if (needsReset) {
    db.prepare(
      `UPDATE users
          SET inbound_email_count_current_month = 0,
              inbound_email_relevant_count_current_month = 0,
              inbound_email_dropped_count_current_month = 0,
              inbound_email_dropped_irrelevant_count_current_month = 0,
              inbound_email_dropped_over_cap_count_current_month = 0,
              inbound_email_month_bucket = ?,
              monthly_inbound_email_limit = ?
        WHERE id = ?`
    ).run(bucket, inboundLimit, userId);
  } else {
    db.prepare(
      `UPDATE users
          SET monthly_inbound_email_limit = ?
        WHERE id = ?`
    ).run(inboundLimit, userId);
  }
  return needsReset;
}

async function runMonthlyInboundResetAsync(db, {
  userId,
  inboundMonthBucket,
  bucket,
  inboundLimit
}) {
  const needsReset = !inboundMonthBucket || inboundMonthBucket !== bucket;
  if (needsReset) {
    await db
      .prepare(
        `UPDATE users
            SET inbound_email_count_current_month = 0,
                inbound_email_relevant_count_current_month = 0,
                inbound_email_dropped_count_current_month = 0,
                inbound_email_dropped_irrelevant_count_current_month = 0,
                inbound_email_dropped_over_cap_count_current_month = 0,
                inbound_email_month_bucket = ?,
                monthly_inbound_email_limit = ?
          WHERE id = ?`
      )
      .run(bucket, inboundLimit, userId);
  } else {
    await db
      .prepare(
        `UPDATE users
            SET monthly_inbound_email_limit = ?
          WHERE id = ?`
      )
      .run(inboundLimit, userId);
  }
  return needsReset;
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
  let billingPlan = normalizeBillingPlan(
    row.billing_plan || (String(planTier || '').toLowerCase() === 'pro' ? BILLING_OPTIONS.PRO_MONTHLY : BILLING_OPTIONS.FREE)
  );
  let billingType = normalizeBillingType(row.billing_type);
  let planExpiresAt = row.plan_expires_at || null;
  const planExpiresAtMs = parseIsoMs(planExpiresAt);
  let { trackedLimit: effectiveLimit, inboundLimit } = resolveExpectedPlanEntitlements({
    planTier,
    billingPlan
  });

  const oneTimeActive =
    billingType === BILLING_TYPES.ONE_TIME && Number.isFinite(planExpiresAtMs) && planExpiresAtMs > nowMs;
  const oneTimeExpired =
    billingType === BILLING_TYPES.ONE_TIME &&
    (!Number.isFinite(planExpiresAtMs) || planExpiresAtMs <= nowMs);

  if (oneTimeActive) {
    const oneTimeEntitlements = resolveExpectedPlanEntitlements({
      planTier: 'pro',
      billingPlan: BILLING_OPTIONS.JOB_SEARCH_PLAN
    });
	    if (
	      normalizePlanTier(planTier) !== oneTimeEntitlements.planTier ||
	      planStatus !== 'active' ||
	      !planLimitsEqual(row.monthly_tracked_email_limit, oneTimeEntitlements.trackedLimit) ||
	      !planLimitsEqual(row.monthly_inbound_email_limit, oneTimeEntitlements.inboundLimit)
	    ) {
      db.prepare(
        `UPDATE users
           SET plan_tier = 'pro',
               plan_status = 'active',
               monthly_tracked_email_limit = ?,
               monthly_inbound_email_limit = ?,
               updated_at = ?
         WHERE id = ?`
      ).run(oneTimeEntitlements.trackedLimit, oneTimeEntitlements.inboundLimit, nowIso, userId);
    }
    planTier = 'pro';
    planStatus = 'active';
    billingPlan = BILLING_OPTIONS.JOB_SEARCH_PLAN;
    billingType = BILLING_TYPES.ONE_TIME;
    effectiveLimit = oneTimeEntitlements.trackedLimit;
    inboundLimit = oneTimeEntitlements.inboundLimit;
  } else if (billingType === BILLING_TYPES.SUBSCRIPTION && String(planStatus || '').toLowerCase() === 'active') {
    const monthlyEntitlements = resolveExpectedPlanEntitlements({
      planTier: 'pro',
      billingPlan: BILLING_OPTIONS.PRO_MONTHLY
    });
	    if (
	      normalizePlanTier(planTier) !== monthlyEntitlements.planTier ||
	      !planLimitsEqual(row.monthly_tracked_email_limit, monthlyEntitlements.trackedLimit) ||
	      !planLimitsEqual(row.monthly_inbound_email_limit, monthlyEntitlements.inboundLimit)
	    ) {
      db.prepare(
        `UPDATE users
           SET plan_tier = 'pro',
               monthly_tracked_email_limit = ?,
               monthly_inbound_email_limit = ?,
               updated_at = ?
         WHERE id = ?`
      ).run(monthlyEntitlements.trackedLimit, monthlyEntitlements.inboundLimit, nowIso, userId);
    }
    planTier = 'pro';
    billingPlan = BILLING_OPTIONS.PRO_MONTHLY;
    billingType = BILLING_TYPES.SUBSCRIPTION;
    effectiveLimit = monthlyEntitlements.trackedLimit;
    inboundLimit = monthlyEntitlements.inboundLimit;
  } else if (oneTimeExpired) {
    const freeEntitlements = resolveExpectedPlanEntitlements({
      planTier: 'free',
      billingPlan: BILLING_OPTIONS.FREE
    });
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
    ).run(freeEntitlements.trackedLimit, freeEntitlements.inboundLimit, nowIso, userId);
    planTier = 'free';
    planStatus = 'active';
    billingPlan = BILLING_OPTIONS.FREE;
    billingType = BILLING_TYPES.NONE;
    planExpiresAt = null;
    effectiveLimit = freeEntitlements.trackedLimit;
    inboundLimit = freeEntitlements.inboundLimit;
  }

  const finalEntitlements = resolveExpectedPlanEntitlements({ planTier, billingPlan });
  planTier = finalEntitlements.planTier;
  billingPlan = finalEntitlements.billingPlan;
  effectiveLimit = finalEntitlements.trackedLimit;
  inboundLimit = finalEntitlements.inboundLimit;

	  const needsEntitlementSync =
	    normalizePlanTier(row.plan_tier) !== planTier ||
	    normalizeBillingPlan(row.billing_plan) !== billingPlan ||
	    !planLimitsEqual(row.monthly_tracked_email_limit, effectiveLimit) ||
	    !planLimitsEqual(row.monthly_inbound_email_limit, inboundLimit);
  if (needsEntitlementSync) {
    db.prepare(
      `UPDATE users
          SET plan_tier = ?,
              billing_plan = ?,
              monthly_tracked_email_limit = ?,
              monthly_inbound_email_limit = ?,
              updated_at = ?
        WHERE id = ?`
    ).run(planTier, billingPlan, effectiveLimit, inboundLimit, nowIso, userId);
  }

  const limit = effectiveLimit;
  let inboundUsage = Number(row.inbound_email_count_current_month || 0);
  let inboundRelevant = Number(row.inbound_email_relevant_count_current_month || 0);
  let inboundDropped = Number(row.inbound_email_dropped_count_current_month || 0);
  let inboundDroppedIrrelevant = Number(row.inbound_email_dropped_irrelevant_count_current_month || 0);
  let inboundDroppedOverCap = Number(row.inbound_email_dropped_over_cap_count_current_month || 0);
  const needsReset = runMonthlyTrackedResetSync(db, {
    userId,
    trackedMonthBucket: row.tracked_email_month_bucket,
    bucket,
    trackedLimit: limit
  });

  const needsInboundReset = runMonthlyInboundResetSync(db, {
    userId,
    inboundMonthBucket: row.inbound_email_month_bucket,
    bucket,
    inboundLimit
  });
  if (needsInboundReset) {
    inboundUsage = 0;
    inboundRelevant = 0;
    inboundDropped = 0;
    inboundDroppedIrrelevant = 0;
    inboundDroppedOverCap = 0;
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
  let billingPlan = normalizeBillingPlan(
    row.billing_plan || (String(planTier || '').toLowerCase() === 'pro' ? BILLING_OPTIONS.PRO_MONTHLY : BILLING_OPTIONS.FREE)
  );
  let billingType = normalizeBillingType(row.billing_type);
  let planExpiresAt = row.plan_expires_at || null;
  const planExpiresAtMs = parseIsoMs(planExpiresAt);
  let { trackedLimit: effectiveLimit, inboundLimit } = resolveExpectedPlanEntitlements({
    planTier,
    billingPlan
  });

  const oneTimeActive =
    billingType === BILLING_TYPES.ONE_TIME && Number.isFinite(planExpiresAtMs) && planExpiresAtMs > nowMs;
  const oneTimeExpired =
    billingType === BILLING_TYPES.ONE_TIME &&
    (!Number.isFinite(planExpiresAtMs) || planExpiresAtMs <= nowMs);

  if (oneTimeActive) {
    const oneTimeEntitlements = resolveExpectedPlanEntitlements({
      planTier: 'pro',
      billingPlan: BILLING_OPTIONS.JOB_SEARCH_PLAN
    });
	    if (
	      normalizePlanTier(planTier) !== oneTimeEntitlements.planTier ||
	      planStatus !== 'active' ||
	      !planLimitsEqual(row.monthly_tracked_email_limit, oneTimeEntitlements.trackedLimit) ||
	      !planLimitsEqual(row.monthly_inbound_email_limit, oneTimeEntitlements.inboundLimit)
	    ) {
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
        .run(oneTimeEntitlements.trackedLimit, oneTimeEntitlements.inboundLimit, nowIso, userId);
    }
    planTier = 'pro';
    planStatus = 'active';
    billingPlan = BILLING_OPTIONS.JOB_SEARCH_PLAN;
    billingType = BILLING_TYPES.ONE_TIME;
    effectiveLimit = oneTimeEntitlements.trackedLimit;
    inboundLimit = oneTimeEntitlements.inboundLimit;
  } else if (billingType === BILLING_TYPES.SUBSCRIPTION && String(planStatus || '').toLowerCase() === 'active') {
    const monthlyEntitlements = resolveExpectedPlanEntitlements({
      planTier: 'pro',
      billingPlan: BILLING_OPTIONS.PRO_MONTHLY
    });
	    if (
	      normalizePlanTier(planTier) !== monthlyEntitlements.planTier ||
	      !planLimitsEqual(row.monthly_tracked_email_limit, monthlyEntitlements.trackedLimit) ||
	      !planLimitsEqual(row.monthly_inbound_email_limit, monthlyEntitlements.inboundLimit)
	    ) {
      await db
        .prepare(
          `UPDATE users
             SET plan_tier = 'pro',
                 monthly_tracked_email_limit = ?,
                 monthly_inbound_email_limit = ?,
                 updated_at = ?
           WHERE id = ?`
        )
        .run(monthlyEntitlements.trackedLimit, monthlyEntitlements.inboundLimit, nowIso, userId);
    }
    planTier = 'pro';
    billingPlan = BILLING_OPTIONS.PRO_MONTHLY;
    billingType = BILLING_TYPES.SUBSCRIPTION;
    effectiveLimit = monthlyEntitlements.trackedLimit;
    inboundLimit = monthlyEntitlements.inboundLimit;
  } else if (oneTimeExpired) {
    const freeEntitlements = resolveExpectedPlanEntitlements({
      planTier: 'free',
      billingPlan: BILLING_OPTIONS.FREE
    });
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
      .run(freeEntitlements.trackedLimit, freeEntitlements.inboundLimit, nowIso, userId);
    planTier = 'free';
    planStatus = 'active';
    billingPlan = BILLING_OPTIONS.FREE;
    billingType = BILLING_TYPES.NONE;
    planExpiresAt = null;
    effectiveLimit = freeEntitlements.trackedLimit;
    inboundLimit = freeEntitlements.inboundLimit;
  }

  const finalEntitlements = resolveExpectedPlanEntitlements({ planTier, billingPlan });
  planTier = finalEntitlements.planTier;
  billingPlan = finalEntitlements.billingPlan;
  effectiveLimit = finalEntitlements.trackedLimit;
  inboundLimit = finalEntitlements.inboundLimit;

	  const needsEntitlementSync =
	    normalizePlanTier(row.plan_tier) !== planTier ||
	    normalizeBillingPlan(row.billing_plan) !== billingPlan ||
	    !planLimitsEqual(row.monthly_tracked_email_limit, effectiveLimit) ||
	    !planLimitsEqual(row.monthly_inbound_email_limit, inboundLimit);
  if (needsEntitlementSync) {
    await db
      .prepare(
        `UPDATE users
            SET plan_tier = ?,
                billing_plan = ?,
                monthly_tracked_email_limit = ?,
                monthly_inbound_email_limit = ?,
                updated_at = ?
          WHERE id = ?`
      )
      .run(planTier, billingPlan, effectiveLimit, inboundLimit, nowIso, userId);
  }

  const limit = effectiveLimit;
  let inboundUsage = Number(row.inbound_email_count_current_month || 0);
  let inboundRelevant = Number(row.inbound_email_relevant_count_current_month || 0);
  let inboundDropped = Number(row.inbound_email_dropped_count_current_month || 0);
  let inboundDroppedIrrelevant = Number(row.inbound_email_dropped_irrelevant_count_current_month || 0);
  let inboundDroppedOverCap = Number(row.inbound_email_dropped_over_cap_count_current_month || 0);
  const needsReset = await runMonthlyTrackedResetAsync(db, {
    userId,
    trackedMonthBucket: row.tracked_email_month_bucket,
    bucket,
    trackedLimit: limit
  });

  const needsInboundReset = await runMonthlyInboundResetAsync(db, {
    userId,
    inboundMonthBucket: row.inbound_email_month_bucket,
    bucket,
    inboundLimit
  });
  if (needsInboundReset) {
    inboundUsage = 0;
    inboundRelevant = 0;
    inboundDropped = 0;
    inboundDroppedIrrelevant = 0;
    inboundDroppedOverCap = 0;
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

  const userLimit = Number(plan.limit || 0);
  if (userLimit > 0 && plan.usage >= userLimit) {
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

  const userLimit = Number(plan.limit || 0);
  if (userLimit > 0 && plan.usage >= userLimit) {
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
    dropped &&
    (
      normalizedDropReason === 'raw_inbound_cap' ||
      normalizedDropReason === 'raw_inbound_cap_reached' ||
      normalizedDropReason === 'processing_cap' ||
      normalizedDropReason === 'processing_cap_reached'
    )
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
    dropped &&
    (
      normalizedDropReason === 'raw_inbound_cap' ||
      normalizedDropReason === 'raw_inbound_cap_reached' ||
      normalizedDropReason === 'processing_cap' ||
      normalizedDropReason === 'processing_cap_reached'
    )
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
  FORWARDING_FILTER_STATUSES,
  FORWARDING_FAIR_USE_DEFAULTS,
  BILLING_TYPES,
  currentMonthBucket,
  resolvePlanLimit,
  resolveInboundLimit,
  resolveForwardingFairUseThresholds,
  resolveForwardingFairUseStatus,
  applyTrackedEmailUsage,
  applyInboundEmailReceiptUsage,
  applyInboundOutcomeUsage,
  ensurePlanState
};
