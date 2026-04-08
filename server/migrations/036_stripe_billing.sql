-- Stripe billing metadata (SQLite)

ALTER TABLE users
  ADD COLUMN stripe_customer_id TEXT;

ALTER TABLE users
  ADD COLUMN stripe_subscription_id TEXT;

ALTER TABLE users
  ADD COLUMN billing_plan TEXT NOT NULL DEFAULT 'free';

ALTER TABLE users
  ADD COLUMN billing_type TEXT NOT NULL DEFAULT 'none';

ALTER TABLE users
  ADD COLUMN plan_expires_at TEXT;

ALTER TABLE users
  ADD COLUMN billing_failure_state TEXT;

ALTER TABLE users
  ADD COLUMN billing_last_event_id TEXT;

ALTER TABLE users
  ADD COLUMN billing_last_event_at TEXT;

CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_stripe_subscription_id ON users(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_users_billing_plan ON users(billing_plan);
