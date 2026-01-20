CREATE TABLE IF NOT EXISTS llm_email_enrichment (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider_message_id TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  llm_event_type TEXT,
  llm_confidence REAL,
  llm_company_name TEXT,
  llm_job_title TEXT,
  llm_external_req_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, provider_message_id, prompt_version)
);
