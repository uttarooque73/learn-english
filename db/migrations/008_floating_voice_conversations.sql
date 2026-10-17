CREATE TABLE IF NOT EXISTS voice_conversation_sessions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  proficiency TEXT NOT NULL CHECK (proficiency IN ('Beginner', 'Intermediate', 'Advanced')),
  status TEXT NOT NULL CHECK (status IN ('active', 'finalizing', 'completed', 'failed')),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  feedback_status TEXT NOT NULL DEFAULT 'pending' CHECK (feedback_status IN ('pending', 'processing', 'partial', 'complete', 'failed')),
  overall_feedback_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_owner_started
  ON voice_conversation_sessions(owner_id, started_at DESC);

CREATE TABLE IF NOT EXISTS voice_conversation_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES voice_conversation_sessions(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL CHECK (length(content) <= 4000),
  created_at TEXT NOT NULL,
  UNIQUE(session_id, sequence_number),
  UNIQUE(session_id, id)
);

CREATE INDEX IF NOT EXISTS idx_voice_messages_session_order
  ON voice_conversation_messages(owner_id, session_id, sequence_number);

CREATE TABLE IF NOT EXISTS voice_conversation_feedback (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES voice_conversation_sessions(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES voice_conversation_messages(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  original_sentence TEXT NOT NULL,
  corrected_sentence TEXT NOT NULL,
  natural_sentence TEXT,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  error_categories_json TEXT NOT NULL DEFAULT '[]',
  severity TEXT NOT NULL CHECK (severity IN ('none', 'minor', 'major')),
  explanation TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(session_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_voice_feedback_owner_session
  ON voice_conversation_feedback(owner_id, session_id, sequence_number);
