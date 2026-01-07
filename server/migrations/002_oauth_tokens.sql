CREATE TABLE IF NOT EXISTS oauth_tokens (
  provider TEXT NOT NULL,
  user_id TEXT NOT NULL,
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  scope TEXT,
  expiry_date INTEGER,
  connected_email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user_id ON oauth_tokens(user_id);
