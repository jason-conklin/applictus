DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION
  WHEN insufficient_privilege THEN
    -- ignore if extension cannot be created
    NULL;
END$$;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz,
  password_hash text,
  auth_provider text NOT NULL DEFAULT 'password'
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  csrf_token text
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  company text NOT NULL,
  role text NOT NULL,
  status text NOT NULL,
  status_updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  archived boolean NOT NULL DEFAULT false,
  company_name text,
  job_title text,
  job_location text,
  source text,
  applied_at timestamptz,
  current_status text,
  status_confidence double precision,
  last_activity_at timestamptz,
  user_override boolean NOT NULL DEFAULT false,
  status_explanation text,
  status_source text,
  suggested_status text,
  suggested_confidence double precision,
  suggested_explanation text,
  inference_updated_at timestamptz,
  external_req_id text,
  company_confidence double precision,
  company_source text,
  company_explanation text,
  role_confidence double precision,
  role_source text,
  role_explanation text
);
CREATE INDEX IF NOT EXISTS idx_job_apps_user_id ON job_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_job_apps_status ON job_applications(status);
CREATE INDEX IF NOT EXISTS idx_job_apps_updated ON job_applications(updated_at);
CREATE INDEX IF NOT EXISTS idx_job_apps_last_activity ON job_applications(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_job_apps_identity ON job_applications(company_name, job_title, source);
CREATE INDEX IF NOT EXISTS idx_job_apps_external_req ON job_applications(company_name, external_req_id);

CREATE TABLE IF NOT EXISTS email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  application_id uuid REFERENCES job_applications(id),
  provider text NOT NULL,
  message_id text NOT NULL UNIQUE,
  thread_id text,
  sender text,
  subject text,
  snippet text,
  body text,
  detected_type text NOT NULL,
  confidence_score double precision,
  classification_confidence double precision,
  role_title text,
  company_name text,
  source text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  internal_date timestamptz,
  rfc_message_id text,
  external_req_id text,
  metadata_json text,
  provider_payload_json text,
  identity_json text,
  decision text,
  decision_reason text,
  decision_at timestamptz,
  linked_application_id uuid,
  role_source text,
  role_confidence double precision,
  role_explanation text,
  company_confidence double precision,
  company_explanation text,
  skip_sample integer DEFAULT 0,
  user_feedback text,
  llm_ran integer DEFAULT 0,
  llm_status text,
  llm_error text,
  llm_model text,
  llm_latency_ms integer,
  llm_event_type text,
  llm_confidence double precision,
  llm_company_name text,
  llm_job_title text,
  llm_external_req_id text,
  llm_provider_guess text,
  llm_reason_codes text,
  llm_raw_json text
);

CREATE INDEX IF NOT EXISTS idx_email_events_user_id ON email_events(user_id);
CREATE INDEX IF NOT EXISTS idx_email_events_application_id ON email_events(application_id);
CREATE INDEX IF NOT EXISTS idx_email_events_company ON email_events(company_name);
CREATE INDEX IF NOT EXISTS idx_email_events_role ON email_events(role_title);
CREATE INDEX IF NOT EXISTS idx_email_events_linked_application_id ON email_events(linked_application_id);
CREATE INDEX IF NOT EXISTS idx_email_events_internal_date ON email_events(internal_date);
CREATE INDEX IF NOT EXISTS idx_email_events_external_req_id ON email_events(external_req_id);
CREATE INDEX IF NOT EXISTS idx_email_events_identity ON email_events(identity_json);
CREATE INDEX IF NOT EXISTS idx_email_events_decision ON email_events(decision);
CREATE INDEX IF NOT EXISTS idx_email_events_llm_status ON email_events(llm_status);
CREATE INDEX IF NOT EXISTS idx_email_events_llm_event_type ON email_events(llm_event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_llm_external_req_id ON email_events(llm_external_req_id);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  provider text NOT NULL,
  access_token text,
  refresh_token text,
  access_token_enc text,
  refresh_token_enc text,
  scope text,
  token_type text,
  expiry_date timestamptz,
  connected_email text,
  created_at timestamptz,
  updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS email_skip_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  email_event_id uuid NOT NULL REFERENCES email_events(id),
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('upload','paste')),
  original_filename text,
  mime_type text,
  file_size integer,
  extraction_method text,
  extraction_warnings text,
  resume_text text NOT NULL,
  resume_json text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_resumes_user_default ON resumes(user_id, is_default);

CREATE TABLE IF NOT EXISTS resume_tailor_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  company_name text,
  job_title text,
  job_location text,
  job_url text,
  jd_source text NOT NULL CHECK (jd_source IN ('paste','url')),
  job_description_text text NOT NULL,
  resume_id uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  options_json text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','generated','exported')),
  linked_application_id uuid,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rts_user_id ON resume_tailor_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_rts_resume_id ON resume_tailor_sessions(resume_id);
CREATE INDEX IF NOT EXISTS idx_rts_company_job ON resume_tailor_sessions(user_id, company_name, job_title);
CREATE INDEX IF NOT EXISTS idx_rts_updated ON resume_tailor_sessions(user_id, updated_at);

CREATE TABLE IF NOT EXISTS resume_tailor_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES resume_tailor_sessions(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  generated_resume_text text NOT NULL,
  generated_resume_json text,
  change_log_json text NOT NULL,
  ats_score integer,
  ats_keywords_json text,
  model_info_json text,
  user_edited_resume_text text,
  exported_at timestamptz,
  created_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rtv_session_version ON resume_tailor_versions(session_id, version_number);
CREATE INDEX IF NOT EXISTS idx_rtv_session_id ON resume_tailor_versions(session_id);

CREATE TABLE IF NOT EXISTS resume_curator_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  base_resume_id uuid NOT NULL REFERENCES resumes(id),
  company text,
  role_title text,
  job_url text,
  job_description text NOT NULL,
  target_keywords text,
  tone text,
  focus text,
  length text,
  include_cover_letter boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rcr_user ON resume_curator_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_rcr_resume ON resume_curator_runs(base_resume_id);

CREATE TABLE IF NOT EXISTS resume_curator_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES resume_curator_runs(id) ON DELETE CASCADE,
  kind text,
  section text,
  change_text text NOT NULL,
  reason_text text,
  evidence_text text,
  impact text,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','applied','dismissed')),
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rcs_run ON resume_curator_suggestions(run_id);
CREATE INDEX IF NOT EXISTS idx_rcs_status ON resume_curator_suggestions(run_id, status);

CREATE TABLE IF NOT EXISTS resume_curator_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES resume_curator_runs(id) ON DELETE CASCADE,
  version_label text NOT NULL,
  ats_score integer,
  tailored_text text NOT NULL,
  exported_at timestamptz,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rcv_run ON resume_curator_versions(run_id);
