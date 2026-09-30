CREATE TABLE IF NOT EXISTS browser_auth_requests (
  request_id TEXT PRIMARY KEY,
  user_code TEXT NOT NULL,
  user_code_hash TEXT NOT NULL,
  code_challenge_hash TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('login', 'register')),
  locale TEXT NOT NULL CHECK (locale IN ('ja', 'en')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved')),
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  credential_version INTEGER,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  approved_at INTEGER,
  last_polled_at INTEGER,
  CHECK (
    (status = 'pending' AND account_id IS NULL AND credential_version IS NULL AND approved_at IS NULL)
    OR (status = 'approved' AND account_id IS NOT NULL AND credential_version IS NOT NULL AND approved_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS browser_auth_requests_expiry ON browser_auth_requests(expires_at);
CREATE INDEX IF NOT EXISTS browser_auth_requests_account ON browser_auth_requests(account_id, credential_version);
