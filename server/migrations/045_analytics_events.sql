CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  user_id TEXT,
  visitor_id TEXT,
  session_id TEXT,
  path TEXT,
  referrer TEXT,
  source TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  metadata_json TEXT,
  idempotency_key TEXT,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_events_idempotency
  ON analytics_events(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_analytics_events_name_time
  ON analytics_events(event_name, occurred_at);

CREATE INDEX IF NOT EXISTS idx_analytics_events_visitor_time
  ON analytics_events(visitor_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_time
  ON analytics_events(user_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_analytics_events_source_time
  ON analytics_events(source, occurred_at);
