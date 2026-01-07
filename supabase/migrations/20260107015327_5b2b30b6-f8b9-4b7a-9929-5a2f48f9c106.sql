-- Fix overly permissive profiles SELECT policy
-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can search profiles" ON public.profiles;

-- Policy 1: Users can view their own full profile
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Policy 2: Users can view limited data of their friends
CREATE POLICY "Users can view friend profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
    AND (
      (user_id = auth.uid() AND friend_id = profiles.id)
      OR (friend_id = auth.uid() AND user_id = profiles.id)
    )
  )
);

-- Policy 3: Team coaches can view team member profiles
CREATE POLICY "Coaches can view team member profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = profiles.id
    AND t.coach_id = auth.uid()
  )
);

-- Policy 4: Team members can view other team member profiles
CREATE POLICY "Team members can view teammate profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members my_membership
    JOIN public.team_members their_membership ON my_membership.team_id = their_membership.team_id
    WHERE my_membership.user_id = auth.uid()
    AND their_membership.user_id = profiles.id
  )
);

-- Create a secure search function for finding users by username/name only
CREATE OR REPLACE FUNCTION public.search_users(search_query text)
RETURNS TABLE(id uuid, username text, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username, p.full_name 
  FROM profiles p
  WHERE p.username ILIKE '%' || search_query || '%'
     OR p.full_name ILIKE '%' || search_query || '%'
  LIMIT 20;
$$;