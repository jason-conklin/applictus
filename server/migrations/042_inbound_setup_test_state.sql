ALTER TABLE inbound_addresses ADD COLUMN setup_test_token_hash TEXT;
ALTER TABLE inbound_addresses ADD COLUMN setup_test_sent_at TEXT;
ALTER TABLE inbound_addresses ADD COLUMN setup_test_received_at TEXT;
ALTER TABLE inbound_addresses ADD COLUMN forwarding_active_at TEXT;
ALTER TABLE inbound_addresses ADD COLUMN last_gmail_confirmation_at TEXT;

CREATE INDEX IF NOT EXISTS idx_inbound_addresses_setup_test_token
  ON inbound_addresses(setup_test_token_hash);

CREATE INDEX IF NOT EXISTS idx_inbound_addresses_forwarding_active_at
  ON inbound_addresses(forwarding_active_at);

CREATE INDEX IF NOT EXISTS idx_inbound_addresses_gmail_confirmation_at
  ON inbound_addresses(last_gmail_confirmation_at);
