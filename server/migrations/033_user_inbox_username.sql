-- Optional per-user forwarding inbox username (SQLite).

ALTER TABLE users ADD COLUMN inbox_username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_inbox_username_unique
  ON users(inbox_username)
  WHERE inbox_username IS NOT NULL;
