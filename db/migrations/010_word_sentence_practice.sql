CREATE TABLE IF NOT EXISTS word_sentence_practice_attempts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  exercise_kind TEXT NOT NULL CHECK (exercise_kind IN ('word','sentence')),
  topic TEXT NOT NULL,
  prompt TEXT NOT NULL,
  response_text TEXT NOT NULL,
  score REAL NOT NULL CHECK (score BETWEEN 0 AND 1),
  feedback_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(owner_id,attempt_id),
  FOREIGN KEY(attempt_id) REFERENCES practice_attempts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_word_sentence_attempts_owner_created ON word_sentence_practice_attempts(owner_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_word_sentence_attempts_owner_exercise ON word_sentence_practice_attempts(owner_id,exercise_id,created_at DESC);
