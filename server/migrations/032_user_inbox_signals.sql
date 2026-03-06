-- Per-user inbound signal state for near-real-time auto-sync orchestration.

CREATE TABLE IF NOT EXISTS user_inbox_signals (
  user_id TEXT PRIMARY KEY,
  pending_count INTEGER NOT NULL DEFAULT 0,
  last_inbound_at TEXT,
  last_subject_preview TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_user_inbox_signals_updated_at
  ON user_inbox_signals(updated_at DESC);
