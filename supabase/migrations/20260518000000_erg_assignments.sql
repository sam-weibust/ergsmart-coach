-- Erg Assignment System

CREATE TABLE IF NOT EXISTS public.erg_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  coach_id uuid REFERENCES profiles(id) NOT NULL,
  title text NOT NULL,
  description text,
  pieces jsonb DEFAULT '[]'::jsonb,
  assigned_to jsonb DEFAULT '[]'::jsonb,
  scheduled_date date,
  deadline timestamptz,
  notes text,
  video_url text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.erg_assignment_pieces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid REFERENCES erg_assignments(id) ON DELETE CASCADE NOT NULL,
  piece_number integer NOT NULL,
  piece_type text NOT NULL,
  distance integer,
  duration_seconds integer,
  target_split_seconds integer,
  target_stroke_rate integer,
  rest_seconds integer,
  notes text
);

CREATE TABLE IF NOT EXISTS public.erg_assignment_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid REFERENCES erg_assignments(id) ON DELETE CASCADE NOT NULL,
  athlete_id uuid REFERENCES profiles(id) NOT NULL,
  status text DEFAULT 'pending',
  erg_score_id uuid REFERENCES erg_scores(id),
  manual_pieces jsonb,
  completion_notes text,
  logged_by_user_id uuid REFERENCES profiles(id),
  logged_by_role text,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(assignment_id, athlete_id)
);

CREATE TABLE IF NOT EXISTS public.erg_number_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid REFERENCES erg_assignments(id),
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  coach_id uuid REFERENCES profiles(id) NOT NULL,
  athlete_id uuid REFERENCES profiles(id) NOT NULL,
  erg_number text NOT NULL,
  date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.erg_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erg_assignment_pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erg_assignment_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erg_number_assignments ENABLE ROW LEVEL SECURITY;

-- erg_assignments RLS
CREATE POLICY "Coaches manage their team assignments"
  ON public.erg_assignments FOR ALL
  USING (team_id IN (SELECT id FROM teams WHERE coach_id = auth.uid()));

CREATE POLICY "Athletes view assignments assigned to them"
  ON public.erg_assignments FOR SELECT
  USING (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
    AND (
      assigned_to @> jsonb_build_array(auth.uid()::text)
      OR assigned_to @> '["team"]'::jsonb
      OR EXISTS (
        SELECT 1 FROM team_members tm
        JOIN boat_lineups bl ON bl.team_id = erg_assignments.team_id
        WHERE tm.user_id = auth.uid()
        AND assigned_to @> jsonb_build_array(bl.id::text)
        LIMIT 1
      )
    )
  );

-- erg_assignment_pieces RLS
CREATE POLICY "Coaches manage pieces for their team"
  ON public.erg_assignment_pieces FOR ALL
  USING (
    assignment_id IN (
      SELECT id FROM erg_assignments WHERE team_id IN (SELECT id FROM teams WHERE coach_id = auth.uid())
    )
  );

CREATE POLICY "Athletes view pieces for their assignments"
  ON public.erg_assignment_pieces FOR SELECT
  USING (
    assignment_id IN (SELECT id FROM erg_assignments)
  );

-- erg_assignment_results RLS
CREATE POLICY "Coaches view all results for their team"
  ON public.erg_assignment_results FOR ALL
  USING (
    assignment_id IN (
      SELECT id FROM erg_assignments WHERE team_id IN (SELECT id FROM teams WHERE coach_id = auth.uid())
    )
  );

CREATE POLICY "Athletes view only own results"
  ON public.erg_assignment_results FOR SELECT
  USING (athlete_id = auth.uid());

CREATE POLICY "Athletes insert own results"
  ON public.erg_assignment_results FOR INSERT
  WITH CHECK (athlete_id = auth.uid() AND logged_by_role = 'athlete');

CREATE POLICY "Athletes update own results"
  ON public.erg_assignment_results FOR UPDATE
  USING (athlete_id = auth.uid() AND logged_by_role = 'athlete');

CREATE POLICY "Coxswains log for boat athletes"
  ON public.erg_assignment_results FOR INSERT
  WITH CHECK (
    logged_by_role = 'coxswain'
    AND logged_by_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_coxswain = true
    )
  );

CREATE POLICY "Coxswains update results they logged"
  ON public.erg_assignment_results FOR UPDATE
  USING (
    logged_by_user_id = auth.uid()
    AND logged_by_role = 'coxswain'
  );

-- erg_number_assignments RLS
CREATE POLICY "Coaches manage erg numbers"
  ON public.erg_number_assignments FOR ALL
  USING (team_id IN (SELECT id FROM teams WHERE coach_id = auth.uid()));

CREATE POLICY "Athletes view their own erg number"
  ON public.erg_number_assignments FOR SELECT
  USING (athlete_id = auth.uid());

-- SECURITY DEFINER function: returns average split per piece number without exposing individual rows
CREATE OR REPLACE FUNCTION get_assignment_team_average(p_assignment_id uuid)
RETURNS TABLE(piece_number integer, avg_split_seconds numeric, completed_count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (piece->>'piece_number')::integer AS piece_number,
    AVG((piece->>'actual_split_seconds')::numeric) AS avg_split_seconds,
    COUNT(*) AS completed_count
  FROM erg_assignment_results r,
    jsonb_array_elements(r.manual_pieces) AS piece
  WHERE r.assignment_id = p_assignment_id
    AND r.status = 'completed'
    AND r.manual_pieces IS NOT NULL
    AND (piece->>'actual_split_seconds') IS NOT NULL
  GROUP BY (piece->>'piece_number')::integer
  ORDER BY piece_number;
$$;
