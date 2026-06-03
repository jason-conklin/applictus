CREATE TABLE IF NOT EXISTS analytics_events (
  id text PRIMARY KEY,
  event_name text NOT NULL,
  user_id text,
  visitor_id text,
  session_id text,
  path text,
  referrer text,
  source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  metadata_json text,
  idempotency_key text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL
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
