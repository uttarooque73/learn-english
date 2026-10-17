-- Durable background queue with leases, bounded retries, and per-attempt audit history.
CREATE TABLE IF NOT EXISTS learning_jobs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  available_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  lease_expires_at TEXT,
  claimed_by TEXT,
  idempotency_key TEXT NOT NULL,
  last_error_code TEXT,
  result_json TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (owner_id, job_type, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_learning_jobs_queue
  ON learning_jobs(status, available_at, priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_learning_jobs_owner_status
  ON learning_jobs(owner_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_jobs_expired_lease
  ON learning_jobs(status, lease_expires_at);

CREATE TABLE IF NOT EXISTS learning_job_attempts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  worker_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'retrying', 'failed')),
  error_code TEXT,
  result_json TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (job_id) REFERENCES learning_jobs(id) ON DELETE CASCADE,
  UNIQUE (job_id, attempt_number)
);
CREATE INDEX IF NOT EXISTS idx_learning_job_attempts_job
  ON learning_job_attempts(job_id, attempt_number DESC);

-- A scheduled plan is idempotent per learner-local date even if a worker crashes after saving it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_plans_one_scheduled_per_day
  ON learning_plans(owner_id, local_date)
  WHERE generation_source = 'scheduled' AND status IN ('published', 'completed');
