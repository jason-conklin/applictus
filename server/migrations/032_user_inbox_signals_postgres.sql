-- Per-user inbound signal state for near-real-time auto-sync orchestration.

CREATE TABLE IF NOT EXISTS user_inbox_signals (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  pending_count integer NOT NULL DEFAULT 0,
  last_inbound_at timestamptz,
  last_subject_preview text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_inbox_signals_updated_at
  ON user_inbox_signals(updated_at DESC);
