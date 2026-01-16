ALTER TABLE email_events ADD COLUMN rfc_message_id TEXT;
ALTER TABLE email_events ADD COLUMN external_req_id TEXT;
ALTER TABLE job_applications ADD COLUMN external_req_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_events_provider_message
  ON email_events(provider, provider_message_id);
CREATE INDEX IF NOT EXISTS idx_email_events_rfc_message_id
  ON email_events(rfc_message_id);
CREATE INDEX IF NOT EXISTS idx_email_events_external_req
  ON email_events(external_req_id);
CREATE INDEX IF NOT EXISTS idx_job_apps_external_req
  ON job_applications(company_name, external_req_id);
