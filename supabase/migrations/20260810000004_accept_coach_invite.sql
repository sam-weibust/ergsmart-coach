-- Fix: accepting a coach invite was impossible for the person being invited.
--
-- The client (src/pages/Dashboard.tsx) did: SELECT coach_invites BY token ->
-- SELECT profiles.email -> INSERT team_coaches -> UPDATE coach_invites.accepted_at.
-- The INSERT is the dead end. The team_coaches_insert policy is:
--   team_id IN (SELECT id FROM teams WHERE coach_id = auth.uid())
--   OR team_id IN (SELECT team_id FROM team_coaches
--                   WHERE user_id = auth.uid() AND role = 'head_coach')
-- i.e. only someone who is ALREADY head coach of that team may insert a row for
-- it. The invitee is by definition not on the team yet, so their self-insert is
-- always rejected (42501 new row violates row-level security policy). The client
-- then swallows the error via `if (!error)`, so the invite is never marked
-- accepted either and the link silently does nothing, forever.
--
-- Doing the whole handshake inside one SECURITY DEFINER function lets the
-- invitee enroll themselves off a valid, unexpired, unclaimed token without
-- widening team_coaches_insert (which would let any authenticated user staff
-- themselves onto any team).
--
-- One deliberate change from the client flow: the caller's email is read from
-- auth.users, not profiles. profiles.email is user-writable, so under SECURITY
-- DEFINER trusting it would let anyone claim any invite by editing their own
-- profile row to the invited address. auth.users is the authoritative copy.

CREATE OR REPLACE FUNCTION public.accept_coach_invite(p_token text)
RETURNS TABLE (team_id uuid, team_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_invite coach_invites%ROWTYPE;
  v_team_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to accept a coach invite'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Exact token match only (no ILIKE/pattern matching): the token is the
  -- credential, and it must still be unclaimed and unexpired. Mirrors the
  -- client's .eq(token) / .is(accepted_at, null) / .gt(expires_at, now).
  SELECT * INTO v_invite
    FROM coach_invites ci
   WHERE ci.token = p_token
     AND ci.accepted_at IS NULL
     AND ci.expires_at > now()
   LIMIT 1;

  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'Invite not found, already accepted, or expired'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- SECURITY DEFINER bypasses RLS, so authorize explicitly. Holding the token is
  -- not sufficient; the signed-in account must own the invited address, or a
  -- leaked/forwarded link would let any authenticated user take the seat.
  SELECT u.email INTO v_user_email FROM auth.users u WHERE u.id = v_user_id;

  IF v_user_email IS NULL
     OR lower(btrim(v_user_email)) <> lower(btrim(v_invite.email)) THEN
    RAISE EXCEPTION 'This invite was issued to a different email address'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Idempotent: an invitee who is somehow already on the staff (re-clicked link,
  -- added manually by the head coach in the meantime) should still get the
  -- invite closed out and a success result, not a raw 23505 from
  -- team_coaches UNIQUE (team_id, user_id). Checked with NOT EXISTS rather than
  -- ON CONFLICT (team_id, user_id) because that inference list would resolve
  -- against this function's `team_id` OUT parameter and error as ambiguous.
  IF NOT EXISTS (
    SELECT 1 FROM team_coaches tc
     WHERE tc.team_id = v_invite.team_id
       AND tc.user_id = v_user_id
  ) THEN
    BEGIN
      INSERT INTO team_coaches (team_id, user_id, role, invited_by, joined_at)
      VALUES (v_invite.team_id, v_user_id, v_invite.role, v_invite.invited_by, now());
    EXCEPTION
      -- Two tabs opening the same link can race past the NOT EXISTS above;
      -- the row we wanted now exists either way, so this is still success.
      WHEN unique_violation THEN NULL;
    END;
  END IF;

  UPDATE coach_invites ci
     SET accepted_at = now()
   WHERE ci.id = v_invite.id;

  SELECT t.name INTO v_team_name FROM teams t WHERE t.id = v_invite.team_id;

  RETURN QUERY SELECT v_invite.team_id, v_team_name;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_coach_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_coach_invite(text) TO authenticated;
