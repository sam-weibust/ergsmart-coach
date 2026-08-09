-- Fix 1: close the cross-team write hole on boat_lineups, race_lineups, seat_races.
--
-- These three tables shipped with `USING (auth.uid() IS NOT NULL)` for the coach
-- policy and `USING (true)` for the view policy, which meant ANY authenticated
-- user could read, rename or delete ANY team's lineups and seat races — verified
-- live: a plain athlete updated another team's lineup and deleted a lineup
-- belonging to a team they were not a member of.
--
-- Replaced with team-scoped policies:
--   SELECT  team member OR team coach
--   INSERT  team coach
--   UPDATE  team coach
--   DELETE  team coach

-- is_team_coach previously only checked teams.coach_id. team_coaches is the
-- newer multi-coach table (currently empty, so this is additive, not a
-- behaviour change today) — cover both so assistant coaches work once it is
-- populated. SECURITY DEFINER + pinned search_path keeps this usable inside
-- policies without tripping RLS recursion on teams.
CREATE OR REPLACE FUNCTION public.is_team_coach(_user_id uuid, _team_id uuid)
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
    WHERE team_id = _team_id AND user_id = _user_id
  )
$$;

-- ── boat_lineups ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Coaches can manage boat_lineups" ON boat_lineups;
DROP POLICY IF EXISTS "Team members can view boat_lineups" ON boat_lineups;

CREATE POLICY "boat_lineups_select_team" ON boat_lineups
  FOR SELECT USING (
    is_team_member(auth.uid(), team_id) OR is_team_coach(auth.uid(), team_id)
  );
CREATE POLICY "boat_lineups_insert_coach" ON boat_lineups
  FOR INSERT WITH CHECK (is_team_coach(auth.uid(), team_id));
CREATE POLICY "boat_lineups_update_coach" ON boat_lineups
  FOR UPDATE USING (is_team_coach(auth.uid(), team_id))
              WITH CHECK (is_team_coach(auth.uid(), team_id));
CREATE POLICY "boat_lineups_delete_coach" ON boat_lineups
  FOR DELETE USING (is_team_coach(auth.uid(), team_id));

-- ── race_lineups ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Coaches can manage race_lineups" ON race_lineups;
DROP POLICY IF EXISTS "Team members can view race_lineups" ON race_lineups;

CREATE POLICY "race_lineups_select_team" ON race_lineups
  FOR SELECT USING (
    is_team_member(auth.uid(), team_id) OR is_team_coach(auth.uid(), team_id)
  );
CREATE POLICY "race_lineups_insert_coach" ON race_lineups
  FOR INSERT WITH CHECK (is_team_coach(auth.uid(), team_id));
CREATE POLICY "race_lineups_update_coach" ON race_lineups
  FOR UPDATE USING (is_team_coach(auth.uid(), team_id))
              WITH CHECK (is_team_coach(auth.uid(), team_id));
CREATE POLICY "race_lineups_delete_coach" ON race_lineups
  FOR DELETE USING (is_team_coach(auth.uid(), team_id));

-- ── seat_races ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Coaches can manage seat_races" ON seat_races;
DROP POLICY IF EXISTS "Team members can view seat_races" ON seat_races;

CREATE POLICY "seat_races_select_team" ON seat_races
  FOR SELECT USING (
    is_team_member(auth.uid(), team_id) OR is_team_coach(auth.uid(), team_id)
  );
CREATE POLICY "seat_races_insert_coach" ON seat_races
  FOR INSERT WITH CHECK (is_team_coach(auth.uid(), team_id));
CREATE POLICY "seat_races_update_coach" ON seat_races
  FOR UPDATE USING (is_team_coach(auth.uid(), team_id))
              WITH CHECK (is_team_coach(auth.uid(), team_id));
CREATE POLICY "seat_races_delete_coach" ON seat_races
  FOR DELETE USING (is_team_coach(auth.uid(), team_id));
