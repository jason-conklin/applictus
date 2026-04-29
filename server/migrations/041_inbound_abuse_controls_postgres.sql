ALTER TABLE inbound_addresses
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

UPDATE inbound_addresses
   SET status = CASE
     WHEN is_active IS TRUE THEN 'active'
     WHEN rotated_at IS NOT NULL THEN 'rotated'
     ELSE 'disabled'
   END
 WHERE status IS NULL OR status = 'active';

CREATE INDEX IF NOT EXISTS idx_inbound_addresses_status
  ON inbound_addresses(status);

CREATE INDEX IF NOT EXISTS idx_inbound_addresses_email_status
  ON inbound_addresses(address_email, status);

CREATE TABLE IF NOT EXISTS inbound_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'postmark',
  recipient_email text,
  inbound_address_id uuid REFERENCES inbound_addresses(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  address_status text,
  reason text NOT NULL,
  subject text,
  received_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL
);

ALTER TABLE inbound_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_inbound_webhook_events_recipient
  ON inbound_webhook_events(recipient_email);

CREATE INDEX IF NOT EXISTS idx_inbound_webhook_events_reason
  ON inbound_webhook_events(reason);

CREATE INDEX IF NOT EXISTS idx_inbound_webhook_events_received
  ON inbound_webhook_events(received_at);

CREATE INDEX IF NOT EXISTS idx_inbound_webhook_events_user
  ON inbound_webhook_events(user_id);
