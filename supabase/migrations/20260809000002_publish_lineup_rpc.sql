-- Fix 5: make lineup publish atomic.
--
-- The client did: UPDATE boat_lineups -> DELETE practice_attendance -> INSERT.
-- practice_attendance has INSERT/SELECT/UPDATE policies but NO DELETE policy,
-- so the DELETE was silently filtered to 0 rows (RLS deletes raise no error).
-- The follow-up INSERT then collided with UNIQUE (lineup_id, user_id):
--   pass1 -> 9 rows inserted
--   pass2 -> ERROR 23505 duplicate key ... practice_attendance_lineup_id_user_id_key
-- i.e. first publish worked, every re-publish threw.
--
-- Doing the delete+insert inside one SECURITY DEFINER function fixes both the
-- missing-DELETE-policy problem and the non-atomicity in a single round trip.

CREATE OR REPLACE FUNCTION public.publish_lineup(p_lineup_id uuid, p_seats jsonb)
RETURNS TABLE (lineup_id uuid, published_at timestamptz, attendance_rows integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_team_id uuid;
  v_published_at timestamptz := now();
  v_rows integer;
BEGIN
  -- SECURITY DEFINER bypasses RLS, so authorize explicitly. Without this any
  -- authenticated user could publish (and rewrite attendance for) any lineup.
  SELECT team_id INTO v_team_id FROM boat_lineups WHERE id = p_lineup_id;
  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Lineup % not found', p_lineup_id USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT is_team_coach(auth.uid(), v_team_id) THEN
    RAISE EXCEPTION 'Only a coach of this team may publish its lineups'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE boat_lineups
     SET seats        = COALESCE(p_seats, seats),
         published_at = v_published_at,
         status       = 'final',
         updated_at   = v_published_at
   WHERE id = p_lineup_id;

  -- Rewrite attendance for this lineup: clear then re-seed one row per distinct
  -- athlete. DISTINCT matters because the same user_id can legitimately appear
  -- in more than one seat while a coach is mid-edit.
  DELETE FROM practice_attendance WHERE practice_attendance.lineup_id = p_lineup_id;

  INSERT INTO practice_attendance (lineup_id, user_id, status)
  SELECT DISTINCT p_lineup_id, (seat ->> 'user_id')::uuid, 'no_response'
    FROM jsonb_array_elements(COALESCE(p_seats, '[]'::jsonb)) AS seat
   WHERE NULLIF(seat ->> 'user_id', '') IS NOT NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN QUERY SELECT p_lineup_id, v_published_at, v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_lineup(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_lineup(uuid, jsonb) TO authenticated;
