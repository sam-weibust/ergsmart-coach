-- Add RLS policy to allow team members to view plans shared with their team
CREATE POLICY "Team members can view plans shared with their team"
ON public.workout_plans
FOR SELECT
USING (
  EXISTS (
    SELECT 1 
    FROM public.plan_shares ps
    WHERE ps.plan_id = workout_plans.id 
    AND ps.shared_with_team IS NOT NULL
    AND is_team_member(auth.uid(), ps.shared_with_team)
  )
);