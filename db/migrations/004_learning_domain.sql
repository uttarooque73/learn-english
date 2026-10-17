-- Additive, owner-scoped learning-domain tables.
-- Existing serialized data remains untouched during this foundation phase.
CREATE TABLE IF NOT EXISTS learner_profiles (
  owner_id TEXT PRIMARY KEY,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  daily_target_minutes INTEGER NOT NULL DEFAULT 20
    CHECK (daily_target_minutes BETWEEN 5 AND 240),
  proficiency_level TEXT NOT NULL DEFAULT 'intermediate'
    CHECK (proficiency_level IN ('beginner', 'intermediate', 'advanced')),
  goals_json TEXT NOT NULL DEFAULT '[]',
  preferences_json TEXT NOT NULL DEFAULT '{}',
  schedule_enabled INTEGER NOT NULL DEFAULT 0 CHECK (schedule_enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS learner_skill_scores (
  owner_id TEXT NOT NULL,
  skill_key TEXT NOT NULL,
  mastery REAL NOT NULL DEFAULT 0 CHECK (mastery BETWEEN 0 AND 1),
  confidence REAL NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  evidence_count INTEGER NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (owner_id, skill_key)
);
CREATE INDEX IF NOT EXISTS idx_learner_skill_scores_owner_updated
  ON learner_skill_scores(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS skill_assessments (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  skill_key TEXT NOT NULL,
  score REAL NOT NULL CHECK (score BETWEEN 0 AND 1),
  confidence REAL NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  rubric_version TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_skill_assessments_owner_skill_created
  ON skill_assessments(owner_id, skill_key, created_at DESC);

CREATE TABLE IF NOT EXISTS learning_plans (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  local_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'completed', 'cancelled')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  generation_source TEXT NOT NULL DEFAULT 'manual',
  total_minutes INTEGER NOT NULL DEFAULT 0 CHECK (total_minutes BETWEEN 0 AND 1440),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (owner_id, local_date, version),
  UNIQUE (id, owner_id)
);
CREATE INDEX IF NOT EXISTS idx_learning_plans_owner_date
  ON learning_plans(owner_id, local_date DESC, version DESC);

CREATE TABLE IF NOT EXISTS learning_plan_items (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  activity_type TEXT NOT NULL,
  activity_ref TEXT,
  skill_key TEXT,
  estimated_minutes INTEGER NOT NULL CHECK (estimated_minutes BETWEEN 1 AND 240),
  priority REAL NOT NULL DEFAULT 0,
  reason_codes_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (plan_id, owner_id) REFERENCES learning_plans(id, owner_id) ON DELETE CASCADE,
  UNIQUE (plan_id, position),
  UNIQUE (id, owner_id)
);
CREATE INDEX IF NOT EXISTS idx_learning_plan_items_owner_status
  ON learning_plan_items(owner_id, status, plan_id);

CREATE TABLE IF NOT EXISTS practice_attempts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  plan_item_id TEXT,
  activity_type TEXT NOT NULL,
  activity_ref TEXT,
  response_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL DEFAULT '{}',
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  idempotency_key TEXT,
  submitted_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (plan_item_id, owner_id) REFERENCES learning_plan_items(id, owner_id),
  UNIQUE (owner_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_practice_attempts_owner_created
  ON practice_attempts(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_practice_attempts_owner_activity
  ON practice_attempts(owner_id, activity_type, activity_ref);

CREATE TABLE IF NOT EXISTS learning_mistakes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  category TEXT NOT NULL,
  normalized_key TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  evidence_json TEXT NOT NULL DEFAULT '[]',
  first_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at TEXT,
  UNIQUE (owner_id, normalized_key, status)
);
CREATE INDEX IF NOT EXISTS idx_learning_mistakes_owner_status_seen
  ON learning_mistakes(owner_id, status, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS vocabulary_review_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  vocabulary_ref TEXT NOT NULL,
  recall_rating INTEGER NOT NULL CHECK (recall_rating BETWEEN 0 AND 5),
  interval_days INTEGER NOT NULL DEFAULT 0 CHECK (interval_days >= 0),
  next_due_at TEXT,
  policy_version TEXT NOT NULL DEFAULT 'v1',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_vocabulary_reviews_owner_due
  ON vocabulary_review_events(owner_id, next_due_at);
CREATE INDEX IF NOT EXISTS idx_vocabulary_reviews_owner_ref_created
  ON vocabulary_review_events(owner_id, vocabulary_ref, created_at DESC);
