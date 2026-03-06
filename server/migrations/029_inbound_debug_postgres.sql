-- Persist lightweight derivation reasoning for forwarding diagnostics.
ALTER TABLE inbound_messages
  ADD COLUMN IF NOT EXISTS derived_debug_json jsonb;

CREATE INDEX IF NOT EXISTS idx_inbound_messages_user_processing_state
  ON inbound_messages(user_id, processing_status, received_at DESC);
