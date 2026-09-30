-- Keep the destination address bound to the password+mail-code challenge.
-- This is different from accounts.email while Firebase's verification link is
-- outstanding, which lets a successful provider-side email change be
-- reconciled to the existing D1 identity instead of creating a new account.
ALTER TABLE login_challenges ADD COLUMN challenge_email TEXT NOT NULL DEFAULT '';
UPDATE login_challenges
SET challenge_email = (SELECT email FROM accounts WHERE accounts.id = login_challenges.account_id)
WHERE challenge_email = '';

-- A pending Firebase email-change link is scoped to the same existing
-- Firebase/D1 identity and credential version. The target is reserved until
-- the action is completed, or a later request replaces the expired intent.
CREATE TABLE IF NOT EXISTS pending_email_changes (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  old_email TEXT NOT NULL,
  new_email TEXT NOT NULL UNIQUE,
  firebase_uid TEXT NOT NULL,
  credential_version INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applying')),
  processing_until INTEGER,
  CHECK (old_email <> new_email)
);

CREATE INDEX IF NOT EXISTS pending_email_changes_expiry ON pending_email_changes(expires_at);
