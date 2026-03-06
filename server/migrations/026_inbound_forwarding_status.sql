-- Forwarding onboarding status cache fields (SQLite).

ALTER TABLE inbound_addresses ADD COLUMN confirmed_at TEXT;
ALTER TABLE inbound_addresses ADD COLUMN last_received_at TEXT;

CREATE INDEX IF NOT EXISTS idx_inbound_addresses_confirmed_at ON inbound_addresses(confirmed_at);
CREATE INDEX IF NOT EXISTS idx_inbound_addresses_last_received_at ON inbound_addresses(last_received_at);
