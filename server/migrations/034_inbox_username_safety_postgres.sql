-- Inbox username safety hardening (Postgres).

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_inbox_username_unique_ci
  ON users(lower(inbox_username))
  WHERE inbox_username IS NOT NULL;

DROP INDEX IF EXISTS idx_inbound_addresses_active_user;

