-- ============================================================
-- FULL REMOTE CATCH-UP
-- Applies all manually-written migrations that were never
-- pushed to the remote Supabase database.
-- Every statement is idempotent — safe to run multiple times.
-- ============================================================

-- ── erg_workouts extra columns ──────────────────────────────
ALTER TABLE public.erg_workouts ADD COLUMN IF NOT EXISTS stroke_data JSONB;
ALTER TABLE public.erg_workouts ADD COLUMN IF NOT EXISTS avg_watts INTEGER;
ALTER TABLE public.erg_workouts ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS erg_workouts_external_id_user_idx
  ON public.erg_workouts (user_id, external_id) WHERE external_id IS NOT NULL;

-- ── athlete_profiles ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.athlete_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  bio text,
  grad_year int,
  school text,
  club_team text,
  location text,
  personal_facts jsonb DEFAULT '[]'::jsonb,
  social_links jsonb DEFAULT '{}'::jsonb,
  personal_statement text,
  avatar_url text,
  is_public boolean DEFAULT false,
  view_count int DEFAULT 0,
  ai_summary text,
  ai_summary_updated_at timestamptz,
  is_recruiting boolean DEFAULT false,
  intended_major text,
  division_interest text,
  gpa numeric(3,2),
  highlight_video_url text,
  coach_view_count int DEFAULT 0,
  contact_email text,
  last_concept2_sync timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.athlete_profiles ADD COLUMN IF NOT EXISTS last_concept2_sync timestamptz;
ALTER TABLE public.athlete_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Athletes can manage own profile" ON public.athlete_profiles;
CREATE POLICY "Athletes can manage own profile" ON public.athlete_profiles
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public profiles are viewable by anyone" ON public.athlete_profiles;
CREATE POLICY "Public profiles are viewable by anyone" ON public.athlete_profiles
  FOR SELECT USING (is_public = true);

-- ── profile_views ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profile_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  viewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  viewer_type text DEFAULT 'anonymous',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert a profile view" ON public.profile_views;
CREATE POLICY "Anyone can insert a profile view" ON public.profile_views FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Athletes can view their own view records" ON public.profile_views;
CREATE POLICY "Athletes can view their own view records" ON public.profile_views
  FOR SELECT USING (auth.uid() = profile_user_id);

-- ── profile_follows ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profile_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(follower_id, following_id)
);
ALTER TABLE public.profile_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own follows" ON public.profile_follows;
CREATE POLICY "Users manage their own follows" ON public.profile_follows
  FOR ALL USING (auth.uid() = follower_id) WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Anyone can read follow counts" ON public.profile_follows;
CREATE POLICY "Anyone can read follow counts" ON public.profile_follows FOR SELECT USING (true);

-- ── college_targets ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.college_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  school_name text NOT NULL,
  division text NOT NULL,
  status text DEFAULT 'interested',
  fit_score text,
  fit_notes text,
  improve_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.college_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own college targets" ON public.college_targets;
CREATE POLICY "Users manage own college targets" ON public.college_targets
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── rowing_coaches ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rowing_coaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name text NOT NULL,
  division text NOT NULL,
  conference text,
  coach_name text,
  title text DEFAULT 'Head Coach',
  email text,
  phone text,
  website text,
  state text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.rowing_coaches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read coaches" ON public.rowing_coaches;
CREATE POLICY "Anyone can read coaches" ON public.rowing_coaches FOR SELECT USING (true);

