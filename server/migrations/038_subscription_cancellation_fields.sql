-- Subscription lifecycle visibility fields (SQLite).

ALTER TABLE users
  ADD COLUMN subscription_status TEXT;

ALTER TABLE users
  ADD COLUMN current_period_end TEXT;

ALTER TABLE users
  ADD COLUMN cancel_at_period_end INTEGER NOT NULL DEFAULT 0;

UPDATE users
SET subscription_status = 'active'
WHERE lower(COALESCE(billing_type, 'none')) = 'subscription'
  AND (subscription_status IS NULL OR trim(subscription_status) = '');
