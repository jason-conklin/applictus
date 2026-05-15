ALTER TABLE inbound_addresses
  ADD COLUMN IF NOT EXISTS gmail_verification_url text,
  ADD COLUMN IF NOT EXISTS gmail_verification_code text;

