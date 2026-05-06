CREATE TABLE IF NOT EXISTS public.team_daily_workouts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  workout_data jsonb NOT NULL,
  pushed_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(team_id, date)
);

ALTER TABLE public.team_daily_workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view daily workouts" ON public.team_daily_workouts
  FOR SELECT USING (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
    OR team_id IN (SELECT id FROM teams WHERE coach_id = auth.uid())
  );

CREATE POLICY "Coaches can manage daily workouts" ON public.team_daily_workouts
  FOR ALL USING (
    team_id IN (SELECT id FROM teams WHERE coach_id = auth.uid())
  );
