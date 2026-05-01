-- Add publish and scheduling fields to boat_lineups
ALTER TABLE boat_lineups ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE boat_lineups ADD COLUMN IF NOT EXISTS practice_date date;
ALTER TABLE boat_lineups ADD COLUMN IF NOT EXISTS practice_start_time time;

-- Attendance tracking table
CREATE TABLE IF NOT EXISTS practice_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lineup_id uuid REFERENCES boat_lineups(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL DEFAULT 'no_response' CHECK (status IN ('yes', 'no', 'maybe', 'no_response')),
  responded_at timestamptz,
  overridden_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(lineup_id, user_id)
);

ALTER TABLE practice_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Attendance visible to member and coach" ON practice_attendance
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM boat_lineups bl
      JOIN teams t ON t.id = bl.team_id
      WHERE bl.id = lineup_id AND t.coach_id = auth.uid()
    )
  );

CREATE POLICY "Athletes update own attendance" ON practice_attendance
  FOR UPDATE USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM boat_lineups bl
      JOIN teams t ON t.id = bl.team_id
      WHERE bl.id = lineup_id AND t.coach_id = auth.uid()
    )
  );

CREATE POLICY "System insert attendance" ON practice_attendance
  FOR INSERT WITH CHECK (true);

-- Coxswain fields on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_coxswain boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cox_weight_lbs numeric;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cox_experience text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cox_steering_pref text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cox_voice_level int;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cox_years_coxing int;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cox_notes text;

-- Add logged_by to onwater_results for coxswain tracking
ALTER TABLE onwater_results ADD COLUMN IF NOT EXISTS logged_by uuid REFERENCES profiles(id);
ALTER TABLE onwater_results ADD COLUMN IF NOT EXISTS lineup_id uuid REFERENCES boat_lineups(id);
ALTER TABLE onwater_results ADD COLUMN IF NOT EXISTS athlete_ids uuid[];
