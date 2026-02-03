ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS access_token_enc text;
ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS refresh_token_enc text;
ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS connected_email text;
ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS updated_at timestamptz;
