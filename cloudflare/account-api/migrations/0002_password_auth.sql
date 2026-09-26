ALTER TABLE accounts ADD COLUMN firebase_uid TEXT;
ALTER TABLE accounts ADD COLUMN credential_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE accounts ADD COLUMN avatar_data BLOB;
ALTER TABLE accounts ADD COLUMN avatar_mime TEXT;
ALTER TABLE accounts ADD COLUMN avatar_updated_at INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_firebase_uid ON accounts(firebase_uid);

ALTER TABLE sessions ADD COLUMN credential_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS login_challenges (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  firebase_uid TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  credential_version INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS login_challenges_expiry ON login_challenges(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS login_challenges_account_id ON login_challenges(account_id);

CREATE TABLE IF NOT EXISTS password_enrollment_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS password_setup_proofs (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  processing_until INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS password_setup_proofs_expiry ON password_setup_proofs(expires_at);
