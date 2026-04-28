-- ═══════════════════════════════════════════════════════
--  Greta – Database Schema
--  Run in Supabase → SQL Editor → New query
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS word_sets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic      TEXT NOT NULL CHECK (char_length(topic) <= 40),
  vocab      JSONB NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE word_sets ENABLE ROW LEVEL SECURITY;

-- Anyone can read (students load word sets via share link or list)
CREATE POLICY "Public read"
  ON word_sets FOR SELECT USING (true);

-- Only the Edge Function (service role) can write
CREATE POLICY "Service insert"
  ON word_sets FOR INSERT WITH CHECK (false);

CREATE POLICY "Service delete"
  ON word_sets FOR DELETE USING (false);
