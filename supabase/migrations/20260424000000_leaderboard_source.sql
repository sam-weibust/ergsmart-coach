-- ── Leaderboard: verified score sources ────────────────────────────────────

-- Expand test_type CHECK constraint on erg_scores
ALTER TABLE public.erg_scores DROP CONSTRAINT IF EXISTS erg_scores_test_type_check;
ALTER TABLE public.erg_scores ADD CONSTRAINT erg_scores_test_type_check
  CHECK (test_type IN ('2k', '5k', '6k', '10k', '60min', 'custom'));

-- Add source, is_verified, to_leaderboard columns
ALTER TABLE public.erg_scores
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual'
    CHECK (source IN ('live_erg', 'concept2_sync', 'manual')),
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS to_leaderboard boolean NOT NULL DEFAULT false;

-- All existing scores are manual entries
UPDATE public.erg_scores
  SET source = 'manual', is_verified = false, to_leaderboard = false
  WHERE source IS NULL;

-- Add leaderboard opt-in, gender, country to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS leaderboard_opt_in boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('male', 'female', 'other')),
  ADD COLUMN IF NOT EXISTS country text;

-- Leaderboard flags table
CREATE TABLE IF NOT EXISTS public.leaderboard_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  score_id uuid NOT NULL REFERENCES public.erg_scores(id) ON DELETE CASCADE,
  flagged_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text,
  resolved boolean NOT NULL DEFAULT false,
  auto_flagged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.leaderboard_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can insert flags" ON public.leaderboard_flags;
CREATE POLICY "Users can insert flags" ON public.leaderboard_flags
  FOR INSERT WITH CHECK (auth.uid() = flagged_by);
DROP POLICY IF EXISTS "Users can view flags" ON public.leaderboard_flags;
CREATE POLICY "Users can view flags" ON public.leaderboard_flags
  FOR SELECT USING (true);

-- Index for fast leaderboard queries
CREATE INDEX IF NOT EXISTS idx_erg_scores_leaderboard
  ON public.erg_scores (test_type, time_seconds)
  WHERE is_verified = true AND to_leaderboard = true;
