-- Subscription lifecycle visibility fields (Postgres).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_status text;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

UPDATE users
SET subscription_status = 'active'
WHERE lower(COALESCE(billing_type, 'none')) = 'subscription'
  AND (subscription_status IS NULL OR btrim(subscription_status) = '');
