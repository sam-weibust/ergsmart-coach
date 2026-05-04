-- Fix INSERT policies so any authenticated user can create an org and self-register as admin

DROP POLICY IF EXISTS "orgs_insert" ON organizations;
CREATE POLICY "orgs_insert"
  ON organizations FOR INSERT
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "org_admins_insert" ON organization_admins;
CREATE POLICY "org_admins_insert"
  ON organization_admins FOR INSERT
  WITH CHECK (auth.uid() = user_id);
