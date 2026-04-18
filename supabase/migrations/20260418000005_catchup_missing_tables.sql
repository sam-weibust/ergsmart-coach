-- ============================================================
-- CATCH-UP MIGRATION: creates all tables that may not exist
-- in the remote Supabase database yet. All statements are
-- idempotent (IF NOT EXISTS / IF NOT EXISTS guards).
-- ============================================================

-- ── 1. Virtual Combine ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.combine_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  two_k_seconds INTEGER,
  two_k_watts NUMERIC,
  six_k_seconds INTEGER,
  six_k_watts NUMERIC,
  bench_press_kg NUMERIC,
  deadlift_kg NUMERIC,
  squat_kg NUMERIC,
  combine_score NUMERIC DEFAULT 0,
  grad_year INTEGER,
  gender TEXT,
  weight_kg NUMERIC,
  notes TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.combine_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'combine_entries' AND policyname = 'Anyone can view combine entries'
  ) THEN
    CREATE POLICY "Anyone can view combine entries" ON public.combine_entries FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'combine_entries' AND policyname = 'Users can manage their own combine entry'
  ) THEN
    CREATE POLICY "Users can manage their own combine entry" ON public.combine_entries FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── 2. Weekly Challenges ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.weekly_challenges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start DATE NOT NULL UNIQUE,
  challenge_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  season_phase TEXT DEFAULT 'base',
  ai_reasoning TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.challenge_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge_id UUID NOT NULL REFERENCES public.weekly_challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  value NUMERIC NOT NULL,
  points INTEGER DEFAULT 0,
  display_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(challenge_id, user_id)
);

ALTER TABLE public.weekly_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'weekly_challenges' AND policyname = 'Anyone can view weekly challenges'
  ) THEN
    CREATE POLICY "Anyone can view weekly challenges" ON public.weekly_challenges FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'challenge_entries' AND policyname = 'Anyone can view challenge entries'
  ) THEN
    CREATE POLICY "Anyone can view challenge entries" ON public.challenge_entries FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'challenge_entries' AND policyname = 'Users can manage their own challenge entries'
  ) THEN
    CREATE POLICY "Users can manage their own challenge entries" ON public.challenge_entries FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── 3. Forum Votes ──────────────────────────────────────────
ALTER TABLE public.forum_topics ADD COLUMN IF NOT EXISTS upvote_count INTEGER DEFAULT 0;
ALTER TABLE public.forum_posts  ADD COLUMN IF NOT EXISTS upvote_count INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.forum_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES public.forum_topics(id) ON DELETE CASCADE,
  post_id  UUID REFERENCES public.forum_posts(id)  ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT one_target CHECK (
    (topic_id IS NOT NULL AND post_id IS NULL) OR
    (topic_id IS NULL AND post_id IS NOT NULL)
  ),
  UNIQUE(user_id, topic_id),
  UNIQUE(user_id, post_id)
);

ALTER TABLE public.forum_votes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'forum_votes' AND policyname = 'Anyone can view votes'
  ) THEN
    CREATE POLICY "Anyone can view votes" ON public.forum_votes FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'forum_votes' AND policyname = 'Users can manage their own votes'
  ) THEN
    CREATE POLICY "Users can manage their own votes" ON public.forum_votes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION update_forum_vote_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.topic_id IS NOT NULL THEN
      UPDATE public.forum_topics SET upvote_count = upvote_count + 1 WHERE id = NEW.topic_id;
    ELSE
      UPDATE public.forum_posts SET upvote_count = upvote_count + 1 WHERE id = NEW.post_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.topic_id IS NOT NULL THEN
      UPDATE public.forum_topics SET upvote_count = GREATEST(0, upvote_count - 1) WHERE id = OLD.topic_id;
    ELSE
      UPDATE public.forum_posts SET upvote_count = GREATEST(0, upvote_count - 1) WHERE id = OLD.post_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS update_vote_counts ON public.forum_votes;
CREATE TRIGGER update_vote_counts
  AFTER INSERT OR DELETE ON public.forum_votes
  FOR EACH ROW EXECUTE FUNCTION update_forum_vote_count();

-- ── 4. Program Alumni Network ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.program_alumni (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  athlete_name TEXT NOT NULL,
  grad_year INTEGER,
  high_school TEXT,
  college_name TEXT,
  division TEXT,
  state TEXT,
  sport TEXT DEFAULT 'Rowing',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.program_alumni ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'program_alumni' AND policyname = 'Coaches can view their own alumni'
  ) THEN
    CREATE POLICY "Coaches can view their own alumni" ON public.program_alumni FOR SELECT USING (auth.uid() = coach_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'program_alumni' AND policyname = 'Coaches can manage their own alumni'
  ) THEN
    CREATE POLICY "Coaches can manage their own alumni" ON public.program_alumni FOR ALL USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);
  END IF;
END $$;

-- ── 5. Verified Times (Global Leaderboard) ──────────────────
CREATE TABLE IF NOT EXISTS public.verified_times (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  distance INTEGER NOT NULL,
  time_achieved TIMESTAMP WITH TIME ZONE NOT NULL,
  category TEXT NOT NULL,
  gender TEXT NOT NULL,
  weight_class TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending',
  screenshot_url TEXT NOT NULL,
  rejection_reason TEXT,
  verified_at TIMESTAMP WITH TIME ZONE,
  verified_by UUID REFERENCES public.profiles(id),
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.verified_times ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'verified_times' AND policyname = 'Anyone can view approved verified times'
  ) THEN
    CREATE POLICY "Anyone can view approved verified times" ON public.verified_times FOR SELECT USING (
      verification_status = 'approved' OR auth.uid() = user_id
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'verified_times' AND policyname = 'Users can submit their own times'
  ) THEN
    CREATE POLICY "Users can submit their own times" ON public.verified_times FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'verified_times' AND policyname = 'Admins can update verification status'
  ) THEN
    CREATE POLICY "Admins can update verification status" ON public.verified_times FOR UPDATE USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- ── 6. seat_races: add athlete1_id / athlete2_id / winner_id ─
ALTER TABLE public.seat_races ADD COLUMN IF NOT EXISTS athlete1_id UUID REFERENCES public.profiles(id);
ALTER TABLE public.seat_races ADD COLUMN IF NOT EXISTS athlete2_id UUID REFERENCES public.profiles(id);
ALTER TABLE public.seat_races ADD COLUMN IF NOT EXISTS winner_id UUID REFERENCES public.profiles(id);

-- ── 7. concept2_tokens: last_sync_at + user SELECT policy ───
ALTER TABLE public.concept2_tokens ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'concept2_tokens' AND policyname = 'Users can read their own c2 connection status'
  ) THEN
    CREATE POLICY "Users can read their own c2 connection status"
    ON public.concept2_tokens FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── 8. update_updated_at triggers (if not already present) ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_combine_entries_updated_at') THEN
    CREATE TRIGGER update_combine_entries_updated_at
      BEFORE UPDATE ON public.combine_entries
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_challenge_entries_updated_at') THEN
    CREATE TRIGGER update_challenge_entries_updated_at
      BEFORE UPDATE ON public.challenge_entries
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_program_alumni_updated_at') THEN
    CREATE TRIGGER update_program_alumni_updated_at
      BEFORE UPDATE ON public.program_alumni
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_verified_times_updated_at') THEN
    CREATE TRIGGER update_verified_times_updated_at
      BEFORE UPDATE ON public.verified_times
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
