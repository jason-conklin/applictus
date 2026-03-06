-- Deterministic per-user parser correction hints (Postgres).
CREATE TABLE IF NOT EXISTS user_parse_hints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  provider_id text NOT NULL,
  from_domain text,
  subject_pattern text,
  job_id_token text,
  company_override text,
  role_override text,
  status_override text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  hit_count integer NOT NULL DEFAULT 0,
  last_hit_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_user_parse_hints_user_provider
  ON user_parse_hints(user_id, provider_id);

CREATE INDEX IF NOT EXISTS idx_user_parse_hints_user_domain
  ON user_parse_hints(user_id, from_domain);

CREATE INDEX IF NOT EXISTS idx_user_parse_hints_user_job_id
  ON user_parse_hints(user_id, job_id_token);
