-- Fix attendance RLS policies
-- Table uses: date (not practice_date), status IN ('present','absent'), UNIQUE(user_id,team_id,date)

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Drop all existing attendance policies and recreate cleanly
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'attendance' LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON attendance';
  END LOOP;
END $$;

-- Athletes INSERT their own check-in
CREATE POLICY "Athletes insert own attendance" ON attendance
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Athletes UPDATE their own check-in
CREATE POLICY "Athletes update own attendance" ON attendance
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Anyone can SELECT attendance for a team they belong to (as member, coach, or team owner)
CREATE POLICY "Team members view attendance" ON attendance
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM team_members WHERE team_id = attendance.team_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM team_coaches WHERE team_id = attendance.team_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM teams WHERE id = attendance.team_id AND coach_id = auth.uid())
  );
