CREATE TABLE IF NOT EXISTS tutor_conversations (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'AI Tutor Session',
  goal TEXT NOT NULL,
  level TEXT NOT NULL,
  feedback_style TEXT NOT NULL,
  messages_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_tutor_conversations_owner_updated
  ON tutor_conversations(owner_id, updated_at DESC);
