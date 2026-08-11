-- Fix: write-side integrity on the team/score tables, plus the anon recruiting
-- portal and the join-code error status.
--
-- Every write policy on these five tables was `auth.uid() IS NOT NULL`, i.e.
-- "any logged-in user". Concretely that meant any account could:
--   * INSERT an erg_scores row with is_verified = true AND to_leaderboard = true
--     and appear at the top of the GLOBAL leaderboard with a fabricated time;
--   * UPDATE or DELETE somebody else's erg score, including verified ones;
--   * write or delete rows on any team's board, on-water results, load logs and
--     recruitment targets, regardless of membership.
--
-- Two real write paths constrain the fix and must keep working:
--   1. ErgScoreManager (coach tool) inserts scores FOR AN ATHLETE:
--        user_id = <athlete>, created_by = <coach>, is_verified = false
--      so a naive `WITH CHECK (user_id = auth.uid())` would break coach entry.
--   2. LiveErgView writes is_verified = true from the CLIENT at the end of a
--      PM5 session. That is the only legitimate client-side verified write, so
--      it moves to submit_verified_erg_score() below and the table itself stops
--      accepting is_verified = true from anyone but the service role.

-- ── erg_scores ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Team members can insert erg_scores" ON erg_scores;
DROP POLICY IF EXISTS "Team members can update erg_scores" ON erg_scores;
DROP POLICY IF EXISTS "Team members can delete erg_scores" ON erg_scores;

-- Own score, or a coach entering one for an athlete on their team. Verified is
-- never settable through the table: `is_verified IS NOT TRUE` covers both false
-- and NULL, so omitting the column entirely is still fine.
CREATE POLICY "erg_scores_insert_own_or_coach" ON erg_scores
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid() OR is_team_coach(auth.uid(), team_id))
    AND is_verified IS NOT TRUE
  );

-- USING also requires the EXISTING row to be unverified: a verified result is
-- immutable from the client, so it cannot be edited down to an unverified row
-- and then rewritten.
CREATE POLICY "erg_scores_update_own_or_coach_unverified" ON erg_scores
  FOR UPDATE TO authenticated
  USING (
    (user_id = auth.uid() OR is_team_coach(auth.uid(), team_id))
    AND is_verified IS NOT TRUE
  )
  WITH CHECK (
    (user_id = auth.uid() OR is_team_coach(auth.uid(), team_id))
    AND is_verified IS NOT TRUE
  );

CREATE POLICY "erg_scores_delete_own_or_coach_unverified" ON erg_scores
  FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() OR is_team_coach(auth.uid(), team_id))
    AND is_verified IS NOT TRUE
  );

-- The one sanctioned client path to a verified score. Rather than trusting
-- numbers off the wire, it derives them from an erg_workouts row the caller
-- already owns, so a verified score cannot exist without a logged session.
--
-- This raises the bar; it is NOT cryptographic attestation. The PM5 does not
-- sign its output, so a determined user can still fabricate an erg_workouts row
-- and promote it. Closing that properly needs device-signed data upstream.
CREATE OR REPLACE FUNCTION public.submit_verified_erg_score(
  p_workout_id uuid,
  p_test_type  text
)
RETURNS TABLE (score_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_w       erg_workouts%ROWTYPE;
  v_weight  numeric;
  v_time    integer;
  v_split   numeric;
  v_wkg     numeric;
  v_id      uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to submit a score'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_test_type NOT IN ('2k', '5k', '6k', '10k', '60min') THEN
    RAISE EXCEPTION 'Unsupported test type %', p_test_type USING ERRCODE = 'check_violation';
  END IF;

  -- SECURITY DEFINER bypasses RLS, so authorize explicitly: the session must
  -- exist and belong to the caller.
  SELECT * INTO v_w FROM erg_workouts w
   WHERE w.id = p_workout_id AND w.user_id = v_user_id;

  IF v_w.id IS NULL THEN
    RAISE EXCEPTION 'Workout not found' USING ERRCODE = 'PT404';
  END IF;

  -- One verified score per logged session.
  SELECT s.id INTO v_id FROM erg_scores s
   WHERE s.user_id = v_user_id
     AND s.source = 'live_erg'
     AND s.test_type = p_test_type
     AND s.time_seconds IS NOT DISTINCT FROM v_w.elapsed_time;
  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id;
    RETURN;
  END IF;

  SELECT p.weight_kg INTO v_weight FROM profiles p WHERE p.id = v_user_id;

  v_time  := CASE WHEN p_test_type = '60min' THEN NULL ELSE v_w.elapsed_time END;
  v_split := CASE
               WHEN v_w.distance > 0 AND v_w.elapsed_time > 0
                 THEN (v_w.elapsed_time::numeric / v_w.distance) * 500
               ELSE NULL
             END;
  v_wkg   := CASE
               WHEN v_w.avg_watts IS NOT NULL AND v_weight > 0
                 THEN v_w.avg_watts / v_weight
               ELSE NULL
             END;

  INSERT INTO erg_scores (
    user_id, test_type, time_seconds, total_meters, avg_split_seconds,
    watts, watts_per_kg, source, is_verified, to_leaderboard
  ) VALUES (
    v_user_id, p_test_type, v_time,
    CASE WHEN p_test_type = '60min' THEN v_w.distance ELSE NULL END,
    v_split, v_w.avg_watts, v_wkg, 'live_erg', true, true
  )
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_verified_erg_score(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_verified_erg_score(uuid, text) TO authenticated;

-- ── onwater_results ─────────────────────────────────────────────────────────
-- No user_id column — this is a coach-managed team log (created_by/logged_by/
-- athlete_ids), so ownership is team coach, matching the policy's own name.
DROP POLICY IF EXISTS "Coaches can manage onwater_results" ON onwater_results;

CREATE POLICY "onwater_results_write_team_coach" ON onwater_results
  FOR ALL TO authenticated
  USING (is_team_coach(auth.uid(), team_id))
  WITH CHECK (is_team_coach(auth.uid(), team_id));

-- ── team_board_posts ────────────────────────────────────────────────────────
-- Authorship column is author_id, not user_id.
DROP POLICY IF EXISTS "Team members can insert team_board_posts" ON team_board_posts;
DROP POLICY IF EXISTS "Authors can update own posts" ON team_board_posts;
DROP POLICY IF EXISTS "Authors can delete own posts" ON team_board_posts;

CREATE POLICY "team_board_posts_insert_member_as_self" ON team_board_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (is_team_member(auth.uid(), team_id) OR is_team_coach(auth.uid(), team_id))
  );

CREATE POLICY "team_board_posts_update_author" ON team_board_posts
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- Coaches keep delete so they can moderate their own team's board; the previous
-- policy was named "Authors can delete own posts" but let anyone delete anything.
CREATE POLICY "team_board_posts_delete_author_or_coach" ON team_board_posts
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR is_team_coach(auth.uid(), team_id));

