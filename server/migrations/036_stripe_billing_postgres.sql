-- Stripe billing metadata (Postgres)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS billing_plan text NOT NULL DEFAULT 'free';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS billing_type text NOT NULL DEFAULT 'none';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS billing_failure_state text;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS billing_last_event_id text;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS billing_last_event_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_stripe_subscription_id ON users(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_users_billing_plan ON users(billing_plan);
