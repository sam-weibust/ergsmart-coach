-- Fix: joining a team by code was impossible for the athlete doing the joining.
--
-- The client did: SELECT teams WHERE join_code ILIKE <code> -> INSERT team_members.
-- Both halves are blocked by RLS for a prospective member:
--   * teams SELECT policy is `auth.uid() = coach_id OR is_team_member(auth.uid(), id)`,
--     so someone who is not yet on the team reads back 0 rows and the UI reports
--     "No team found with that code" even when the code is correct.
--   * team_members INSERT policy requires is_team_coach(...), so even with the team
--     id in hand an athlete cannot add themselves (42501 new row violates RLS).
-- Net effect: only a coach could ever join a team, which defeats the join code.
--
-- Doing the lookup + insert inside one SECURITY DEFINER function lets an athlete
-- self-enroll with a valid code without widening the SELECT policy on teams (which
-- would expose every team's roster surface) or the INSERT policy on team_members.

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
  -- SECURITY DEFINER bypasses RLS, so authorize explicitly. The join code is the
  -- only credential here, so the one thing we must insist on is a real caller:
  -- without this an anon key could enroll arbitrary user_ids by guessing codes.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to join a team'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Case-insensitive + trimmed, matching the old client `.ilike(join_code, trimmed)`
  -- but with lower()/btrim() so that % and _ in user input stay literal.
  SELECT t.id, t.name
    INTO v_team_id, v_team_name
    FROM teams t
   WHERE lower(btrim(t.join_code)) = lower(btrim(p_code))
   LIMIT 1;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'No team found with that code' USING ERRCODE = 'no_data_found';
  END IF;

  IF is_team_member(v_user_id, v_team_id) THEN
    RAISE EXCEPTION 'You are already on this team' USING ERRCODE = 'unique_violation';
  END IF;

  BEGIN
    INSERT INTO team_members (team_id, user_id) VALUES (v_team_id, v_user_id);
  EXCEPTION
    -- Two taps on the join button can race past the is_team_member check above;
    -- collapse the raw constraint error into the same friendly message.
    WHEN unique_violation THEN
      RAISE EXCEPTION 'You are already on this team' USING ERRCODE = 'unique_violation';
  END;

  RETURN QUERY SELECT v_team_id, v_team_name;
END;
$$;

REVOKE ALL ON FUNCTION public.join_team_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_team_by_code(text) TO authenticated;
