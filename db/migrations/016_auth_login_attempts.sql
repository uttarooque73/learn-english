CREATE TABLE IF NOT EXISTS auth_login_attempts (
  email_hash TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_locked_until
  ON auth_login_attempts(locked_until);
