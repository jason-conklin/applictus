ALTER TABLE job_applications ADD COLUMN status_explanation TEXT;
ALTER TABLE job_applications ADD COLUMN suggested_status TEXT;
ALTER TABLE job_applications ADD COLUMN suggested_confidence REAL;
ALTER TABLE job_applications ADD COLUMN suggested_explanation TEXT;
ALTER TABLE job_applications ADD COLUMN inference_updated_at TEXT;
