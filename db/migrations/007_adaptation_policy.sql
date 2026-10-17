-- Per-learner adaptive policy controls and an explainable plan-decision audit trail.
CREATE TABLE IF NOT EXISTS learner_adaptation_settings (
  owner_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  policy_version TEXT NOT NULL DEFAULT 'evidence-v1',
  review_interval_scale REAL NOT NULL DEFAULT 1.0 CHECK (review_interval_scale BETWEEN 0.5 AND 2.0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (owner_id) REFERENCES learner_profiles(owner_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS learning_plan_decisions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  context_json TEXT NOT NULL,
  weights_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (plan_id, owner_id) REFERENCES learning_plans(id, owner_id) ON DELETE CASCADE,
  UNIQUE (plan_id, owner_id)
);
CREATE INDEX IF NOT EXISTS idx_learning_plan_decisions_owner_created
  ON learning_plan_decisions(owner_id, created_at DESC);
