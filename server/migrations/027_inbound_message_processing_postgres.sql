-- Inbound forwarding message processing queue fields (Postgres).

ALTER TABLE inbound_messages
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS processing_error text,
  ADD COLUMN IF NOT EXISTS derived_event_id uuid,
  ADD COLUMN IF NOT EXISTS derived_application_id uuid,
  ADD COLUMN IF NOT EXISTS derived_status text,
  ADD COLUMN IF NOT EXISTS derived_company text,
  ADD COLUMN IF NOT EXISTS derived_role text;

UPDATE inbound_messages
SET processing_status = 'pending'
WHERE processing_status IS NULL OR btrim(processing_status) = '';

CREATE INDEX IF NOT EXISTS idx_inbound_messages_user_processing
  ON inbound_messages(user_id, processing_status, received_at ASC);
CREATE INDEX IF NOT EXISTS idx_inbound_messages_processed_at
  ON inbound_messages(user_id, processed_at DESC);
