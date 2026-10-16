-- Stores app-owned browser data in PostgreSQL, partitioned by an anonymous browser owner ID.
-- The API also creates this table lazily so a fresh deployment can start without a manual migration step.
CREATE TABLE IF NOT EXISTS app_user_data (
  owner_id UUID NOT NULL,
  data_key TEXT NOT NULL,
  data_value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, data_key)
);

CREATE INDEX IF NOT EXISTS app_user_data_updated_at_idx
  ON app_user_data (owner_id, updated_at DESC);
