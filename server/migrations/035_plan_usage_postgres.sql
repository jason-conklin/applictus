-- Plan and usage tracking (Postgres)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS plan_tier text NOT NULL DEFAULT 'free';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS plan_status text NOT NULL DEFAULT 'active';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS monthly_tracked_email_limit integer;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tracked_email_count_current_month integer NOT NULL DEFAULT 0;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tracked_email_month_bucket text;

