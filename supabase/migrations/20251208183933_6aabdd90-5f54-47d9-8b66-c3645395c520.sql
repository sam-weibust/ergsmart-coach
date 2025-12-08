-- Drop the problematic workout_plans SELECT policy that causes infinite recursion
DROP POLICY IF EXISTS "Users can view shared workout plans" ON public.workout_plans;

-- Create a simpler policy that avoids the recursion through team_members
CREATE POLICY "Users can view their own plans" 
ON public.workout_plans 
FOR SELECT 
USING (auth.uid() = user_id);

-- Create a separate policy for shared plans without the team_members recursion
CREATE POLICY "Users can view plans shared with them" 
ON public.workout_plans 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM plan_shares
    WHERE plan_shares.plan_id = workout_plans.id 
    AND plan_shares.shared_with_user = auth.uid()
  )
);

-- Create policy for plans shared via friendship
CREATE POLICY "Users can view friend workout plans" 
ON public.workout_plans 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM friendships
    WHERE friendships.status = 'accepted'
    AND (
      (friendships.user_id = workout_plans.user_id AND friendships.friend_id = auth.uid())
      OR (friendships.friend_id = workout_plans.user_id AND friendships.user_id = auth.uid())
    )
  )
);