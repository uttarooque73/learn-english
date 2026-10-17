-- Additive storage for AI and Us Discussion and Paragraph Practice.
CREATE TABLE IF NOT EXISTS aius_paragraphs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 12000),
  proficiency_level TEXT NOT NULL CHECK (proficiency_level IN ('Beginner','Intermediate','Advanced')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aius_paragraphs_owner_updated
  ON aius_paragraphs(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS aius_reading_attempts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  paragraph_id TEXT,
  target TEXT NOT NULL,
  transcript TEXT NOT NULL,
  score INTEGER CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  missing_words_json TEXT NOT NULL DEFAULT '[]',
  extra_words_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  FOREIGN KEY (paragraph_id) REFERENCES aius_paragraphs(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_aius_attempts_owner_created
  ON aius_reading_attempts(owner_id, created_at DESC);
