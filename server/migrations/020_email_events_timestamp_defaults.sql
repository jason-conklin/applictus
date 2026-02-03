-- Add updated_at for email_events to align with Postgres and support consistent writes.
-- Keep it nullable to avoid breaking existing inserts/tests that don't set updated_at.

ALTER TABLE email_events ADD COLUMN updated_at TEXT;

-- Backfill older rows (best-effort).
UPDATE email_events
SET updated_at = created_at
WHERE updated_at IS NULL
  AND created_at IS NOT NULL;