-- ── weekly_load_logs ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can manage own load logs" ON weekly_load_logs;

CREATE POLICY "weekly_load_logs_write_own" ON weekly_load_logs
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── team_recruitment_targets ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Coaches can manage recruitment_targets" ON team_recruitment_targets;

CREATE POLICY "team_recruitment_targets_write_team_coach" ON team_recruitment_targets
  FOR ALL TO authenticated
  USING (is_team_coach(auth.uid(), team_id))
  WITH CHECK (is_team_coach(auth.uid(), team_id));

-- ── Public recruiting portal ────────────────────────────────────────────────
-- /recruit/:slug is a public page but read team_members directly, whose SELECT
-- policy is `user_id = auth.uid() OR is_team_coach(...)`. An anonymous visitor
-- therefore got zero members, zero opted-in athletes, and the portal always
-- rendered "No athletes have opted in to this recruiting portal yet."
--
-- Exposing team_members to anon is not acceptable (it would leak every roster),
-- so the portal reads through this function instead. It returns ONLY athletes
-- who set both opt-ins, and ONLY for a team whose portal is public.
CREATE OR REPLACE FUNCTION public.get_recruiting_portal(p_slug text)
RETURNS TABLE (
  id             uuid,
  full_name      text,
  username       text,
  height         numeric,
  weight         numeric,
  age            integer,
  best_2k_seconds numeric,
  best_6k_seconds numeric,
  gpa            numeric,
  class_rank_numerator   integer,
  class_rank_denominator integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.id, p.full_name, p.username, p.height, p.weight, p.age,
    p.best_2k_seconds, p.best_6k_seconds,
    aa.gpa, aa.class_rank_numerator, aa.class_rank_denominator
  FROM teams t
  JOIN team_members tm     ON tm.team_id = t.id
  JOIN athlete_profiles ap ON ap.user_id = tm.user_id
  JOIN profiles p          ON p.id       = tm.user_id
  LEFT JOIN athlete_academics aa ON aa.user_id = tm.user_id
  WHERE t.slug = p_slug
    AND t.portal_public = true
    AND ap.show_on_team_portal = true
    AND ap.is_recruiting = true;
$$;

-- Public page: anon must be able to call it. The function body is the access
-- control — it only ever emits opted-in athletes on a public portal.
GRANT EXECUTE ON FUNCTION public.get_recruiting_portal(text) TO anon, authenticated;

-- ── join_team_by_code: 404 instead of 500 for a bad code ────────────────────
-- PostgREST maps the SQLSTATE class of a raised exception to an HTTP status,
-- and no_data_found (P0002) lands on 500 — so a user simply mistyping their
-- join code logged a server error. PostgREST honours SQLSTATE codes of the form
-- PTxxx as an explicit HTTP status, so PT404 returns a clean 404 with the same
-- message. Unchanged otherwise; the client already surfaces error.message.
CREATE OR REPLACE FUNCTION public.join_team_by_code(p_code text)
RETURNS TABLE (team_id uuid, team_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_team_id uuid;
  v_team_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to join a team'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT t.id, t.name
    INTO v_team_id, v_team_name
    FROM teams t
   WHERE lower(btrim(t.join_code)) = lower(btrim(p_code))
   LIMIT 1;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'No team found with that code' USING ERRCODE = 'PT404';
  END IF;

  IF is_team_member(v_user_id, v_team_id) THEN
    RAISE EXCEPTION 'You are already on this team' USING ERRCODE = 'unique_violation';
  END IF;

  BEGIN
    INSERT INTO team_members (team_id, user_id) VALUES (v_team_id, v_user_id);
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'You are already on this team' USING ERRCODE = 'unique_violation';
  END;

  RETURN QUERY SELECT v_team_id, v_team_name;
END;
$$;

REVOKE ALL ON FUNCTION public.join_team_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_team_by_code(text) TO authenticated;
