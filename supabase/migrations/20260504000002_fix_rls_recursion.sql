-- ── SECURITY DEFINER functions to break RLS recursion ───────────────────────

-- Returns team IDs where the current user is a coach (reads team_coaches bypassing its own RLS)
CREATE OR REPLACE FUNCTION get_user_coached_team_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id FROM team_coaches WHERE user_id = auth.uid()
  UNION
  SELECT id FROM teams WHERE coach_id = auth.uid()
$$;

-- Returns org IDs where the current user is an admin/member
CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM organizations WHERE created_by = auth.uid()
  UNION
  SELECT organization_id FROM organization_admins WHERE user_id = auth.uid()
  UNION
  SELECT ot.organization_id
  FROM organization_teams ot
  WHERE ot.team_id IN (
    SELECT team_id FROM team_coaches WHERE user_id = auth.uid()
    UNION SELECT id FROM teams WHERE coach_id = auth.uid()
    UNION SELECT team_id FROM team_members WHERE user_id = auth.uid()
  )
$$;

-- Returns org IDs where the current user has admin privileges
CREATE OR REPLACE FUNCTION get_user_admin_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM organizations WHERE created_by = auth.uid()
  UNION
  SELECT organization_id FROM organization_admins WHERE user_id = auth.uid() AND role = 'admin'
$$;

-- ── Fix team_coaches (self-referencing recursion) ────────────────────────────
DROP POLICY IF EXISTS "team_coaches_select" ON team_coaches;
DROP POLICY IF EXISTS "team_coaches_insert" ON team_coaches;
DROP POLICY IF EXISTS "team_coaches_update" ON team_coaches;
DROP POLICY IF EXISTS "team_coaches_delete" ON team_coaches;

CREATE POLICY "team_coaches_select"
  ON team_coaches FOR SELECT
  USING (
    auth.uid() = user_id
    OR team_id IN (SELECT id FROM teams WHERE coach_id = auth.uid())
    OR team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
    OR team_id IN (SELECT get_user_coached_team_ids())
  );

CREATE POLICY "team_coaches_insert"
  ON team_coaches FOR INSERT
  WITH CHECK (
    team_id IN (SELECT id FROM teams WHERE coach_id = auth.uid())
    OR team_id IN (
      SELECT team_id FROM team_coaches
      WHERE user_id = auth.uid() AND role = 'head_coach'
    )
  );

CREATE POLICY "team_coaches_update"
  ON team_coaches FOR UPDATE
  USING (
    team_id IN (SELECT id FROM teams WHERE coach_id = auth.uid())
    OR team_id IN (
      SELECT team_id FROM team_coaches
      WHERE user_id = auth.uid() AND role = 'head_coach'
    )
  );

CREATE POLICY "team_coaches_delete"
  ON team_coaches FOR DELETE
  USING (
    team_id IN (SELECT id FROM teams WHERE coach_id = auth.uid())
    OR team_id IN (
      SELECT team_id FROM team_coaches
      WHERE user_id = auth.uid() AND role = 'head_coach'
    )
  );

-- ── Fix organizations (recursive via organization_admins) ────────────────────
DROP POLICY IF EXISTS "orgs_select" ON organizations;
DROP POLICY IF EXISTS "orgs_insert" ON organizations;
DROP POLICY IF EXISTS "orgs_update" ON organizations;
DROP POLICY IF EXISTS "orgs_delete" ON organizations;

CREATE POLICY "orgs_select"
  ON organizations FOR SELECT
  USING (id IN (SELECT get_user_org_ids()));

CREATE POLICY "orgs_insert"
  ON organizations FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "orgs_update"
  ON organizations FOR UPDATE
  USING (id IN (SELECT get_user_admin_org_ids()));

CREATE POLICY "orgs_delete"
  ON organizations FOR DELETE
  USING (created_by = auth.uid());

-- ── Fix organization_admins (recursive via organizations) ────────────────────
DROP POLICY IF EXISTS "org_admins_select" ON organization_admins;
DROP POLICY IF EXISTS "org_admins_insert" ON organization_admins;
DROP POLICY IF EXISTS "org_admins_delete" ON organization_admins;

CREATE POLICY "org_admins_select"
  ON organization_admins FOR SELECT
  USING (
    user_id = auth.uid()
    OR organization_id IN (SELECT get_user_admin_org_ids())
  );

CREATE POLICY "org_admins_insert"
  ON organization_admins FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT get_user_admin_org_ids())
  );

CREATE POLICY "org_admins_delete"
  ON organization_admins FOR DELETE
  USING (
    organization_id IN (SELECT get_user_admin_org_ids())
  );

-- ── Fix organization_teams (recursive via organizations) ─────────────────────
DROP POLICY IF EXISTS "org_teams_select" ON organization_teams;
DROP POLICY IF EXISTS "org_teams_insert" ON organization_teams;
DROP POLICY IF EXISTS "org_teams_delete" ON organization_teams;

CREATE POLICY "org_teams_select"
  ON organization_teams FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids())
    OR team_id IN (SELECT get_user_coached_team_ids())
    OR team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_teams_insert"
  ON organization_teams FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT get_user_admin_org_ids())
  );

CREATE POLICY "org_teams_delete"
  ON organization_teams FOR DELETE
  USING (
    organization_id IN (SELECT get_user_admin_org_ids())
  );

-- ── Fix org_messages (recursive via organizations) ───────────────────────────
DROP POLICY IF EXISTS "org_messages_select" ON org_messages;
DROP POLICY IF EXISTS "org_messages_insert" ON org_messages;
DROP POLICY IF EXISTS "org_messages_delete" ON org_messages;

CREATE POLICY "org_messages_select"
  ON org_messages FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "org_messages_insert"
  ON org_messages FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND organization_id IN (SELECT get_user_org_ids())
  );

CREATE POLICY "org_messages_delete"
  ON org_messages FOR DELETE
  USING (
    user_id = auth.uid()
    OR organization_id IN (SELECT get_user_admin_org_ids())
  );
