-- Teams redesign: simple attendance check-in table + workout draft/publish columns

-- ── attendance table (simple daily check-in, separate from practice_attendance) ──
CREATE TABLE IF NOT EXISTS attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, team_id, date)
);

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Athletes manage their own check-ins
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'attendance' AND policyname = 'Users manage own attendance'
  ) THEN
    CREATE POLICY "Users manage own attendance" ON attendance
      FOR ALL USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Coaches and team members can view their team's attendance
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'attendance' AND policyname = 'Team members view attendance'
  ) THEN
    CREATE POLICY "Team members view attendance" ON attendance
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM team_members WHERE team_id = attendance.team_id AND user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM team_coaches WHERE team_id = attendance.team_id AND user_id = auth.uid())
      );
  END IF;
END $$;

-- ── practice_entries: add workout description columns ──
ALTER TABLE practice_entries ADD COLUMN IF NOT EXISTS workout_description text;
ALTER TABLE practice_entries ADD COLUMN IF NOT EXISTS workout_draft text;
ALTER TABLE practice_entries ADD COLUMN IF NOT EXISTS workout_published_at timestamptz;
ALTER TABLE practice_entries ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id);

-- ── practice_attendance: ensure athletes can INSERT their own rows ──
-- Drop the overly permissive "System insert attendance" if it exists and replace with explicit user check
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'practice_attendance' AND policyname = 'System insert attendance'
  ) THEN
    DROP POLICY "System insert attendance" ON practice_attendance;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'practice_attendance' AND policyname = 'Athletes insert own attendance'
  ) THEN
    CREATE POLICY "Athletes insert own attendance" ON practice_attendance
      FOR INSERT WITH CHECK (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM boat_lineups bl
          JOIN teams t ON t.id = bl.team_id
          WHERE bl.id = lineup_id AND (
            t.coach_id = auth.uid()
            OR EXISTS (SELECT 1 FROM team_coaches WHERE team_id = t.id AND coach_id = auth.uid())
          )
        )
      );
  END IF;
END $$;

-- Ensure practice_entries UPDATE allowed for coaches
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'practice_entries' AND policyname = 'Coxswains update practice entries'
  ) THEN
    CREATE POLICY "Coxswains update practice entries" ON practice_entries
      FOR UPDATE USING (true);
  END IF;
END $$;
