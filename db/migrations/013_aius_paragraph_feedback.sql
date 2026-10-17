-- Cache the latest validated writing feedback alongside the learner-owned paragraph.
ALTER TABLE aius_paragraphs
  ADD COLUMN writing_feedback_json TEXT NOT NULL DEFAULT '{}';
