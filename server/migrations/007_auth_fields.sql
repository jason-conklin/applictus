ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'password';
ALTER TABLE users ADD COLUMN updated_at TEXT;

UPDATE users
SET auth_provider = 'password'
WHERE auth_provider IS NULL;

UPDATE users
SET updated_at = created_at
WHERE updated_at IS NULL;
