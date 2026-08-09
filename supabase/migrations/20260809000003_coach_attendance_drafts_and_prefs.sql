-- Fix 7: coaches can mark attendance.
--
-- attendance had only: INSERT WITH CHECK (user_id = auth.uid()),
-- SELECT (team-wide), UPDATE USING/CHECK (user_id = auth.uid()).
-- So a coach could read attendance but not write it — coach INSERT failed 42501
-- and coach UPDATE silently matched 0 rows, despite the table carrying a
-- marked_by column clearly intended for exactly this.
CREATE POLICY "attendance_insert_coach" ON attendance
  FOR INSERT WITH CHECK (is_team_coach(auth.uid(), team_id));

CREATE POLICY "attendance_update_coach" ON attendance
  FOR UPDATE USING (is_team_coach(auth.uid(), team_id))
              WITH CHECK (is_team_coach(auth.uid(), team_id));


-- Fix 6: stop athletes reading unpublished workout drafts.
--
-- workout_draft lived on practice_entries alongside workout_description. RLS is
-- row-level, so there is no policy that hides one column of a row an athlete is
-- allowed to read — and column-level REVOKE cannot help either, because coaches
-- and athletes are both the `authenticated` role. Verified live: an athlete
-- selecting workout_draft read the coach's unpublished workout verbatim.
--
-- Drafts therefore move to their own coach-only table.
CREATE TABLE IF NOT EXISTS practice_entry_drafts (
  team_id       uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  practice_date date NOT NULL,
  draft_text    text,
  updated_by    uuid REFERENCES profiles(id),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, practice_date)
);

ALTER TABLE practice_entry_drafts ENABLE ROW LEVEL SECURITY;

-- Coach-only, all commands. No athlete-facing policy exists by design, so
-- athletes cannot select drafts at all.
CREATE POLICY "practice_entry_drafts_coach_all" ON practice_entry_drafts
  FOR ALL USING (is_team_coach(auth.uid(), team_id))
           WITH CHECK (is_team_coach(auth.uid(), team_id));

-- Carry over anything currently held as a draft (0 rows at time of writing).
INSERT INTO practice_entry_drafts (team_id, practice_date, draft_text, updated_by)
SELECT team_id, practice_date, workout_draft, created_by
  FROM practice_entries
 WHERE workout_draft IS NOT NULL
ON CONFLICT (team_id, practice_date) DO NOTHING;

ALTER TABLE practice_entries DROP COLUMN IF EXISTS workout_draft;


-- Fix 4 (schema half): workout_published had no preference column, so a workout
-- notification could never be filtered by preference even once its type is sent
-- correctly. Matches the existing lineup_published column's shape.
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS workout_published boolean NOT NULL DEFAULT true;
