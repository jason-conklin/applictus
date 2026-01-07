CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS job_applications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  status_updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS email_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  application_id TEXT,
  provider TEXT NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  thread_id TEXT,
  from_email TEXT,
  subject_snippet TEXT,
  received_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (application_id) REFERENCES job_applications(id)
);

CREATE TABLE IF NOT EXISTS user_actions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  application_id TEXT,
  action_type TEXT NOT NULL,
  action_payload TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (application_id) REFERENCES job_applications(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_job_apps_user_id ON job_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_job_apps_status ON job_applications(status);
CREATE INDEX IF NOT EXISTS idx_job_apps_updated ON job_applications(updated_at);
CREATE INDEX IF NOT EXISTS idx_email_events_user_id ON email_events(user_id);
CREATE INDEX IF NOT EXISTS idx_email_events_thread_id ON email_events(thread_id);
CREATE INDEX IF NOT EXISTS idx_email_events_app_id ON email_events(application_id);
CREATE INDEX IF NOT EXISTS idx_user_actions_user_id ON user_actions(user_id);
