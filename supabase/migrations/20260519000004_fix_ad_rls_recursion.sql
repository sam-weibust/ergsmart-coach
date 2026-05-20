-- ── Fix infinite RLS recursion introduced by 20260519000002_athletic_director ──
--
-- Circular chain:
--   teams.tad_team_select        → SELECT FROM team_athletic_directors
--   team_athletic_directors.*    → SELECT FROM teams (and team_coaches)
--   team_members.tad_team_members_select → SELECT FROM team_athletic_directors
--   profiles."Coaches can view team member profiles" → teams → team_athletic_directors → teams
--
-- Fix: SECURITY DEFINER functions bypass RLS on the referenced table, breaking
-- every circular arc in the chain.

-- ── 1. SECURITY DEFINER functions ────────────────────────────────────────────

-- Returns team IDs where the current user is an accepted AD.
-- Queries team_athletic_directors WITHOUT going through its RLS.
CREATE OR REPLACE FUNCTION get_user_ad_teams()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id
  FROM team_athletic_directors
  WHERE user_id = auth.uid() AND status = 'accepted'
$$;

-- ── 2. Fix team_athletic_directors policies ────────────────────────────────────
-- These policies reference `teams` and `team_coaches`, which now reference back
-- → circular. Replace team references with get_user_coached_team_ids() (already
-- a SECURITY DEFINER from 20260504000002).

DROP POLICY IF EXISTS "tad_select"  ON team_athletic_directors;
DROP POLICY IF EXISTS "tad_insert"  ON team_athletic_directors;
DROP POLICY IF EXISTS "tad_update"  ON team_athletic_directors;
DROP POLICY IF EXISTS "tad_delete"  ON team_athletic_directors;

CREATE POLICY "tad_select" ON team_athletic_directors FOR SELECT USING (
  user_id = auth.uid()
  OR team_id IN (SELECT get_user_coached_team_ids())
);

CREATE POLICY "tad_insert" ON team_athletic_directors FOR INSERT WITH CHECK (
  team_id IN (SELECT get_user_coached_team_ids())
);

CREATE POLICY "tad_update" ON team_athletic_directors FOR UPDATE
  USING (true) WITH CHECK (true);

CREATE POLICY "tad_delete" ON team_athletic_directors FOR DELETE USING (
  team_id IN (SELECT get_user_coached_team_ids())
);

-- ── 3. Fix teams.tad_team_select ──────────────────────────────────────────────
-- Was: id IN (SELECT team_id FROM team_athletic_directors WHERE …)
-- → triggers tad_select which queries teams → circular.
-- Fix: use get_user_ad_teams() which bypasses RLS on team_athletic_directors.

DROP POLICY IF EXISTS "tad_team_select" ON teams;
CREATE POLICY "tad_team_select" ON teams FOR SELECT USING (
  id IN (SELECT get_user_ad_teams())
);

-- ── 4. Fix team_members.tad_team_members_select ───────────────────────────────
DROP POLICY IF EXISTS "tad_team_members_select" ON team_members;
CREATE POLICY "tad_team_members_select" ON team_members FOR SELECT USING (
  team_id IN (SELECT get_user_ad_teams())
);

-- ── 5. Fix erg_workouts.tad_erg_workouts_select ───────────────────────────────
-- The original joins through team_athletic_directors which now has safe policies,
-- but the subquery still hits team_members (which may chain back). Rewrite to use
-- the SECURITY DEFINER function to keep it clean.
DROP POLICY IF EXISTS "tad_erg_workouts_select" ON erg_workouts;
CREATE POLICY "tad_erg_workouts_select" ON erg_workouts FOR SELECT USING (
  user_id IN (
    SELECT tm.user_id
    FROM team_members tm
    WHERE tm.team_id IN (SELECT get_user_ad_teams())
  )
);

-- ── 6. Fix org_announcements policies ─────────────────────────────────────────
-- These reference team_athletic_directors inline — now safe because tad_select
-- no longer recurses. But also swap to use the function for clarity & safety.
DROP POLICY IF EXISTS "org_announcements_select" ON org_announcements;
CREATE POLICY "org_announcements_select" ON org_announcements FOR SELECT USING (
  org_id IN (SELECT organization_id FROM organization_admins WHERE user_id = auth.uid())
  OR org_id IN (SELECT id FROM organizations WHERE created_by = auth.uid())
  OR org_id IN (
    SELECT ot.organization_id FROM organization_teams ot
    WHERE ot.team_id IN (SELECT get_user_coached_team_ids())
       OR ot.team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  )
  OR team_id IN (SELECT get_user_ad_teams())
  OR team_id IN (SELECT get_user_coached_team_ids())
  OR team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "org_announcements_insert" ON org_announcements;
CREATE POLICY "org_announcements_insert" ON org_announcements FOR INSERT WITH CHECK (
  posted_by = auth.uid() AND (
    org_id IN (SELECT organization_id FROM organization_admins WHERE user_id = auth.uid())
    OR org_id IN (SELECT id FROM organizations WHERE created_by = auth.uid())
    OR team_id IN (SELECT get_user_ad_teams())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'organizer')
  )
);

DROP POLICY IF EXISTS "org_alerts_select"  ON org_alerts;
DROP POLICY IF EXISTS "org_alerts_update"  ON org_alerts;

CREATE POLICY "org_alerts_select" ON org_alerts FOR SELECT USING (
  org_id IN (SELECT organization_id FROM organization_admins WHERE user_id = auth.uid())
  OR org_id IN (SELECT id FROM organizations WHERE created_by = auth.uid())
  OR team_id IN (SELECT get_user_ad_teams())
  OR team_id IN (SELECT get_user_coached_team_ids())
);

CREATE POLICY "org_alerts_update" ON org_alerts FOR UPDATE USING (
  org_id IN (SELECT organization_id FROM organization_admins WHERE user_id = auth.uid())
  OR org_id IN (SELECT id FROM organizations WHERE created_by = auth.uid())
  OR team_id IN (SELECT get_user_ad_teams())
);

-- ── 7. Fix handle_new_user trigger ────────────────────────────────────────────
-- Ensure profile rows are always created on signup. Use ON CONFLICT DO NOTHING
-- so existing roles are never accidentally overwritten by a re-trigger.
-- The role is set from raw_user_meta_data on first insert only.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'athlete')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Re-attach trigger in case it was dropped
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ── 8. Ensure role column exists and has correct constraint ──────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'athlete';

-- Drop old constraint if it doesn't include all 4 roles, then recreate
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IS NULL OR role = ANY(ARRAY['athlete','coxswain','coach','organizer']));

-- Backfill any NULL roles
UPDATE public.profiles SET role = 'athlete' WHERE role IS NULL;
