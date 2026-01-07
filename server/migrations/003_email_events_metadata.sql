ALTER TABLE email_events ADD COLUMN provider_message_id TEXT;
ALTER TABLE email_events ADD COLUMN sender TEXT;
ALTER TABLE email_events ADD COLUMN subject TEXT;
ALTER TABLE email_events ADD COLUMN internal_date INTEGER;
ALTER TABLE email_events ADD COLUMN snippet TEXT;
ALTER TABLE email_events ADD COLUMN detected_type TEXT;
ALTER TABLE email_events ADD COLUMN confidence_score REAL;
ALTER TABLE email_events ADD COLUMN explanation TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_events_provider_id ON email_events(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_email_events_internal_date ON email_events(internal_date);
