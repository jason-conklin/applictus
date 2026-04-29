ALTER TABLE inbound_addresses ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

UPDATE inbound_addresses
   SET status = CASE
     WHEN is_active = 1 THEN 'active'
     WHEN rotated_at IS NOT NULL THEN 'rotated'
     ELSE 'disabled'
   END;

CREATE INDEX IF NOT EXISTS idx_inbound_addresses_status
  ON inbound_addresses(status);

CREATE INDEX IF NOT EXISTS idx_inbound_addresses_email_status
  ON inbound_addresses(address_email, status);

CREATE TABLE IF NOT EXISTS inbound_webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'postmark',
  recipient_email TEXT,
  inbound_address_id TEXT,
  user_id TEXT,
  address_status TEXT,
  reason TEXT NOT NULL,
  subject TEXT,
  received_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inbound_webhook_events_recipient
  ON inbound_webhook_events(recipient_email);

CREATE INDEX IF NOT EXISTS idx_inbound_webhook_events_reason
  ON inbound_webhook_events(reason);

CREATE INDEX IF NOT EXISTS idx_inbound_webhook_events_received
  ON inbound_webhook_events(received_at);

CREATE INDEX IF NOT EXISTS idx_inbound_webhook_events_user
  ON inbound_webhook_events(user_id);
