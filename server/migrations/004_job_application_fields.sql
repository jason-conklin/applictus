ALTER TABLE job_applications ADD COLUMN company_name TEXT;
ALTER TABLE job_applications ADD COLUMN job_title TEXT;
ALTER TABLE job_applications ADD COLUMN job_location TEXT;
ALTER TABLE job_applications ADD COLUMN source TEXT;
ALTER TABLE job_applications ADD COLUMN applied_at TEXT;
ALTER TABLE job_applications ADD COLUMN current_status TEXT;
ALTER TABLE job_applications ADD COLUMN status_confidence REAL;
ALTER TABLE job_applications ADD COLUMN last_activity_at TEXT;
ALTER TABLE job_applications ADD COLUMN user_override INTEGER NOT NULL DEFAULT 0;

UPDATE job_applications
SET company_name = company,
    job_title = role,
    current_status = status,
    last_activity_at = updated_at
WHERE company_name IS NULL;

CREATE INDEX IF NOT EXISTS idx_job_apps_last_activity ON job_applications(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_job_apps_identity ON job_applications(company_name, job_title, source);
