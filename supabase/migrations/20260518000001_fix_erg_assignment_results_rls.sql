-- Drop all existing policies on erg_assignment_results
DROP POLICY IF EXISTS "Athletes view only own results" ON public.erg_assignment_results;
DROP POLICY IF EXISTS "Athletes insert own results" ON public.erg_assignment_results;
DROP POLICY IF EXISTS "Athletes update own results" ON public.erg_assignment_results;
DROP POLICY IF EXISTS "Coaches view all results for their team" ON public.erg_assignment_results;
DROP POLICY IF EXISTS "Coxswains log for boat athletes" ON public.erg_assignment_results;
DROP POLICY IF EXISTS "Coxswains update results they logged" ON public.erg_assignment_results;
DROP POLICY IF EXISTS athlete_select_own ON public.erg_assignment_results;
DROP POLICY IF EXISTS athlete_insert_own ON public.erg_assignment_results;
DROP POLICY IF EXISTS athlete_update_own ON public.erg_assignment_results;
DROP POLICY IF EXISTS coach_select_team ON public.erg_assignment_results;
DROP POLICY IF EXISTS coach_update_team ON public.erg_assignment_results;
DROP POLICY IF EXISTS coxswain_insert ON public.erg_assignment_results;

ALTER TABLE public.erg_assignment_results ENABLE ROW LEVEL SECURITY;

-- Policy 1: Athletes read own results
CREATE POLICY athlete_select_own ON public.erg_assignment_results
  FOR SELECT USING (athlete_id = auth.uid());

-- Policy 2: Athletes insert own results
CREATE POLICY athlete_insert_own ON public.erg_assignment_results
  FOR INSERT WITH CHECK (athlete_id = auth.uid());

-- Policy 3: Athletes update own results
CREATE POLICY athlete_update_own ON public.erg_assignment_results
  FOR UPDATE USING (athlete_id = auth.uid()) WITH CHECK (athlete_id = auth.uid());

-- Policy 4: Coaches read all results for their team
CREATE POLICY coach_select_team ON public.erg_assignment_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM erg_assignments ea
      JOIN team_coaches tc ON tc.team_id = ea.team_id
      WHERE ea.id = erg_assignment_results.assignment_id
        AND tc.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM erg_assignments ea
      JOIN teams t ON t.id = ea.team_id
      WHERE ea.id = erg_assignment_results.assignment_id
        AND t.coach_id = auth.uid()
    )
  );

-- Policy 5: Coaches update all results for their team
CREATE POLICY coach_update_team ON public.erg_assignment_results
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM erg_assignments ea
      JOIN team_coaches tc ON tc.team_id = ea.team_id
      WHERE ea.id = erg_assignment_results.assignment_id
        AND tc.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM erg_assignments ea
      JOIN teams t ON t.id = ea.team_id
      WHERE ea.id = erg_assignment_results.assignment_id
        AND t.coach_id = auth.uid()
    )
  );

-- Policy 6: Coxswains insert results for athletes in their boat
CREATE POLICY coxswain_insert ON public.erg_assignment_results
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coxswain'
    )
  );
