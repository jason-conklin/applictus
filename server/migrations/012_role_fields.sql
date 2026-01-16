ALTER TABLE job_applications ADD COLUMN role_confidence REAL;
ALTER TABLE job_applications ADD COLUMN role_source TEXT;
ALTER TABLE job_applications ADD COLUMN role_explanation TEXT;

ALTER TABLE email_events ADD COLUMN role_title TEXT;
ALTER TABLE email_events ADD COLUMN role_confidence REAL;
ALTER TABLE email_events ADD COLUMN role_source TEXT;
ALTER TABLE email_events ADD COLUMN role_explanation TEXT;
