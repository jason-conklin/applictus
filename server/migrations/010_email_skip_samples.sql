CREATE TABLE IF NOT EXISTS email_skip_samples (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_message_id TEXT,
  sender TEXT,
  subject TEXT,
  reason_code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_email_skip_samples_user_id ON email_skip_samples(user_id);
CREATE INDEX IF NOT EXISTS idx_email_skip_samples_reason ON email_skip_samples(reason_code);
