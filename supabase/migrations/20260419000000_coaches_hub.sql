-- ============================================================
-- COACHES HUB
-- ============================================================

-- coach_profiles: program information used by AI for scoring
CREATE TABLE IF NOT EXISTS public.coach_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  school_name text,
  division text CHECK (division IN ('D1','D2','D3','NAIA','Club','High School')),
  location text,
  team_type text CHECK (team_type IN ('varsity','club','high_school')),
  program_description text,
  target_2k_min_seconds int,
  target_2k_max_seconds int,
  target_height_min_cm numeric,
  target_height_max_cm numeric,
  target_weight_min_kg numeric,
  target_weight_max_kg numeric,
  port_starboard_preference text CHECK (port_starboard_preference IN ('port','starboard','balanced')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.coach_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coaches manage own program profile" ON public.coach_profiles
  FOR ALL USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);
CREATE POLICY "Coach profiles viewable by authenticated users" ON public.coach_profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- recruiting_board: kanban board state
DO $$ BEGIN
  CREATE TYPE public.board_status AS ENUM ('watching','contacted','interested','offered','committed','not_a_fit');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.recruiting_board (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  athlete_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status public.board_status DEFAULT 'watching' NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(coach_id, athlete_user_id)
);
ALTER TABLE public.recruiting_board ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coaches manage own recruiting board" ON public.recruiting_board
  FOR ALL USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);

-- recruit_contacts: contact log
CREATE TABLE IF NOT EXISTS public.recruit_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  athlete_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  contacted_at timestamptz DEFAULT now() NOT NULL,
  subject text,
  status text DEFAULT 'sent' CHECK (status IN ('sent','replied','no_response')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.recruit_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coaches manage own contact history" ON public.recruit_contacts
  FOR ALL USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);

-- coach_followed_athletes: followed list
CREATE TABLE IF NOT EXISTS public.coach_followed_athletes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  athlete_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  last_viewed_at timestamptz DEFAULT now(),
  UNIQUE(coach_id, athlete_user_id)
);
ALTER TABLE public.coach_followed_athletes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coaches manage own followed athletes" ON public.coach_followed_athletes
  FOR ALL USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);
-- athletes can see who is following them
CREATE POLICY "Athletes can view their followers" ON public.coach_followed_athletes
  FOR SELECT USING (auth.uid() = athlete_user_id);

-- coach_flagged_athletes: not a fit
CREATE TABLE IF NOT EXISTS public.coach_flagged_athletes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  athlete_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(coach_id, athlete_user_id)
);
ALTER TABLE public.coach_flagged_athletes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coaches manage own flagged athletes" ON public.coach_flagged_athletes
  FOR ALL USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);

-- recruit_scores: cached AI relevance scores
CREATE TABLE IF NOT EXISTS public.recruit_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  athlete_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  score int CHECK (score >= 0 AND score <= 100),
  reasoning text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '7 days'),
  UNIQUE(coach_id, athlete_user_id)
);
ALTER TABLE public.recruit_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coaches manage own recruit scores" ON public.recruit_scores
  FOR ALL USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);

-- coach_recommendations: AI-generated recommendations
CREATE TABLE IF NOT EXISTS public.coach_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  athlete_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  reasoning text,
  gap_addressed text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '7 days'),
  UNIQUE(coach_id, athlete_user_id)
);
ALTER TABLE public.coach_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coaches manage own recommendations" ON public.coach_recommendations
  FOR ALL USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);

-- coach_athlete_views: track when coaches view athlete profiles (for athlete notifications)
CREATE TABLE IF NOT EXISTS public.coach_athlete_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  athlete_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  viewed_at timestamptz DEFAULT now()
);
ALTER TABLE public.coach_athlete_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coaches insert own views" ON public.coach_athlete_views
  FOR INSERT WITH CHECK (auth.uid() = coach_id);
CREATE POLICY "Athletes can see their views" ON public.coach_athlete_views
  FOR SELECT USING (auth.uid() = athlete_user_id OR auth.uid() = coach_id);

-- notifications for athletes when coaches view/follow them
-- (uses existing notifications table if present, otherwise add relevant policy)
DO $$ BEGIN
  ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS related_coach_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS related_program_name text;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
