ALTER TABLE email_events ADD COLUMN llm_ran INTEGER DEFAULT 0;
ALTER TABLE email_events ADD COLUMN llm_status TEXT;
ALTER TABLE email_events ADD COLUMN llm_error TEXT;
ALTER TABLE email_events ADD COLUMN llm_model TEXT;
ALTER TABLE email_events ADD COLUMN llm_latency_ms INTEGER;
ALTER TABLE email_events ADD COLUMN llm_event_type TEXT;
ALTER TABLE email_events ADD COLUMN llm_confidence REAL;
ALTER TABLE email_events ADD COLUMN llm_company_name TEXT;
ALTER TABLE email_events ADD COLUMN llm_job_title TEXT;
ALTER TABLE email_events ADD COLUMN llm_external_req_id TEXT;
ALTER TABLE email_events ADD COLUMN llm_provider_guess TEXT;
ALTER TABLE email_events ADD COLUMN llm_reason_codes TEXT;
ALTER TABLE email_events ADD COLUMN llm_raw_json TEXT;

CREATE INDEX IF NOT EXISTS idx_email_events_llm_status ON email_events(llm_status);
CREATE INDEX IF NOT EXISTS idx_email_events_llm_event_type ON email_events(llm_event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_llm_external_req_id ON email_events(llm_external_req_id);
