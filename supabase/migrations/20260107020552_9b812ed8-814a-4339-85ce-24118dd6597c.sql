-- Fix 1: Ensure the permissive profiles policy is removed (may already be dropped)
DROP POLICY IF EXISTS "Authenticated users can search profiles" ON public.profiles;

-- Fix 2: Remove unused search_users SECURITY DEFINER function
DROP FUNCTION IF EXISTS public.search_users(text);

-- Fix 3: Remove unused storage policies (keep bucket since it has objects, just secure it)
DROP POLICY IF EXISTS "Users can upload workout plans" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read workout plans" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their workout plans" ON storage.objects;

-- Make bucket private
UPDATE storage.buckets SET public = false WHERE id = 'workout-plans';

-- Add secure owner-only policies
CREATE POLICY "Users can read own workout plan files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'workout-plans'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can upload own workout plan files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'workout-plans'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own workout plan files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'workout-plans'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Fix 4: Update the notifications INSERT policy to be more restrictive
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;

-- Create a policy that allows users to insert their own notifications or for friends
CREATE POLICY "Authenticated users can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id 
  OR EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
    AND (
      (user_id = auth.uid() AND friend_id = notifications.user_id)
      OR (friend_id = auth.uid() AND user_id = notifications.user_id)
    )
  )
);