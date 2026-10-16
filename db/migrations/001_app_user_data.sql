-- SQLite migration for durable, browser-owner-scoped application data.
CREATE TABLE IF NOT EXISTS app_user_data (
  owner_id TEXT NOT NULL,
  data_key TEXT NOT NULL,
  data_value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (owner_id, data_key)
);

CREATE INDEX IF NOT EXISTS idx_app_user_data_owner
  ON app_user_data(owner_id);
