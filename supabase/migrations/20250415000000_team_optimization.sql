-- Extend profiles with rowing-specific fields
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS graduation_year int,
  ADD COLUMN IF NOT EXISTS side_preference text,
  ADD COLUMN IF NOT EXISTS position_preference text,
  ADD COLUMN IF NOT EXISTS weight_kg numeric(6,2);

-- Erg benchmark scores (separate from erg_workouts which is session log)
CREATE TABLE IF NOT EXISTS erg_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  test_type text NOT NULL CHECK (test_type IN ('2k','6k','60min')),
  time_seconds int,
  total_meters int,
  avg_split_seconds numeric(8,2),
  watts numeric(8,2),
  watts_per_kg numeric(6,3),
  recorded_at date NOT NULL DEFAULT current_date,
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);
ALTER TABLE erg_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view erg_scores" ON erg_scores FOR SELECT USING (true);
CREATE POLICY "Team members can insert erg_scores" ON erg_scores FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Team members can update erg_scores" ON erg_scores FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Team members can delete erg_scores" ON erg_scores FOR DELETE USING (auth.uid() IS NOT NULL);

-- Boat lineups
CREATE TABLE IF NOT EXISTS boat_lineups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  boat_class text NOT NULL,
  status text DEFAULT 'draft',
  seats jsonb NOT NULL DEFAULT '[]',
  ai_suggestion_used boolean DEFAULT false,
  ai_rationale text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);
ALTER TABLE boat_lineups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view boat_lineups" ON boat_lineups FOR SELECT USING (true);
CREATE POLICY "Coaches can manage boat_lineups" ON boat_lineups FOR ALL USING (auth.uid() IS NOT NULL);

-- On-water results
CREATE TABLE IF NOT EXISTS onwater_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  result_date date NOT NULL,
  piece_type text NOT NULL,
  distance_meters int,
  boat_class text,
  time_seconds int,
  avg_split_seconds numeric(8,2),
  conditions text,
  notes text,
  lineup_id uuid REFERENCES boat_lineups(id),
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);
ALTER TABLE onwater_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view onwater_results" ON onwater_results FOR SELECT USING (true);
CREATE POLICY "Coaches can manage onwater_results" ON onwater_results FOR ALL USING (auth.uid() IS NOT NULL);

-- Seat racing sessions
CREATE TABLE IF NOT EXISTS seat_races (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  race_date date NOT NULL,
  boat_class text NOT NULL,
  pieces jsonb NOT NULL DEFAULT '[]',
  ai_ranking jsonb,
  ai_confidence numeric(4,3),
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);
ALTER TABLE seat_races ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view seat_races" ON seat_races FOR SELECT USING (true);
CREATE POLICY "Coaches can manage seat_races" ON seat_races FOR ALL USING (auth.uid() IS NOT NULL);

-- Weekly load logs
CREATE TABLE IF NOT EXISTS weekly_load_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  total_meters int DEFAULT 0,
  on_water_meters int DEFAULT 0,
  erg_meters int DEFAULT 0,
  intensity_distribution jsonb DEFAULT '{}',
  fatigue_score int CHECK (fatigue_score BETWEEN 1 AND 10),
  soreness_score int CHECK (soreness_score BETWEEN 1 AND 10),
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(team_id, user_id, week_start)
);
ALTER TABLE weekly_load_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view weekly_load_logs" ON weekly_load_logs FOR SELECT USING (true);
CREATE POLICY "Users can manage own load logs" ON weekly_load_logs FOR ALL USING (auth.uid() IS NOT NULL);

-- Team board posts (threaded, with pins) - separate from team_messages
CREATE TABLE IF NOT EXISTS team_board_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  author_id uuid REFERENCES profiles(id),
  parent_id uuid REFERENCES team_board_posts(id) ON DELETE CASCADE,
  category text DEFAULT 'general' CHECK (category IN ('announcement','lineup','general')),
  content text NOT NULL,
  is_pinned boolean DEFAULT false,
  is_edited boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE team_board_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view team_board_posts" ON team_board_posts FOR SELECT USING (true);
CREATE POLICY "Team members can insert team_board_posts" ON team_board_posts FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authors can update own posts" ON team_board_posts FOR UPDATE USING (auth.uid() = author_id OR auth.uid() IS NOT NULL);
CREATE POLICY "Authors can delete own posts" ON team_board_posts FOR DELETE USING (auth.uid() IS NOT NULL);

-- Race lineups (optimizer output)
CREATE TABLE IF NOT EXISTS race_lineups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  race_name text,
  race_date date,
  boat_class text NOT NULL,
  seats jsonb NOT NULL DEFAULT '[]',
  ai_rationale text,
  ai_factors jsonb,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);
ALTER TABLE race_lineups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view race_lineups" ON race_lineups FOR SELECT USING (true);
CREATE POLICY "Coaches can manage race_lineups" ON race_lineups FOR ALL USING (auth.uid() IS NOT NULL);

-- Leaderboard share tokens
CREATE TABLE IF NOT EXISTS leaderboard_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_by uuid REFERENCES profiles(id),
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE leaderboard_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view leaderboard_shares" ON leaderboard_shares FOR SELECT USING (true);
CREATE POLICY "Coaches can manage leaderboard_shares" ON leaderboard_shares FOR ALL USING (auth.uid() IS NOT NULL);

-- Team recruitment targets
CREATE TABLE IF NOT EXISTS team_recruitment_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  position text,
  side_needed text,
  graduation_years int[],
  priority text DEFAULT 'medium',
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);
ALTER TABLE team_recruitment_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view recruitment_targets" ON team_recruitment_targets FOR SELECT USING (true);
CREATE POLICY "Coaches can manage recruitment_targets" ON team_recruitment_targets FOR ALL USING (auth.uid() IS NOT NULL);
