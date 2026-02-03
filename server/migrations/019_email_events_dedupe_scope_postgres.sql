-- Scope email event dedupe to (user_id, provider, provider_message_id) instead of global provider_message_id.
-- This prevents one user's Gmail ids from blocking another user's ingestion.

DROP INDEX IF EXISTS idx_email_events_provider_message_id;

-- Backfill for older rows: treat message_id as provider_message_id when missing.
UPDATE email_events
SET provider_message_id = message_id
WHERE provider_message_id IS NULL
  AND message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_events_provider_message_id_scoped
  ON email_events(user_id, provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_events_rfc_message_id_scoped
  ON email_events(user_id, provider, rfc_message_id)
  WHERE rfc_message_id IS NOT NULL;

