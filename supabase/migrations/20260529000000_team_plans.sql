CREATE TABLE IF NOT EXISTS team_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  source text NOT NULL CHECK (source IN ('imported', 'generated', 'custom')),
  plan_data jsonb NOT NULL,
  total_weeks integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  is_active boolean NOT NULL DEFAULT false
);

ALTER TABLE team_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage team plans" ON team_plans
  FOR ALL USING (
    EXISTS (SELECT 1 FROM teams WHERE id = team_plans.team_id AND coach_id = auth.uid())
    OR EXISTS (SELECT 1 FROM team_coaches WHERE team_id = team_plans.team_id AND user_id = auth.uid())
  );

CREATE POLICY "Athletes view active team plans" ON team_plans
  FOR SELECT USING (
    is_active = true AND
    EXISTS (SELECT 1 FROM team_members WHERE team_id = team_plans.team_id AND user_id = auth.uid())
  );

-- Add coach_assigned_plan_id to workout_plans if not exists
ALTER TABLE workout_plans ADD COLUMN IF NOT EXISTS coach_plan_id uuid REFERENCES team_plans(id) ON DELETE SET NULL;
ALTER TABLE workout_plans ADD COLUMN IF NOT EXISTS is_coach_assigned boolean DEFAULT false;
