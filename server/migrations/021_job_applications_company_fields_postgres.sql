-- Add company metadata columns to job_applications for Postgres.
-- Some older DBs were created before these fields existed; CREATE TABLE IF NOT EXISTS will not add them.

ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS company_confidence double precision;
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS company_source text;
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS company_explanation text;

