-- Postgres-only: ensure email_events has provider metadata columns expected by sync/dedupe logic.

ALTER TABLE email_events ADD COLUMN IF NOT EXISTS provider_message_id text;

-- Metadata fields referenced by ingest + UI endpoints (keep nullable for backwards compatibility).
ALTER TABLE email_events ADD COLUMN IF NOT EXISTS explanation text;
ALTER TABLE email_events ADD COLUMN IF NOT EXISTS ingest_decision text;
ALTER TABLE email_events ADD COLUMN IF NOT EXISTS reason_code text;
ALTER TABLE email_events ADD COLUMN IF NOT EXISTS reason_detail text;

ALTER TABLE email_events ADD COLUMN IF NOT EXISTS identity_confidence double precision;
ALTER TABLE email_events ADD COLUMN IF NOT EXISTS identity_company_name text;
ALTER TABLE email_events ADD COLUMN IF NOT EXISTS identity_job_title text;
ALTER TABLE email_events ADD COLUMN IF NOT EXISTS identity_company_confidence double precision;
ALTER TABLE email_events ADD COLUMN IF NOT EXISTS identity_explanation text;

-- Dedupe + lookup indexes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_events_provider_message_id
  ON email_events(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_events_internal_date
  ON email_events(internal_date);