-- ── RPCs for profile views ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_profile_view(target_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.athlete_profiles SET view_count = COALESCE(view_count, 0) + 1
  WHERE user_id = target_user_id AND is_public = true;
$$;

CREATE OR REPLACE FUNCTION public.increment_coach_view(target_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.athlete_profiles SET coach_view_count = COALESCE(coach_view_count, 0) + 1
  WHERE user_id = target_user_id AND is_public = true;
$$;

-- ── Storage bucket for avatars ───────────────────────────────
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatar images are publicly accessible" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar" ON storage.objects
  FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ── Head-to-Head race tables ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.race_rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_code TEXT UNIQUE NOT NULL,
  creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  distance INTEGER NOT NULL DEFAULT 2000,
  status TEXT NOT NULL DEFAULT 'lobby',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.race_participants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES public.race_rooms(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  display_name TEXT NOT NULL DEFAULT 'Athlete',
  erg_score_2k INTEGER,
  current_split INTEGER,
  current_spm INTEGER,
  current_distance REAL DEFAULT 0,
  current_watts INTEGER,
  elapsed_time INTEGER DEFAULT 0,
  finished_at TIMESTAMPTZ,
  finish_time INTEGER,
  avg_split INTEGER,
  avg_spm INTEGER,
  stroke_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(room_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.race_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT 'Athlete',
  erg_score_2k INTEGER,
  queued_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.race_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.race_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.race_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read race rooms" ON public.race_rooms;
CREATE POLICY "Anyone can read race rooms" ON public.race_rooms FOR SELECT USING (true);
DROP POLICY IF EXISTS "Auth users can create race rooms" ON public.race_rooms;
CREATE POLICY "Auth users can create race rooms" ON public.race_rooms FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Creator can update race room" ON public.race_rooms;
CREATE POLICY "Creator can update race room" ON public.race_rooms FOR UPDATE USING (creator_id = auth.uid());

DROP POLICY IF EXISTS "Anyone can read race participants" ON public.race_participants;
CREATE POLICY "Anyone can read race participants" ON public.race_participants FOR SELECT USING (true);
DROP POLICY IF EXISTS "Auth users can join races" ON public.race_participants;
CREATE POLICY "Auth users can join races" ON public.race_participants FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can update own participant row" ON public.race_participants;
CREATE POLICY "Users can update own participant row" ON public.race_participants FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Anyone can read race queue" ON public.race_queue;
CREATE POLICY "Anyone can read race queue" ON public.race_queue FOR SELECT USING (true);
DROP POLICY IF EXISTS "Auth users can join queue" ON public.race_queue;
CREATE POLICY "Auth users can join queue" ON public.race_queue FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can leave queue" ON public.race_queue;
CREATE POLICY "Users can leave queue" ON public.race_queue FOR DELETE USING (user_id = auth.uid());

-- ── concept2_tokens ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.concept2_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.concept2_tokens ADD COLUMN IF NOT EXISTS last_sync_at timestamptz;
ALTER TABLE public.concept2_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON public.concept2_tokens;
CREATE POLICY "service_role_all" ON public.concept2_tokens USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Users can read their own c2 connection status" ON public.concept2_tokens;
CREATE POLICY "Users can read their own c2 connection status" ON public.concept2_tokens
  FOR SELECT USING (auth.uid() = user_id);

-- ── seat_races extra columns ─────────────────────────────────
ALTER TABLE public.seat_races ADD COLUMN IF NOT EXISTS athlete1_id UUID REFERENCES public.profiles(id);
ALTER TABLE public.seat_races ADD COLUMN IF NOT EXISTS athlete2_id UUID REFERENCES public.profiles(id);
ALTER TABLE public.seat_races ADD COLUMN IF NOT EXISTS winner_id UUID REFERENCES public.profiles(id);

-- ── combine_entries ──────────────────────────────────────────
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

DROP POLICY IF EXISTS "Anyone can view combine entries" ON public.combine_entries;
CREATE POLICY "Anyone can view combine entries" ON public.combine_entries FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can manage their own combine entry" ON public.combine_entries;
CREATE POLICY "Users can manage their own combine entry" ON public.combine_entries
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── weekly_challenges + challenge_entries ────────────────────
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

DROP POLICY IF EXISTS "Anyone can view weekly challenges" ON public.weekly_challenges;
CREATE POLICY "Anyone can view weekly challenges" ON public.weekly_challenges FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can view challenge entries" ON public.challenge_entries;
CREATE POLICY "Anyone can view challenge entries" ON public.challenge_entries FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can manage their own challenge entries" ON public.challenge_entries;
CREATE POLICY "Users can manage their own challenge entries" ON public.challenge_entries
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── forum votes + upvote counts ──────────────────────────────
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

DROP POLICY IF EXISTS "Anyone can view votes" ON public.forum_votes;
CREATE POLICY "Anyone can view votes" ON public.forum_votes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can manage their own votes" ON public.forum_votes;
CREATE POLICY "Users can manage their own votes" ON public.forum_votes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_forum_vote_count()
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
  FOR EACH ROW EXECUTE FUNCTION public.update_forum_vote_count();

-- ── program_alumni ───────────────────────────────────────────
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

DROP POLICY IF EXISTS "Coaches can view their own alumni" ON public.program_alumni;
CREATE POLICY "Coaches can view their own alumni" ON public.program_alumni FOR SELECT USING (auth.uid() = coach_id);
DROP POLICY IF EXISTS "Coaches can manage their own alumni" ON public.program_alumni;
CREATE POLICY "Coaches can manage their own alumni" ON public.program_alumni
  FOR ALL USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);

-- ── verified_times ───────────────────────────────────────────
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

DROP POLICY IF EXISTS "Anyone can view approved verified times" ON public.verified_times;
CREATE POLICY "Anyone can view approved verified times" ON public.verified_times
  FOR SELECT USING (verification_status = 'approved' OR auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can submit their own times" ON public.verified_times;
CREATE POLICY "Users can submit their own times" ON public.verified_times
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins can update verification status" ON public.verified_times;
CREATE POLICY "Admins can update verification status" ON public.verified_times
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- ── Realtime publications ────────────────────────────────────
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.race_rooms;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.race_participants;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.race_queue;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.team_board_posts;
EXCEPTION WHEN others THEN NULL; END $$;

-- ── updated_at triggers ──────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_combine_entries_updated_at') THEN
    CREATE TRIGGER update_combine_entries_updated_at BEFORE UPDATE ON public.combine_entries
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_challenge_entries_updated_at') THEN
    CREATE TRIGGER update_challenge_entries_updated_at BEFORE UPDATE ON public.challenge_entries
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_program_alumni_updated_at') THEN
    CREATE TRIGGER update_program_alumni_updated_at BEFORE UPDATE ON public.program_alumni
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_verified_times_updated_at') THEN
    CREATE TRIGGER update_verified_times_updated_at BEFORE UPDATE ON public.verified_times
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- ── Seed: rowing coaches directory ───────────────────────────
INSERT INTO public.rowing_coaches (school_name, division, conference, coach_name, title, email, state) VALUES
('Yale University','D1','Ivy League','Will Borek','Head Coach','william.borek@yale.edu','CT'),
('Harvard University','D1','Ivy League','Charley Sullivan','Head Coach','csullivan@fas.harvard.edu','MA'),
('Princeton University','D1','Ivy League','Hap Wagner','Head Coach','hwagner@princeton.edu','NJ'),
('University of Washington','D1','Pac-12','Michael Callahan','Head Coach','rowinginfo@uw.edu','WA'),
('University of Virginia','D1','ACC','Kevin Sauer','Head Coach','ksauer@virginia.edu','VA'),
('Stanford University','D1','Pac-12','Derek Byrnes','Head Coach','rowing@stanford.edu','CA'),
('MIT','D3','NESCAC','Dan Bathgate','Head Coach','rowing@mit.edu','MA'),
('Williams College','D3','NESCAC','Shane Gilliland','Head Coach','rowing@williams.edu','MA'),
('Middlebury College','D3','NESCAC','Karl Jankowski','Head Coach','rowing@middlebury.edu','VT'),
('University of California Berkeley','D1','Pac-12','Steve Boudreau','Head Coach','calbears-rowing@berkeley.edu','CA'),
('Ohio State University','D1','Big Ten','Emre Aydin','Head Coach','rowing@osu.edu','OH'),
('University of Michigan','D1','Big Ten','Mark Rothstein','Head Coach','rowing@umich.edu','MI'),
('University of Wisconsin','D1','Big Ten','Chris Pfent','Head Coach','rowing@wisc.edu','WI'),
('University of Texas','D1','Big 12','Dave O''Neill','Head Coach','rowing@utexas.edu','TX'),
('Georgetown University','D1','Big East','Jake Wetzel','Head Coach','rowing@georgetown.edu','DC'),
('Northeastern University','D1','CAA','Chris Dowd','Head Coach','rowing@neu.edu','MA'),
('Boston University','D1','Patriot League','Eugene Arrington','Head Coach','rowing@bu.edu','MA'),
('University of Pennsylvania','D1','Ivy League','Susan Trainor','Head Coach','rowing@upenn.edu','PA'),
('Columbia University','D1','Ivy League','Kevin Sauer','Head Coach','rowing@columbia.edu','NY'),
('Cornell University','D1','Ivy League','Lori Dauphiny','Head Coach','rowing@cornell.edu','NY'),
('Dartmouth College','D1','Ivy League','Gregg Robinson','Head Coach','rowing@dartmouth.edu','NH'),
('Brown University','D1','Ivy League','Paul Forde','Head Coach','rowing@brown.edu','RI'),
('Syracuse University','D1','ACC','Derek Byrnes','Head Coach','rowing@syr.edu','NY'),
('University of Notre Dame','D1','ACC','Martin Stone','Head Coach','rowing@nd.edu','IN'),
('Villanova University','D1','Big East','Becky Wycherley','Head Coach','rowing@villanova.edu','PA'),
('Drexel University','D1','CAA','Paul Savell','Head Coach','rowing@drexel.edu','PA'),
('George Washington University','D1','Atlantic 10','John O''Reilly','Head Coach','rowing@gwu.edu','DC'),
('American University','D1','Patriot League','Mark Rosen','Head Coach','rowing@american.edu','DC'),
('Holy Cross','D1','Patriot League','Patrick Devin','Head Coach','rowing@holycross.edu','MA'),
('Colgate University','D1','Patriot League','Brian Fullem','Head Coach','rowing@colgate.edu','NY'),
('Bates College','D3','NESCAC','Peter Steenstra','Head Coach','rowing@bates.edu','ME'),
('Bowdoin College','D3','NESCAC','Phil Pierce','Head Coach','rowing@bowdoin.edu','ME'),
('Colby College','D3','NESCAC','Kris Pelletier','Head Coach','rowing@colby.edu','ME'),
('Trinity College','D3','NESCAC','Peter Sherwood','Head Coach','rowing@trincoll.edu','CT'),
('Wesleyan University','D3','NESCAC','Tom Babbitt','Head Coach','rowing@wesleyan.edu','CT'),
('Amherst College','D3','NESCAC','David Sherwood','Head Coach','rowing@amherst.edu','MA'),
('Hamilton College','D3','Liberty League','Steve Kaplan','Head Coach','rowing@hamilton.edu','NY'),
('Tufts University','D3','NESCAC','Nate Silva','Head Coach','rowing@tufts.edu','MA'),
('University of Puget Sound','D3','Northwest Conference','Karoline Breckenridge','Head Coach','rowing@pugetsound.edu','WA'),
('Gonzaga University','D1','WCC','Jennifer Sherlock','Head Coach','rowing@gonzaga.edu','WA'),
('Santa Clara University','D1','WCC','Dan Mahoney','Head Coach','rowing@scu.edu','CA'),
('Loyola Marymount University','D1','WCC','Nicole Vallone','Head Coach','rowing@lmu.edu','CA'),
('University of San Diego','D1','WCC','Mary Whipple','Head Coach','rowing@sandiego.edu','CA'),
('University of Minnesota','D1','Big Ten','Steve Witzel','Head Coach','rowing@umn.edu','MN'),
('Indiana University','D1','Big Ten','Rebecca Nigh','Head Coach','rowing@indiana.edu','IN'),
('Michigan State University','D1','Big Ten','Stephanie Rempe','Head Coach','rowing@msu.edu','MI'),
('University of Iowa','D1','Big Ten','Andrew Carter','Head Coach','rowing@uiowa.edu','IA'),
('University of Nebraska','D1','Big Ten','Jamie Schwaiger','Head Coach','rowing@unl.edu','NE'),
('University of Kansas','D1','Big 12','Heidi Eichner','Head Coach','rowing@ku.edu','KS'),
('Kansas State University','D1','Big 12','Melissa Roppolo','Head Coach','rowing@ksu.edu','KS'),
('University of Tennessee','D1','SEC','Emily Ford','Head Coach','rowing@utk.edu','TN'),
('University of Alabama','D1','SEC','Megan Tanner','Head Coach','rowing@ua.edu','AL'),
('University of Georgia','D1','SEC','Jeff Burns','Head Coach','rowing@uga.edu','GA'),
('University of Florida','D1','SEC','Kim Dobrott','Head Coach','rowing@ufl.edu','FL'),
('Florida State University','D1','ACC','Meghan Musnicki','Head Coach','rowing@fsu.edu','FL'),
('University of Miami','D1','ACC','Dave Vogt','Head Coach','rowing@miami.edu','FL'),
('Duke University','D1','ACC','Jake Reed','Head Coach','rowing@duke.edu','NC'),
('University of North Carolina','D1','ACC','Una McCarthy','Head Coach','rowing@unc.edu','NC'),
('Wake Forest University','D1','ACC','Mike Gehrken','Head Coach','rowing@wfu.edu','NC'),
('Boston College','D1','ACC','Tom Bohrer','Head Coach','rowing@bc.edu','MA'),
('University of Connecticut','D1','Big East','Marlene Royle','Head Coach','rowing@uconn.edu','CT'),
('University of Louisville','D1','ACC','Cara Stawasz','Head Coach','rowing@louisville.edu','KY')
ON CONFLICT DO NOTHING;
