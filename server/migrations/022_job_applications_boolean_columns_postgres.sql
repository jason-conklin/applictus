-- Ensure boolean columns in job_applications are true booleans on Postgres.
-- Some older schemas used integer (0/1) which breaks inserts that bind booleans (e.g. "false").

-- Ensure columns exist (idempotent).
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS archived boolean;
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS user_override boolean;

-- Backfill nulls in a type-tolerant way. ('0' casts to both integer and boolean false.)
UPDATE job_applications SET archived = '0' WHERE archived IS NULL;
UPDATE job_applications SET user_override = '0' WHERE user_override IS NULL;

-- Convert integer/text legacy values to boolean. Works even if the column is already boolean.
ALTER TABLE job_applications
  ALTER COLUMN archived TYPE boolean
  USING (CASE WHEN archived::text IN ('1','t','true','TRUE','yes','y','on') THEN true ELSE false END);
ALTER TABLE job_applications
  ALTER COLUMN user_override TYPE boolean
  USING (CASE WHEN user_override::text IN ('1','t','true','TRUE','yes','y','on') THEN true ELSE false END);

ALTER TABLE job_applications ALTER COLUMN archived SET DEFAULT false;
ALTER TABLE job_applications ALTER COLUMN archived SET NOT NULL;
ALTER TABLE job_applications ALTER COLUMN user_override SET DEFAULT false;
ALTER TABLE job_applications ALTER COLUMN user_override SET NOT NULL;

