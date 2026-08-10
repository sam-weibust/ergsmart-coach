-- Fix: team_coaches writes are 100% broken with 42P17 infinite recursion.
--
-- team_coaches_insert / _update / _delete all share this predicate:
--   team_id IN (SELECT id FROM teams WHERE coach_id = auth.uid())
--   OR team_id IN (SELECT team_id FROM team_coaches
--                  WHERE user_id = auth.uid() AND role = 'head_coach')
-- The second branch subqueries team_coaches from inside a team_coaches policy.
-- Postgres re-applies the policy to that inner scan, which re-enters the same
-- subquery, and the planner aborts:
--   ERROR 42P17 infinite recursion detected in policy for relation "team_coaches"
-- Verified live: every INSERT/UPDATE/DELETE on team_coaches returns HTTP 500,
-- including the legitimate case of a head coach adding an assistant, so
-- multi-coach staff management is entirely non-functional.
--
-- Fix: move the head-coach test into a SECURITY DEFINER helper. Reads from
-- inside a SECURITY DEFINER function do not re-enter the caller's policies, so
-- the self-reference stops being a cycle.
--
-- Deliberately NOT reusing/redefining is_team_coach: 23 policies across 8 other
-- tables (attendance, boat_lineups, practice_entry_drafts, race_lineups,
-- seat_races, team_goals, team_members, team_messages) depend on it matching
-- ANY coach role. Narrowing it to head coaches would silently strip assistant
-- coaches of access app-wide. This is a separate, stricter predicate.

-- True when the user owns the team outright (teams.coach_id) or holds a
-- team_coaches row with role = 'head_coach'. Same intent as the original
-- policy text, just evaluated where RLS cannot recurse.
CREATE OR REPLACE FUNCTION public.is_team_head_coach(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teams
    WHERE id = _team_id AND coach_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.team_coaches
    WHERE team_id = _team_id
      AND user_id = _user_id
      AND role = 'head_coach'
  )
$$;

REVOKE ALL ON FUNCTION public.is_team_head_coach(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_team_head_coach(uuid, uuid) TO authenticated;

-- ── team_coaches write policies ─────────────────────────────────────────────
-- team_coaches_select is intentionally left alone: it already routes through
-- the SECURITY DEFINER helper get_user_coached_team_ids() and does not recurse.

DROP POLICY IF EXISTS "team_coaches_insert" ON team_coaches;
CREATE POLICY "team_coaches_insert"
  ON team_coaches FOR INSERT
  WITH CHECK (is_team_head_coach(auth.uid(), team_id));

-- USING gates which existing rows may be touched, WITH CHECK gates the result.
-- Both are set explicitly so a head coach cannot move a staff row to a team
-- they do not run by updating team_id.
DROP POLICY IF EXISTS "team_coaches_update" ON team_coaches;
CREATE POLICY "team_coaches_update"
  ON team_coaches FOR UPDATE
  USING (is_team_head_coach(auth.uid(), team_id))
  WITH CHECK (is_team_head_coach(auth.uid(), team_id));

DROP POLICY IF EXISTS "team_coaches_delete" ON team_coaches;
CREATE POLICY "team_coaches_delete"
  ON team_coaches FOR DELETE
  USING (is_team_head_coach(auth.uid(), team_id));
