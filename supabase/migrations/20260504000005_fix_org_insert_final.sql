-- Final fix: ensure org creation works end-to-end.
-- Any authenticated user can create an org (created_by = their uid).
-- After creating an org, they can add themselves to organization_admins (user_id = their uid).
-- This overrides any prior conflicting policy on these two operations.

-- ── organizations INSERT ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "orgs_insert" ON organizations;
CREATE POLICY "orgs_insert"
  ON organizations FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- ── organizations SELECT (ensure creator can read their own org) ─────────────
DROP POLICY IF EXISTS "orgs_select" ON organizations;
CREATE POLICY "orgs_select"
  ON organizations FOR SELECT
  USING (
    created_by = auth.uid()
    OR id IN (
      SELECT organization_id FROM organization_admins WHERE user_id = auth.uid()
    )
    OR id IN (
      SELECT ot.organization_id
      FROM organization_teams ot
      WHERE ot.team_id IN (
        SELECT team_id FROM team_coaches WHERE user_id = auth.uid()
        UNION SELECT id FROM teams WHERE coach_id = auth.uid()
        UNION SELECT team_id FROM team_members WHERE user_id = auth.uid()
      )
    )
  );

-- ── organization_admins INSERT ───────────────────────────────────────────────
-- Allow: creator inserting themselves, or existing admin inserting others
DROP POLICY IF EXISTS "org_admins_insert" ON organization_admins;
CREATE POLICY "org_admins_insert"
  ON organization_admins FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR organization_id IN (
      SELECT id FROM organizations WHERE created_by = auth.uid()
    )
    OR organization_id IN (
      SELECT organization_id FROM organization_admins
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ── organization_admins SELECT ───────────────────────────────────────────────
DROP POLICY IF EXISTS "org_admins_select" ON organization_admins;
CREATE POLICY "org_admins_select"
  ON organization_admins FOR SELECT
  USING (
    user_id = auth.uid()
    OR organization_id IN (
      SELECT id FROM organizations WHERE created_by = auth.uid()
    )
    OR organization_id IN (
      SELECT organization_id FROM organization_admins WHERE user_id = auth.uid()
    )
  );

-- ── organization_teams INSERT ────────────────────────────────────────────────
DROP POLICY IF EXISTS "org_teams_insert" ON organization_teams;
CREATE POLICY "org_teams_insert"
  ON organization_teams FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT id FROM organizations WHERE created_by = auth.uid()
    )
    OR organization_id IN (
      SELECT organization_id FROM organization_admins
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ── organization_teams SELECT ────────────────────────────────────────────────
DROP POLICY IF EXISTS "org_teams_select" ON organization_teams;
CREATE POLICY "org_teams_select"
  ON organization_teams FOR SELECT
  USING (
    organization_id IN (
      SELECT id FROM organizations WHERE created_by = auth.uid()
    )
    OR organization_id IN (
      SELECT organization_id FROM organization_admins WHERE user_id = auth.uid()
    )
    OR team_id IN (
      SELECT team_id FROM team_coaches WHERE user_id = auth.uid()
      UNION SELECT id FROM teams WHERE coach_id = auth.uid()
      UNION SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  );
