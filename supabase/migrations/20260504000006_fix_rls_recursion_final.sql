-- Fix: migration 000005 introduced recursive RLS policies.
-- org_admins_select referenced organization_admins and organizations in a cycle.
-- Solution: make org_admins policies reference ONLY auth.uid() directly (no subqueries).
-- Then orgs_select can safely subquery organization_admins (whose policy is now non-recursive).

-- ── organization_admins ──────────────────────────────────────────────────────
-- SELECT: users can only see their own rows. Simple, no cross-table references.
DROP POLICY IF EXISTS "org_admins_select" ON organization_admins;
CREATE POLICY "org_admins_select"
  ON organization_admins FOR SELECT
  USING (user_id = auth.uid());

-- INSERT: users can insert themselves only.
DROP POLICY IF EXISTS "org_admins_insert" ON organization_admins;
CREATE POLICY "org_admins_insert"
  ON organization_admins FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- DELETE: users can delete their own rows; org creators can delete any.
DROP POLICY IF EXISTS "org_admins_delete" ON organization_admins;
CREATE POLICY "org_admins_delete"
  ON organization_admins FOR DELETE
  USING (
    user_id = auth.uid()
    OR organization_id IN (SELECT id FROM organizations WHERE created_by = auth.uid())
  );

-- ── organizations ────────────────────────────────────────────────────────────
-- SELECT: creator, or user has a row in organization_admins (safe now — that
--         policy is just "user_id = auth.uid()", no further cross-queries).
DROP POLICY IF EXISTS "orgs_select" ON organizations;
CREATE POLICY "orgs_select"
  ON organizations FOR SELECT
  USING (
    created_by = auth.uid()
    OR id IN (
      SELECT organization_id FROM organization_admins WHERE user_id = auth.uid()
    )
  );

-- INSERT: creator sets created_by to their own uid.
DROP POLICY IF EXISTS "orgs_insert" ON organizations;
CREATE POLICY "orgs_insert"
  ON organizations FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- UPDATE/DELETE: only creator.
DROP POLICY IF EXISTS "orgs_update" ON organizations;
CREATE POLICY "orgs_update"
  ON organizations FOR UPDATE
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "orgs_delete" ON organizations;
CREATE POLICY "orgs_delete"
  ON organizations FOR DELETE
  USING (created_by = auth.uid());

-- ── organization_teams ───────────────────────────────────────────────────────
-- SELECT: if user is in org (via creator or admin row).
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

-- INSERT/DELETE: org creator or admin.
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

DROP POLICY IF EXISTS "org_teams_delete" ON organization_teams;
CREATE POLICY "org_teams_delete"
  ON organization_teams FOR DELETE
  USING (
    organization_id IN (
      SELECT id FROM organizations WHERE created_by = auth.uid()
    )
    OR organization_id IN (
      SELECT organization_id FROM organization_admins
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ── org_messages ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "org_messages_select" ON org_messages;
CREATE POLICY "org_messages_select"
  ON org_messages FOR SELECT
  USING (
    organization_id IN (
      SELECT id FROM organizations WHERE created_by = auth.uid()
    )
    OR organization_id IN (
      SELECT organization_id FROM organization_admins WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org_messages_insert" ON org_messages;
CREATE POLICY "org_messages_insert"
  ON org_messages FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      organization_id IN (
        SELECT id FROM organizations WHERE created_by = auth.uid()
      )
      OR organization_id IN (
        SELECT organization_id FROM organization_admins WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "org_messages_delete" ON org_messages;
CREATE POLICY "org_messages_delete"
  ON org_messages FOR DELETE
  USING (
    user_id = auth.uid()
    OR organization_id IN (
      SELECT id FROM organizations WHERE created_by = auth.uid()
    )
  );
