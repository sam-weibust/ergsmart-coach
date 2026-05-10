-- Fix: org_admins_insert was too permissive (any user could add themselves as admin of any org).
-- New policy: a user may insert a row into organization_admins only if:
--   a) they are the creator of that organization (self-promotion after org creation), OR
--   b) they are inserting themselves AND already an admin (handled by frontend, but belt-and-suspenders)
--      via a SECURITY DEFINER helper that doesn't recurse.
-- This uses the existing get_user_admin_org_ids() SECURITY DEFINER function which reads
-- organization_admins bypassing RLS, preventing infinite recursion.

DROP POLICY IF EXISTS "org_admins_insert" ON organization_admins;
CREATE POLICY "org_admins_insert"
  ON organization_admins FOR INSERT
  WITH CHECK (
    -- Creator adding themselves (the standard new-org flow)
    (auth.uid() = user_id AND organization_id IN (
      SELECT id FROM organizations WHERE created_by = auth.uid()
    ))
    OR
    -- Existing admin adding someone else (or themselves to another org they admin)
    organization_id IN (SELECT get_user_admin_org_ids())
  );
