const { resolvePlanLimit, currentMonthBucket } = require('./planUsage');

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
  const bucket = currentMonthBucket();
  db.prepare(
    `UPDATE users
       SET plan_tier = ?,
           plan_status = ?,
           monthly_tracked_email_limit = ?,
           tracked_email_count_current_month = CASE
             WHEN tracked_email_month_bucket = ? THEN tracked_email_count_current_month
             ELSE 0
           END,
           tracked_email_month_bucket = COALESCE(tracked_email_month_bucket, ?)
     WHERE id = ?`
  ).run(plan_tier, plan_status, limit, bucket, bucket, userId);
  return { plan_tier, plan_status, limit, bucket };
}

function getUserPlan(db, userId) {
  const row = db
    .prepare(
      `SELECT plan_tier, plan_status, monthly_tracked_email_limit, tracked_email_count_current_month, tracked_email_month_bucket
         FROM users WHERE id = ?`
    )
    .get(userId);
  if (!row) return null;
  return {
    tier: row.plan_tier || 'free',
    status: row.plan_status || 'active',
    limit: row.monthly_tracked_email_limit || resolvePlanLimit(row.plan_tier, null),
    usage: Number(row.tracked_email_count_current_month || 0),
    bucket: row.tracked_email_month_bucket || currentMonthBucket()
  };
}

module.exports = {
  updateUserPlan,
  getUserPlan
};
