-- Create user_actions table for Postgres.
-- SQLite has this table in 001_init.sql; older Postgres schemas may be missing it.

CREATE TABLE IF NOT EXISTS user_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  application_id uuid REFERENCES job_applications(id),
  action_type text NOT NULL,
  action_payload text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_actions_user_id ON user_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_actions_application_id ON user_actions(application_id);
CREATE INDEX IF NOT EXISTS idx_user_actions_app_user_id ON user_actions(application_id, user_id);

