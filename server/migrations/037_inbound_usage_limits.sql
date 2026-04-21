-- Raw inbound usage accounting and safety caps (SQLite).

ALTER TABLE users
  ADD COLUMN monthly_inbound_email_limit INTEGER;

ALTER TABLE users
  ADD COLUMN inbound_email_count_current_month INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users
  ADD COLUMN inbound_email_month_bucket TEXT;

ALTER TABLE users
  ADD COLUMN inbound_email_relevant_count_current_month INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users
  ADD COLUMN inbound_email_dropped_count_current_month INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users
  ADD COLUMN inbound_email_dropped_irrelevant_count_current_month INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users
  ADD COLUMN inbound_email_dropped_over_cap_count_current_month INTEGER NOT NULL DEFAULT 0;

UPDATE users
SET monthly_inbound_email_limit = CASE
  WHEN lower(COALESCE(plan_tier, 'free')) = 'pro' THEN 3000
  ELSE 300
END
WHERE monthly_inbound_email_limit IS NULL;

UPDATE users
SET inbound_email_month_bucket = COALESCE(inbound_email_month_bucket, tracked_email_month_bucket)
WHERE inbound_email_month_bucket IS NULL;
