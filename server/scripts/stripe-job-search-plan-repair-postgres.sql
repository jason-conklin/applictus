-- One-time diagnostic and repair template for a paid Job Search Plan checkout.
-- Intended for Supabase/Postgres production. Do not run until the Stripe Dashboard
-- values below have been verified against the payment, Checkout Session, and webhook event.
--
-- Payment to inspect: pi_3TaheTKZnznBTYOK01M35ako
--
-- Fill in exactly one Applictus user id after verifying it in Stripe metadata or by
-- matching the Checkout customer email to public.users.email.

-- Diagnostic lookup after identifying the Stripe customer email/customer id:
--
-- SELECT
--   id, email, plan_tier, plan_status, billing_plan, billing_type,
--   plan_expires_at, monthly_tracked_email_limit, monthly_inbound_email_limit,
--   stripe_customer_id, stripe_subscription_id, subscription_status,
--   current_period_end, billing_last_event_id, billing_last_event_at,
--   tracked_email_count_current_month, inbound_email_count_current_month
-- FROM public.users
-- WHERE lower(email) = lower('<CUSTOMER_EMAIL>')
--    OR stripe_customer_id = '<STRIPE_CUSTOMER_ID>'
--    OR id = '<APP_USER_ID>'::uuid;
--
-- SELECT id, user_id, email, local_part, address, is_active, created_at, updated_at
-- FROM public.inbound_addresses
-- WHERE user_id = '<APP_USER_ID>'::uuid
-- ORDER BY created_at DESC;

BEGIN;

WITH params AS (
  SELECT
    '<APP_USER_ID>'::uuid AS user_id,
    '<STRIPE_CUSTOMER_ID>'::text AS stripe_customer_id,
    '<STRIPE_EVENT_ID_OR_PAYMENT_INTENT_ID>'::text AS billing_event_id,
    '<PURCHASED_AT_ISO>'::timestamptz AS purchased_at
)
SELECT
  u.id,
  u.email,
  u.plan_tier,
  u.plan_status,
  u.billing_plan,
  u.billing_type,
  u.plan_expires_at,
  u.monthly_tracked_email_limit,
  u.monthly_inbound_email_limit,
  u.stripe_customer_id,
  u.stripe_subscription_id,
  u.subscription_status,
  u.current_period_end,
  u.billing_last_event_id,
  u.billing_last_event_at
FROM public.users u
JOIN params p ON p.user_id = u.id;

-- Review the SELECT above first. Then run this UPDATE only for the verified user.
WITH params AS (
  SELECT
    '<APP_USER_ID>'::uuid AS user_id,
    NULLIF('<STRIPE_CUSTOMER_ID>', '')::text AS stripe_customer_id,
    NULLIF('<STRIPE_EVENT_ID_OR_PAYMENT_INTENT_ID>', '')::text AS billing_event_id,
    '<PURCHASED_AT_ISO>'::timestamptz AS purchased_at
)
UPDATE public.users u
SET
  plan_tier = 'pro',
  plan_status = 'active',
  monthly_tracked_email_limit = NULL,
  monthly_inbound_email_limit = NULL,
  billing_plan = 'job_search_plan',
  billing_type = 'one_time',
  plan_expires_at = p.purchased_at + interval '90 days',
  stripe_customer_id = COALESCE(p.stripe_customer_id, u.stripe_customer_id),
  stripe_subscription_id = NULL,
  subscription_status = NULL,
  current_period_end = NULL,
  cancel_at_period_end = false,
  billing_failure_state = NULL,
  billing_last_event_id = COALESCE(p.billing_event_id, u.billing_last_event_id),
  billing_last_event_at = p.purchased_at,
  updated_at = now()
FROM params p
WHERE u.id = p.user_id
RETURNING
  u.id,
  u.email,
  u.plan_tier,
  u.plan_status,
  u.billing_plan,
  u.billing_type,
  u.plan_expires_at,
  u.monthly_tracked_email_limit,
  u.monthly_inbound_email_limit,
  u.stripe_customer_id,
  u.stripe_subscription_id,
  u.billing_last_event_id,
  u.billing_last_event_at;

-- Keep ROLLBACK while reviewing. Change to COMMIT only after the returned row is correct.
ROLLBACK;
