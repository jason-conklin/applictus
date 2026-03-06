-- Deterministic per-user parser correction hints (SQLite).
CREATE TABLE IF NOT EXISTS user_parse_hints (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  from_domain TEXT,
  subject_pattern TEXT,
  job_id_token TEXT,
  company_override TEXT,
  role_override TEXT,
  status_override TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_hit_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_user_parse_hints_user_provider
  ON user_parse_hints(user_id, provider_id);

CREATE INDEX IF NOT EXISTS idx_user_parse_hints_user_domain
  ON user_parse_hints(user_id, from_domain);

CREATE INDEX IF NOT EXISTS idx_user_parse_hints_user_job_id
  ON user_parse_hints(user_id, job_id_token);
