-- Create security definer function to check team membership without triggering RLS
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id AND team_id = _team_id
  )
$$;

-- Create security definer function to check if user is coach of team
CREATE OR REPLACE FUNCTION public.is_team_coach(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teams
    WHERE id = _team_id AND coach_id = _user_id
  )
$$;

-- Fix teams policies
DROP POLICY IF EXISTS "Anyone can view teams they are part of or coach" ON public.teams;
CREATE POLICY "Users can view their teams" ON public.teams
FOR SELECT USING (
  auth.uid() = coach_id OR is_team_member(auth.uid(), id)
);

-- Fix team_members policies
DROP POLICY IF EXISTS "Team members can view their team" ON public.team_members;
CREATE POLICY "Users can view team memberships" ON public.team_members
FOR SELECT USING (
  user_id = auth.uid() OR is_team_coach(auth.uid(), team_id)
);

DROP POLICY IF EXISTS "Coaches can add team members" ON public.team_members;
CREATE POLICY "Coaches can add members" ON public.team_members
FOR INSERT WITH CHECK (is_team_coach(auth.uid(), team_id));

DROP POLICY IF EXISTS "Coaches can remove team members" ON public.team_members;
CREATE POLICY "Coaches can remove members" ON public.team_members
FOR DELETE USING (is_team_coach(auth.uid(), team_id));

-- Fix plan_shares policy
DROP POLICY IF EXISTS "Users can view plans shared with them" ON public.plan_shares;
CREATE POLICY "Users can view their plan shares" ON public.plan_shares
FOR SELECT USING (
  auth.uid() = shared_by OR 
  auth.uid() = shared_with_user OR 
  is_team_member(auth.uid(), shared_with_team)
);

-- Fix team_goals policies
DROP POLICY IF EXISTS "Team members can view team goals" ON public.team_goals;
CREATE POLICY "Users can view team goals" ON public.team_goals
FOR SELECT USING (
  is_team_member(auth.uid(), team_id) OR is_team_coach(auth.uid(), team_id)
);

DROP POLICY IF EXISTS "Coaches can create team goals" ON public.team_goals;
CREATE POLICY "Coaches can create goals" ON public.team_goals
FOR INSERT WITH CHECK (
  auth.uid() = created_by AND is_team_coach(auth.uid(), team_id)
);

DROP POLICY IF EXISTS "Coaches can delete team goals" ON public.team_goals;
CREATE POLICY "Coaches can delete goals" ON public.team_goals
FOR DELETE USING (is_team_coach(auth.uid(), team_id));

-- Fix team_messages policies
DROP POLICY IF EXISTS "Team members can view team messages" ON public.team_messages;
CREATE POLICY "Users can view team messages" ON public.team_messages
FOR SELECT USING (
  is_team_member(auth.uid(), team_id) OR is_team_coach(auth.uid(), team_id)
);

DROP POLICY IF EXISTS "Team members can post messages" ON public.team_messages;
CREATE POLICY "Users can post team messages" ON public.team_messages
FOR INSERT WITH CHECK (
  auth.uid() = user_id AND (is_team_member(auth.uid(), team_id) OR is_team_coach(auth.uid(), team_id))
);