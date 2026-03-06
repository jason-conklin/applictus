-- Forwarding onboarding status cache fields (Postgres).

ALTER TABLE inbound_addresses
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_received_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_inbound_addresses_confirmed_at ON inbound_addresses(confirmed_at);
CREATE INDEX IF NOT EXISTS idx_inbound_addresses_last_received_at ON inbound_addresses(last_received_at);
