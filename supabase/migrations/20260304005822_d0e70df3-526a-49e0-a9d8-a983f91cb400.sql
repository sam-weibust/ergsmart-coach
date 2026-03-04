
-- Drop the existing insert policy for notifications
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;

-- Recreate with broader support: allow insert for self, accepted friends, OR pending friend requests (sender can notify recipient)
CREATE POLICY "Authenticated users can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  (auth.uid() = user_id)
  OR (EXISTS (
    SELECT 1 FROM friendships
    WHERE friendships.status = 'accepted'
    AND (
      (friendships.user_id = auth.uid() AND friendships.friend_id = notifications.user_id)
      OR (friendships.friend_id = auth.uid() AND friendships.user_id = notifications.user_id)
    )
  ))
  OR (EXISTS (
    SELECT 1 FROM friendships
    WHERE friendships.status = 'pending'
    AND friendships.user_id = auth.uid()
    AND friendships.friend_id = notifications.user_id
  ))
);
