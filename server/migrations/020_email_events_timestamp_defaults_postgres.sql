-- Ensure email_events timestamps are always populated in Postgres.
-- This prevents sync inserts from failing when created_at/updated_at are omitted.

-- Backfill (defensive; should normally be unnecessary if NOT NULL already enforced).
UPDATE email_events SET created_at = now() WHERE created_at IS NULL;
UPDATE email_events SET updated_at = now() WHERE updated_at IS NULL;

ALTER TABLE email_events
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE email_events
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

