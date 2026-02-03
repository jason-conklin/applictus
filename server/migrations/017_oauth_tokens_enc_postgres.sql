ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS access_token_enc text;
ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS refresh_token_enc text;
ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS connected_email text;
ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE oauth_tokens ALTER COLUMN access_token DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_tokens_provider_user_id ON oauth_tokens(provider, user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user_id ON oauth_tokens(user_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='oauth_tokens'
      AND column_name='expiry_date'
      AND data_type='timestamp with time zone'
  ) THEN
    ALTER TABLE oauth_tokens
      ALTER COLUMN expiry_date TYPE bigint
      USING (extract(epoch FROM expiry_date) * 1000)::bigint;
  END IF;
END $$;
