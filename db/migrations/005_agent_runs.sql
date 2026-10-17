-- Durable status and audit metadata for LangGraph workflow executions.
-- Checkpoint payloads are stored by the LangGraph SQLite saver in its own tables.
CREATE TABLE IF NOT EXISTS agent_runs (
  run_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  workflow_name TEXT NOT NULL,
  graph_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  input_hash TEXT NOT NULL,
  model_name TEXT,
  started_at TEXT,
  finished_at TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_owner_created
  ON agent_runs(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_owner_status
  ON agent_runs(owner_id, status, created_at DESC);
