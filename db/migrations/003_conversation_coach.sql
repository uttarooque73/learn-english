-- Durable browser-owner-scoped AI conversation coach sessions and turns.
CREATE TABLE IF NOT EXISTS conversation_coach_sessions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Conversation practice',
  scenario TEXT NOT NULL DEFAULT 'Free conversation',
  difficulty TEXT NOT NULL DEFAULT 'Intermediate',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  summary_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_coach_sessions_owner_updated
  ON conversation_coach_sessions(owner_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS conversation_coach_turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  correction_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES conversation_coach_sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_coach_turns_owner_session
  ON conversation_coach_turns(owner_id, session_id, created_at ASC);
