-- Team seasons
CREATE TABLE IF NOT EXISTS team_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE team_seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view seasons" ON team_seasons FOR SELECT USING (
  EXISTS (SELECT 1 FROM team_members WHERE team_id = team_seasons.team_id AND user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM teams WHERE id = team_seasons.team_id AND coach_id = auth.uid())
);
CREATE POLICY "Coaches manage seasons" ON team_seasons FOR ALL USING (
  EXISTS (SELECT 1 FROM teams WHERE id = team_seasons.team_id AND coach_id = auth.uid())
);

-- Named boats
CREATE TABLE IF NOT EXISTS team_boats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  boat_class text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE team_boats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view boats" ON team_boats FOR SELECT USING (
  EXISTS (SELECT 1 FROM team_members WHERE team_id = team_boats.team_id AND user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM teams WHERE id = team_boats.team_id AND coach_id = auth.uid())
);
CREATE POLICY "Coaches manage boats" ON team_boats FOR ALL USING (
  EXISTS (SELECT 1 FROM teams WHERE id = team_boats.team_id AND coach_id = auth.uid())
);

-- Link lineups and results to seasons and named boats
ALTER TABLE boat_lineups ADD COLUMN IF NOT EXISTS season_id uuid REFERENCES team_seasons(id);
ALTER TABLE boat_lineups ADD COLUMN IF NOT EXISTS boat_id uuid REFERENCES team_boats(id);

ALTER TABLE onwater_results ADD COLUMN IF NOT EXISTS season_id uuid REFERENCES team_seasons(id);
ALTER TABLE onwater_results ADD COLUMN IF NOT EXISTS boat_id uuid REFERENCES team_boats(id);
ALTER TABLE onwater_results ADD COLUMN IF NOT EXISTS splits jsonb;
ALTER TABLE onwater_results ADD COLUMN IF NOT EXISTS wind_conditions text;
ALTER TABLE onwater_results ADD COLUMN IF NOT EXISTS water_conditions text;
ALTER TABLE onwater_results ADD COLUMN IF NOT EXISTS stroke_rate numeric;

-- Profile additions
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS best_2k_seconds numeric;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS best_6k_seconds numeric;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS years_rowing int;
