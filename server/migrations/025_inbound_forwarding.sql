-- Forwarding-based inbound ingestion foundations (SQLite).

CREATE TABLE IF NOT EXISTS inbound_addresses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  address_local TEXT NOT NULL UNIQUE,
  address_email TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  rotated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_inbound_addresses_user_id ON inbound_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_inbound_addresses_active ON inbound_addresses(is_active);

CREATE TABLE IF NOT EXISTS inbound_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  inbound_address_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'postmark',
  provider_message_id TEXT,
  message_id_header TEXT,
  subject TEXT,
  from_email TEXT,
  to_email TEXT,
  received_at TEXT NOT NULL,
  body_text TEXT,
  body_html TEXT,
  raw_payload TEXT,
  sha256 TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (inbound_address_id) REFERENCES inbound_addresses(id)
);

CREATE INDEX IF NOT EXISTS idx_inbound_messages_user_received_at
  ON inbound_messages(user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_messages_provider_message_id
  ON inbound_messages(user_id, provider, provider_message_id);
CREATE INDEX IF NOT EXISTS idx_inbound_messages_message_id_header
  ON inbound_messages(user_id, provider, message_id_header);
