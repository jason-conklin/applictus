-- Optional per-user forwarding inbox username (Postgres).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS inbox_username text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_inbox_username_unique
  ON users(inbox_username)
  WHERE inbox_username IS NOT NULL;
