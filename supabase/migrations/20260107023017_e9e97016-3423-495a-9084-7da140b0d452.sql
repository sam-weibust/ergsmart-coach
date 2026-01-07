-- Create a secure function to search for users by email or username
-- This bypasses RLS but only returns minimal public info needed for friend requests
CREATE OR REPLACE FUNCTION public.search_users_for_friend_request(search_term text, current_user_id uuid)
RETURNS TABLE (id uuid, username text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Return matching users excluding the current user
  RETURN QUERY
  SELECT p.id, p.username, p.email
  FROM profiles p
  WHERE p.id != current_user_id
    AND (
      LOWER(p.email) = LOWER(search_term)
      OR LOWER(p.username) = LOWER(search_term)
    )
  LIMIT 1;
END;
$$;

-- Create table for pending email invites
CREATE TABLE IF NOT EXISTS public.friend_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inviter_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  invitee_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(inviter_id, invitee_email)
);

-- Enable RLS
ALTER TABLE public.friend_invites ENABLE ROW LEVEL SECURITY;

-- Policies for friend_invites
CREATE POLICY "Users can view their own invites"
  ON public.friend_invites
  FOR SELECT
  USING (auth.uid() = inviter_id);

CREATE POLICY "Users can create invites"
  ON public.friend_invites
  FOR INSERT
  WITH CHECK (auth.uid() = inviter_id);

CREATE POLICY "Users can delete their own invites"
  ON public.friend_invites
  FOR DELETE
  USING (auth.uid() = inviter_id);