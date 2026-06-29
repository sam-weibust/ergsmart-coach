-- Allow users to update their own profile (incl. user_type for role switching).
-- Recreate the policy with an explicit WITH CHECK so the new row is also
-- constrained to the authenticated user.
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());
