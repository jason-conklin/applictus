-- Deterministic application key for cross-provider dedupe.
ALTER TABLE job_applications ADD COLUMN application_key TEXT;

ALTER TABLE inbound_messages ADD COLUMN derived_application_key TEXT;

CREATE INDEX IF NOT EXISTS idx_job_apps_application_key
  ON job_applications(user_id, application_key);

CREATE INDEX IF NOT EXISTS idx_inbound_messages_user_app_key
  ON inbound_messages(user_id, derived_application_key);
