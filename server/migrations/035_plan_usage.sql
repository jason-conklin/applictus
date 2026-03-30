-- Plan and usage tracking (SQLite)

ALTER TABLE users
  ADD COLUMN plan_tier TEXT NOT NULL DEFAULT 'free';

ALTER TABLE users
  ADD COLUMN plan_status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE users
  ADD COLUMN monthly_tracked_email_limit INTEGER;

ALTER TABLE users
  ADD COLUMN tracked_email_count_current_month INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users
  ADD COLUMN tracked_email_month_bucket TEXT;

