ALTER TABLE inbound_addresses
  ADD COLUMN IF NOT EXISTS setup_test_token_hash text,
  ADD COLUMN IF NOT EXISTS setup_test_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS setup_test_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS forwarding_active_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_gmail_confirmation_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_inbound_addresses_setup_test_token
  ON inbound_addresses(setup_test_token_hash);

CREATE INDEX IF NOT EXISTS idx_inbound_addresses_forwarding_active_at
  ON inbound_addresses(forwarding_active_at);

CREATE INDEX IF NOT EXISTS idx_inbound_addresses_gmail_confirmation_at
  ON inbound_addresses(last_gmail_confirmation_at);
