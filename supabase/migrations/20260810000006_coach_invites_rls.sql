-- Fix: close the wide-open read/write hole on coach_invites.
--
-- coach_invites shipped with `USING (true)` for SELECT and
-- `USING (true) WITH CHECK (true)` for UPDATE, both granted to the `public`
-- role — so they applied to `anon` as well. Verified live with nothing but the
-- anon key and no login: an unauthenticated client read every row of
-- public.coach_invites (including the secret `token` and the invitee `email`)
-- and then rewrote a row's email to an attacker-controlled address (HTTP 204,
-- change confirmed in the DB). That is a full team takeover: point a pending
-- head-coach invite at your own address, or just read the token straight out
-- of the table and accept someone else's invite.
--
-- Replaced with:
--   SELECT  authenticated invitee (the email on their session matches the
--           invite, case-insensitively) OR a coach of THAT team
--   UPDATE  a coach of THAT team, with USING and WITH CHECK both set so a row
--           cannot be dragged across into another team
--
-- INSERT and DELETE are already correctly scoped to the head coach of the
-- team; they are deliberately left untouched.
--
-- The invitee intentionally gets no UPDATE. Accepting an invite goes through a
-- SECURITY DEFINER RPC, not a direct table write, so the invitee never needs
-- to stamp accepted_at themselves.
--
-- Both policies are granted `TO authenticated`, so `anon` no longer matches any
-- SELECT or UPDATE policy on this table at all and is denied by default.

ALTER TABLE public.coach_invites ENABLE ROW LEVEL SECURITY;

-- ── SELECT ──────────────────────────────────────────────────────────────────
-- is_team_coach (SECURITY DEFINER, defined in 20260809000001) checks both
-- teams.coach_id and team_coaches membership, and — critically — it is
-- correlated to coach_invites.team_id. An uncorrelated predicate such as
-- `EXISTS (SELECT 1 FROM teams WHERE coach_id = auth.uid())` would only ask
-- "is this user a coach of anything?" and would hand every coach every other
-- team's invite tokens.
--
-- The invitee side uses auth.email() (the email claim off the request JWT)
-- rather than `(SELECT email FROM auth.users WHERE id = auth.uid())`. RLS
-- policy expressions are evaluated with the privileges of the querying role,
-- and `authenticated` has no SELECT grant on auth.users — a direct reference
-- would fail the whole query with "permission denied for table users", for
-- coaches as well as invitees, since table permissions are checked at executor
-- start and are not short-circuited by the OR. auth.email() is a platform
-- helper that only reads JWT claims, so it needs no table privileges. If the
-- claim is missing it returns NULL, the comparison yields NULL, and the policy
-- fails closed rather than open. lower() is applied to both sides so the match
-- is case-insensitive, matching how the app compares invite emails.
DROP POLICY IF EXISTS "coach_invites_select" ON public.coach_invites;

CREATE POLICY "coach_invites_select_invitee_or_team_coach" ON public.coach_invites
  FOR SELECT TO authenticated
  USING (
    lower(coach_invites.email) = lower(auth.email())
    OR public.is_team_coach(auth.uid(), coach_invites.team_id)
  );

-- ── UPDATE ──────────────────────────────────────────────────────────────────
-- WITH CHECK repeats the same correlated predicate against the NEW row, so a
-- coach cannot edit an invite and simultaneously reassign it to a team they do
-- not coach.
DROP POLICY IF EXISTS "coach_invites_update" ON public.coach_invites;

CREATE POLICY "coach_invites_update_team_coach" ON public.coach_invites
  FOR UPDATE TO authenticated
  USING (public.is_team_coach(auth.uid(), coach_invites.team_id))
  WITH CHECK (public.is_team_coach(auth.uid(), coach_invites.team_id));
