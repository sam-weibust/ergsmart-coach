-- Allow users to view profiles of people who sent them a pending friend request
CREATE POLICY "Users can view pending requester profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM friendships
    WHERE friendships.user_id = profiles.id
      AND friendships.friend_id = auth.uid()
      AND friendships.status = 'pending'
  )
);