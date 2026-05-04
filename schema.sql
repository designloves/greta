-- ═══════════════════════════════════════════════════════
--  Greta – Database Schema v2 (Supabase Auth)
--  Run in Supabase → SQL Editor → New query
--
--  Fresh install: run everything below.
--  Upgrading from v1: see the migration section at the bottom.
-- ═══════════════════════════════════════════════════════

-- ── Fresh install ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS word_sets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  topic      TEXT NOT NULL CHECK (char_length(topic) <= 40),
  vocab      JSONB NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE word_sets ENABLE ROW LEVEL SECURITY;

-- Users can read their own sets (for My Lists)
CREATE POLICY "Users read own sets"
  ON word_sets FOR SELECT USING (auth.uid() = user_id);

-- Authenticated users can insert their own sets
CREATE POLICY "Users insert own sets"
  ON word_sets FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can delete their own sets
CREATE POLICY "Users delete own sets"
  ON word_sets FOR DELETE USING (auth.uid() = user_id);


-- ── Upgrading from v1? Run these instead ─────────────────
-- (Skip the CREATE TABLE and policies above; run only this block)
--
-- ALTER TABLE word_sets ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
--
-- DROP POLICY IF EXISTS "Public read"    ON word_sets;
-- DROP POLICY IF EXISTS "Service insert" ON word_sets;
-- DROP POLICY IF EXISTS "Service delete" ON word_sets;
--
-- CREATE POLICY "Users read own sets"   ON word_sets FOR SELECT USING (auth.uid() = user_id);
-- CREATE POLICY "Users insert own sets" ON word_sets FOR INSERT WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "Users delete own sets" ON word_sets FOR DELETE USING (auth.uid() = user_id);
