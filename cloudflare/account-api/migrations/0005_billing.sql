-- Additive and mode-separated. Legacy subscriptions are NOT proof of payment.
CREATE TABLE billing_customers (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK(mode IN ('test','live')),
  customer_id TEXT NOT NULL UNIQUE,
  financial_hold INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(account_id, mode)
);
CREATE TABLE billing_subscriptions (
  subscription_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK(mode IN ('test','live')),
  price_id TEXT NOT NULL,
  status TEXT NOT NULL,
  paid_until INTEGER NOT NULL DEFAULT 0,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  fence TEXT NOT NULL
);
CREATE INDEX billing_qualification ON billing_subscriptions(account_id,mode,price_id,paid_until);
CREATE TABLE billing_reconciliation (
  subscription_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('test','live')),
  fence TEXT NOT NULL,
  PRIMARY KEY(subscription_id,mode)
);
CREATE TABLE billing_checkout (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK(mode IN ('test','live')),
  price_id TEXT NOT NULL,
  attempt TEXT NOT NULL,
  session_id TEXT,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(account_id,mode)
);
CREATE TABLE billing_events (
  mode TEXT NOT NULL CHECK(mode IN ('test','live')),
  event_id TEXT NOT NULL,
  processed_at INTEGER NOT NULL,
  PRIMARY KEY(mode,event_id)
);
