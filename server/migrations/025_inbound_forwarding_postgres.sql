-- Forwarding-based inbound ingestion foundations (Postgres).

CREATE TABLE IF NOT EXISTS inbound_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  address_local text NOT NULL UNIQUE,
  address_email text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_inbound_addresses_user_id ON inbound_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_inbound_addresses_active ON inbound_addresses(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbound_addresses_active_user
  ON inbound_addresses(user_id)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS inbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  inbound_address_id uuid NOT NULL REFERENCES inbound_addresses(id),
  provider text NOT NULL DEFAULT 'postmark',
  provider_message_id text,
  message_id_header text,
  subject text,
  from_email text,
  to_email text,
  received_at timestamptz NOT NULL DEFAULT now(),
  body_text text,
  body_html text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  sha256 text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbound_messages_user_received_at
  ON inbound_messages(user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_messages_provider_message_id
  ON inbound_messages(user_id, provider, provider_message_id);
CREATE INDEX IF NOT EXISTS idx_inbound_messages_message_id_header
  ON inbound_messages(user_id, provider, message_id_header);
