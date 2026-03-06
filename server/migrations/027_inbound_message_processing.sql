-- Inbound forwarding message processing queue fields (SQLite).

ALTER TABLE inbound_messages ADD COLUMN processed_at TEXT;
ALTER TABLE inbound_messages ADD COLUMN processing_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE inbound_messages ADD COLUMN processing_error TEXT;
ALTER TABLE inbound_messages ADD COLUMN derived_event_id TEXT;
ALTER TABLE inbound_messages ADD COLUMN derived_application_id TEXT;
ALTER TABLE inbound_messages ADD COLUMN derived_status TEXT;
ALTER TABLE inbound_messages ADD COLUMN derived_company TEXT;
ALTER TABLE inbound_messages ADD COLUMN derived_role TEXT;

UPDATE inbound_messages
SET processing_status = 'pending'
WHERE processing_status IS NULL OR TRIM(processing_status) = '';

CREATE INDEX IF NOT EXISTS idx_inbound_messages_user_processing
  ON inbound_messages(user_id, processing_status, received_at ASC);
CREATE INDEX IF NOT EXISTS idx_inbound_messages_processed_at
  ON inbound_messages(user_id, processed_at DESC);
