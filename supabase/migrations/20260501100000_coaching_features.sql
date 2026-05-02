-- Fix attendance SELECT policy to allow all team members to see lineup attendance
DROP POLICY IF EXISTS "Attendance visible to member and coach" ON practice_attendance;
CREATE POLICY "Attendance visible to team" ON practice_attendance
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM boat_lineups bl
      JOIN teams t ON t.id = bl.team_id
      LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = auth.uid()
      WHERE bl.id = lineup_id AND (t.coach_id = auth.uid() OR tm.user_id IS NOT NULL)
    )
  );

-- Allow team members to update practice entries status (mark as logged)
CREATE POLICY "Team members update practice entries" ON practice_entries
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM team_members WHERE team_id = practice_entries.team_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM teams WHERE id = practice_entries.team_id AND coach_id = auth.uid())
  );

-- on_water_pieces: multi-piece tracking per practice session
CREATE TABLE IF NOT EXISTS on_water_pieces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES practice_entries(id) ON DELETE CASCADE NOT NULL,
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  piece_number int NOT NULL DEFAULT 1,
  piece_type text NOT NULL DEFAULT 'steady_state'
    CHECK (piece_type IN ('steady_state','race_pace','rate_work','technical','starts','race_simulation')),
  distance int,
  time_seconds int,
  average_split_seconds numeric,
  splits jsonb,
  stroke_rate numeric,
  target_split_seconds numeric,
  notes text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE on_water_pieces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members view pieces" ON on_water_pieces
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM team_members WHERE team_id = on_water_pieces.team_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM teams WHERE id = on_water_pieces.team_id AND coach_id = auth.uid())
  );
CREATE POLICY "Team members insert pieces" ON on_water_pieces
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND (
      EXISTS (SELECT 1 FROM team_members WHERE team_id = on_water_pieces.team_id AND user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM teams WHERE id = on_water_pieces.team_id AND coach_id = auth.uid())
    )
  );
CREATE POLICY "Piece creator or coach can update" ON on_water_pieces
  FOR UPDATE USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM teams WHERE id = on_water_pieces.team_id AND coach_id = auth.uid())
  );
CREATE POLICY "Piece creator or coach can delete" ON on_water_pieces
  FOR DELETE USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM teams WHERE id = on_water_pieces.team_id AND coach_id = auth.uid())
  );

-- practice_drills: drill log per session
CREATE TABLE IF NOT EXISTS practice_drills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES practice_entries(id) ON DELETE CASCADE NOT NULL,
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  drill_name text NOT NULL,
  duration_minutes int,
  notes text,
  logged_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE practice_drills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members view drills" ON practice_drills
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM team_members WHERE team_id = practice_drills.team_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM teams WHERE id = practice_drills.team_id AND coach_id = auth.uid())
  );
CREATE POLICY "Team members insert drills" ON practice_drills
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND (
      EXISTS (SELECT 1 FROM team_members WHERE team_id = practice_drills.team_id AND user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM teams WHERE id = practice_drills.team_id AND coach_id = auth.uid())
    )
  );
CREATE POLICY "Drill logger or coach can delete" ON practice_drills
  FOR DELETE USING (
    logged_by = auth.uid()
    OR EXISTS (SELECT 1 FROM teams WHERE id = practice_drills.team_id AND coach_id = auth.uid())
  );

-- cox_technical_ratings: post-practice technical assessment
CREATE TABLE IF NOT EXISTS cox_technical_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES practice_entries(id) ON DELETE CASCADE NOT NULL,
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  rated_by uuid REFERENCES profiles(id),
  set_and_balance int CHECK (set_and_balance BETWEEN 1 AND 5),
  timing int CHECK (timing BETWEEN 1 AND 5),
  drive_length int CHECK (drive_length BETWEEN 1 AND 5),
  bladework int CHECK (bladework BETWEEN 1 AND 5),
  focus int CHECK (focus BETWEEN 1 AND 5),
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE cox_technical_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members view ratings" ON cox_technical_ratings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM team_members WHERE team_id = cox_technical_ratings.team_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM teams WHERE id = cox_technical_ratings.team_id AND coach_id = auth.uid())
  );
CREATE POLICY "Team members insert ratings" ON cox_technical_ratings
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND (
      EXISTS (SELECT 1 FROM team_members WHERE team_id = cox_technical_ratings.team_id AND user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM teams WHERE id = cox_technical_ratings.team_id AND coach_id = auth.uid())
    )
  );
CREATE POLICY "Rater or coach can update" ON cox_technical_ratings
  FOR UPDATE USING (
    rated_by = auth.uid()
    OR EXISTS (SELECT 1 FROM teams WHERE id = cox_technical_ratings.team_id AND coach_id = auth.uid())
  );

-- practice_videos: video attachments per practice session
CREATE TABLE IF NOT EXISTS practice_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES practice_entries(id) ON DELETE CASCADE NOT NULL,
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  uploaded_by uuid REFERENCES profiles(id),
  video_path text NOT NULL,
  video_url text,
  description text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE practice_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members view practice videos" ON practice_videos
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM team_members WHERE team_id = practice_videos.team_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM teams WHERE id = practice_videos.team_id AND coach_id = auth.uid())
  );
CREATE POLICY "Team members upload practice videos" ON practice_videos
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND (
      EXISTS (SELECT 1 FROM team_members WHERE team_id = practice_videos.team_id AND user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM teams WHERE id = practice_videos.team_id AND coach_id = auth.uid())
    )
  );
CREATE POLICY "Uploader or coach can delete video" ON practice_videos
  FOR DELETE USING (
    uploaded_by = auth.uid()
    OR EXISTS (SELECT 1 FROM teams WHERE id = practice_videos.team_id AND coach_id = auth.uid())
  );

-- wellness_checkins: athlete pre-practice check-in (coaches can read team data)
CREATE TABLE IF NOT EXISTS wellness_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  checkin_date date NOT NULL DEFAULT CURRENT_DATE,
  energy int CHECK (energy BETWEEN 1 AND 10),
  soreness int CHECK (soreness BETWEEN 1 AND 10),
  sleep_hours numeric,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, team_id, checkin_date)
);
ALTER TABLE wellness_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own wellness checkins" ON wellness_checkins
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Team members read wellness" ON wellness_checkins
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM teams WHERE id = wellness_checkins.team_id AND coach_id = auth.uid())
    OR EXISTS (SELECT 1 FROM team_members WHERE team_id = wellness_checkins.team_id AND user_id = auth.uid())
  );
