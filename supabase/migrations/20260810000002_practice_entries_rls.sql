-- Fix 2: close the cross-team write hole on practice_entries.
--
-- practice_entries shipped with `WITH CHECK (true)` on the coxswain INSERT
-- policy and `USING (true)` on the coxswain UPDATE policy, both granted to
-- role `public`, which meant ANY authenticated user could write rows into ANY
-- team — verified live: a plain athlete INSERTed a practice_entries row into a
-- team they were not a member of (HTTP 201, row confirmed written).
--
-- The UPDATE hole is only masked today because PostgREST has to find the row
-- through the SELECT policy first; a coxswain of team A could still have
-- rewritten (and re-parented) rows of team A that they should not own, and any
-- widening of the SELECT policy would immediately expose it.
--
-- Replaced with team-scoped policies:
--   INSERT  team coach OR coxswain who is a member of that team
--   UPDATE  same predicate, in BOTH USING and WITH CHECK
--
-- Left untouched: "Members view practice entries" (SELECT), "Coaches manage
-- practice entries" (ALL) and "Team members update practice entries" (UPDATE).

-- ── practice_entries ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Coxswains insert practice entries" ON practice_entries;
DROP POLICY IF EXISTS "Coxswains update practice entries" ON practice_entries;

-- team_members has no role column — coxswain status lives on profiles, which
-- carries three overlapping markers (is_coxswain from the original attendance
-- work, plus role/user_type from the later role system). Accept any of them so
-- accounts that only ever got one of the three flags set keep working. The
-- inline profiles EXISTS is safe inside a policy: "Users can view own profile"
-- already lets a caller read their own row, and this only ever reads
-- auth.uid()'s row. Membership itself goes through the SECURITY DEFINER
-- helpers so this does not recurse into team_members/teams RLS.
CREATE POLICY "Coxswains insert practice entries" ON practice_entries
  FOR INSERT WITH CHECK (
    is_team_coach(auth.uid(), team_id)
    OR (
      is_team_member(auth.uid(), team_id)
      AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
          AND (
            profiles.is_coxswain = true
            OR profiles.role = 'coxswain'
            OR profiles.user_type = 'coxswain'
          )
      )
    )
  );

-- USING and WITH CHECK are both spelled out on purpose. A NULL WITH CHECK
-- falls back to USING, which reads as equivalent but is easy to get wrong on a
-- later edit — and without an explicit WITH CHECK on the *new* row, a coxswain
-- could UPDATE a row they legitimately see and move it to another team_id.
CREATE POLICY "Coxswains update practice entries" ON practice_entries
  FOR UPDATE USING (
    is_team_coach(auth.uid(), team_id)
    OR (
      is_team_member(auth.uid(), team_id)
      AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
          AND (
            profiles.is_coxswain = true
            OR profiles.role = 'coxswain'
            OR profiles.user_type = 'coxswain'
          )
      )
    )
  )
  WITH CHECK (
    is_team_coach(auth.uid(), team_id)
    OR (
      is_team_member(auth.uid(), team_id)
      AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
          AND (
            profiles.is_coxswain = true
            OR profiles.role = 'coxswain'
            OR profiles.user_type = 'coxswain'
          )
      )
    )
  );

-- ── Sibling policy hardening ────────────────────────────────────────────────
-- "Team members update practice entries" is a separate PERMISSIVE UPDATE policy
-- that survives the two drops above. Its predicate is correctly team-scoped, but
-- its WITH CHECK is NULL, which makes Postgres fall back to the USING expression
-- for the new row. That reads as equivalent and is not — a member of teams A and
-- B could UPDATE one of team A's rows and set team_id = B, because the new row
-- still satisfies USING. Spell WITH CHECK out so the row cannot be re-parented.
DROP POLICY IF EXISTS "Team members update practice entries" ON practice_entries;

CREATE POLICY "Team members update practice entries" ON practice_entries
  FOR UPDATE USING (
    is_team_member(auth.uid(), team_id) OR is_team_coach(auth.uid(), team_id)
  )
  WITH CHECK (
    is_team_member(auth.uid(), team_id) OR is_team_coach(auth.uid(), team_id)
  );
