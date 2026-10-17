CREATE TABLE IF NOT EXISTS voice_conversation_preferences (
  owner_id TEXT PRIMARY KEY,
  sentence_feedback_enabled INTEGER NOT NULL DEFAULT 1 CHECK (sentence_feedback_enabled IN (0, 1)),
  repeat_after_feedback_enabled INTEGER NOT NULL DEFAULT 1 CHECK (repeat_after_feedback_enabled IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
