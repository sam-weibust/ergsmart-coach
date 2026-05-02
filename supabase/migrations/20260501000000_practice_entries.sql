-- Practice entries: auto-created when a lineup is published
-- Coxswain fills in workout data after practice; coaches add notes
CREATE TABLE IF NOT EXISTS practice_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  lineup_id uuid REFERENCES boat_lineups(id) ON DELETE SET NULL,
  practice_date date NOT NULL,
  boat_id uuid REFERENCES team_boats(id) ON DELETE SET NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'logged')),
  coach_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE practice_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view practice entries" ON practice_entries
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM team_members WHERE team_id = practice_entries.team_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM teams WHERE id = practice_entries.team_id AND coach_id = auth.uid())
  );

CREATE POLICY "Coaches manage practice entries" ON practice_entries
  FOR ALL USING (
    EXISTS (SELECT 1 FROM teams WHERE id = practice_entries.team_id AND coach_id = auth.uid())
  );

CREATE POLICY "Coxswains insert practice entries" ON practice_entries
  FOR INSERT WITH CHECK (true);

-- Add best_2k_date and best_6k_date columns for tracking when PRs were set
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS best_2k_date date;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS best_6k_date date;
