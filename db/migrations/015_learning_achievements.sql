CREATE TABLE IF NOT EXISTS learner_achievements (
  owner_id TEXT NOT NULL,
  achievement_key TEXT NOT NULL,
  earned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  evidence_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (owner_id, achievement_key)
);
CREATE INDEX IF NOT EXISTS idx_learner_achievements_owner_earned
  ON learner_achievements(owner_id, earned_at DESC);
