const { resolvePlanLimit, resolveInboundLimit, currentMonthBucket } = require('./planUsage');

const VALID_PLAN_TIERS = new Set(['free', 'pro']);

function normalizePlanTier(tier) {
  const t = String(tier || 'free').toLowerCase();
  return VALID_PLAN_TIERS.has(t) ? t : 'free';
}

function updateUserPlan(db, { userId, tier, status = 'active' }) {
  if (!db || typeof db.prepare !== 'function') throw new Error('DB_REQUIRED');
  if (!userId) throw new Error('USER_ID_REQUIRED');
  const plan_tier = normalizePlanTier(tier);
  const plan_status = String(status || 'active').toLowerCase();
  const limit = resolvePlanLimit(plan_tier, null);
  const inboundLimit = resolveInboundLimit(plan_tier, null);
  const bucket = currentMonthBucket();
  const billing_plan = plan_tier === 'pro' ? 'pro_monthly' : 'free';
  const billing_type = plan_tier === 'pro' ? 'subscription' : 'none';
  db.prepare(
    `UPDATE users
       SET plan_tier = ?,
           plan_status = ?,
           billing_plan = ?,
           billing_type = ?,
           plan_expires_at = NULL,
           stripe_subscription_id = CASE
             WHEN ? = 'free' THEN NULL
             ELSE stripe_subscription_id
           END,
           subscription_status = CASE
             WHEN ? = 'pro' THEN 'active'
             ELSE NULL
           END,
           current_period_end = NULL,
           cancel_at_period_end = 0,
           billing_failure_state = CASE
             WHEN ? = 'free' THEN NULL
             ELSE billing_failure_state
           END,
           monthly_tracked_email_limit = ?,
           monthly_inbound_email_limit = ?,
           tracked_email_count_current_month = CASE
             WHEN tracked_email_month_bucket = ? THEN tracked_email_count_current_month
             ELSE 0
           END,
           tracked_email_month_bucket = COALESCE(tracked_email_month_bucket, ?),
           inbound_email_count_current_month = CASE
             WHEN inbound_email_month_bucket = ? THEN COALESCE(inbound_email_count_current_month, 0)
             ELSE 0
           END,
           inbound_email_relevant_count_current_month = CASE
             WHEN inbound_email_month_bucket = ? THEN COALESCE(inbound_email_relevant_count_current_month, 0)
             ELSE 0
           END,
           inbound_email_dropped_count_current_month = CASE
             WHEN inbound_email_month_bucket = ? THEN COALESCE(inbound_email_dropped_count_current_month, 0)
             ELSE 0
           END,
           inbound_email_dropped_irrelevant_count_current_month = CASE
             WHEN inbound_email_month_bucket = ? THEN COALESCE(inbound_email_dropped_irrelevant_count_current_month, 0)
             ELSE 0
           END,
           inbound_email_dropped_over_cap_count_current_month = CASE
             WHEN inbound_email_month_bucket = ? THEN COALESCE(inbound_email_dropped_over_cap_count_current_month, 0)
             ELSE 0
           END,
           inbound_email_month_bucket = COALESCE(inbound_email_month_bucket, ?)
     WHERE id = ?`
  ).run(
    plan_tier,
    plan_status,
    billing_plan,
    billing_type,
    plan_tier,
    plan_tier,
    plan_tier,
    limit,
    inboundLimit,
    bucket,
    bucket,
    bucket,
    bucket,
    bucket,
    bucket,
    bucket,
    bucket,
    userId
  );
  return { plan_tier, plan_status, billing_plan, billing_type, limit, inboundLimit, bucket };
}

function getUserPlan(db, userId) {
  const row = db
    .prepare(
      `SELECT plan_tier, plan_status, monthly_tracked_email_limit, tracked_email_count_current_month, tracked_email_month_bucket,
              monthly_inbound_email_limit, inbound_email_count_current_month, inbound_email_month_bucket,
              inbound_email_relevant_count_current_month, inbound_email_dropped_count_current_month,
              inbound_email_dropped_irrelevant_count_current_month, inbound_email_dropped_over_cap_count_current_month,
              billing_plan, billing_type, plan_expires_at, billing_failure_state, stripe_customer_id, stripe_subscription_id,
              subscription_status, current_period_end, cancel_at_period_end
         FROM users WHERE id = ?`
    )
    .get(userId);
  if (!row) return null;
  return {
    tier: row.plan_tier || 'free',
    status: row.plan_status || 'active',
    limit: row.monthly_tracked_email_limit || resolvePlanLimit(row.plan_tier, null),
    inbound_limit: row.monthly_inbound_email_limit || resolveInboundLimit(row.plan_tier, null),
    usage: Number(row.tracked_email_count_current_month || 0),
    inbound_usage: Number(row.inbound_email_count_current_month || 0),
    bucket: row.tracked_email_month_bucket || currentMonthBucket(),
    inbound_bucket: row.inbound_email_month_bucket || currentMonthBucket(),
    inbound_relevant_count: Number(row.inbound_email_relevant_count_current_month || 0),
    inbound_dropped_count: Number(row.inbound_email_dropped_count_current_month || 0),
    inbound_dropped_irrelevant_count: Number(row.inbound_email_dropped_irrelevant_count_current_month || 0),
    inbound_dropped_over_cap_count: Number(row.inbound_email_dropped_over_cap_count_current_month || 0),
    billing_plan: row.billing_plan || (row.plan_tier === 'pro' ? 'pro_monthly' : 'free'),
    billing_type: row.billing_type || 'none',
    plan_expires_at: row.plan_expires_at || null,
    billing_failure_state: row.billing_failure_state || null,
    subscription_status: row.subscription_status || null,
    current_period_end: row.current_period_end || null,
    cancel_at_period_end: row.cancel_at_period_end === true || row.cancel_at_period_end === 1 || row.cancel_at_period_end === '1',
    stripe_customer_id: row.stripe_customer_id || null,
    stripe_subscription_id: row.stripe_subscription_id || null
  };
}

module.exports = {
  updateUserPlan,
  getUserPlan
};
