-- Add username field to profiles
ALTER TABLE public.profiles ADD COLUMN username text UNIQUE;

-- Create index for username search
CREATE INDEX idx_profiles_username ON public.profiles(username);

-- Allow users to view other profiles by username for friend search
CREATE POLICY "Users can search profiles by email or username"
ON public.profiles
FOR SELECT
USING (true);

-- Drop the old restrictive select policy if it exists
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;