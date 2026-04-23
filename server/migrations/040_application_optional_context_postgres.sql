ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS personal_notes text;

ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS job_description text;
