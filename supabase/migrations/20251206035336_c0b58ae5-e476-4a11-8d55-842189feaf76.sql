-- Add user_type to profiles (rower or coach)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_type text DEFAULT 'rower' CHECK (user_type IN ('rower', 'coach'));

-- Create teams table for coaches
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  coach_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now()
);

-- Create team_members table
CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamp with time zone DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- Create plan_shares table for sharing plans with teams or individuals
CREATE TABLE public.plan_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.workout_plans(id) ON DELETE CASCADE,
  shared_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shared_with_user uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  shared_with_team uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  CHECK (shared_with_user IS NOT NULL OR shared_with_team IS NOT NULL)
);

-- Enable RLS
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_shares ENABLE ROW LEVEL SECURITY;

-- Teams policies
CREATE POLICY "Coaches can create teams" ON public.teams
  FOR INSERT WITH CHECK (auth.uid() = coach_id);

CREATE POLICY "Coaches can update their teams" ON public.teams
  FOR UPDATE USING (auth.uid() = coach_id);

CREATE POLICY "Coaches can delete their teams" ON public.teams
  FOR DELETE USING (auth.uid() = coach_id);

CREATE POLICY "Anyone can view teams they are part of or coach" ON public.teams
  FOR SELECT USING (
    auth.uid() = coach_id OR
    EXISTS (SELECT 1 FROM public.team_members WHERE team_id = teams.id AND user_id = auth.uid())
  );

-- Team members policies
CREATE POLICY "Coaches can add team members" ON public.team_members
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND coach_id = auth.uid())
  );

CREATE POLICY "Coaches can remove team members" ON public.team_members
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND coach_id = auth.uid())
  );

CREATE POLICY "Team members can view their team" ON public.team_members
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND coach_id = auth.uid())
  );

-- Plan shares policies
CREATE POLICY "Users can share their plans" ON public.plan_shares
  FOR INSERT WITH CHECK (auth.uid() = shared_by);

CREATE POLICY "Users can delete their shares" ON public.plan_shares
  FOR DELETE USING (auth.uid() = shared_by);

CREATE POLICY "Users can view plans shared with them" ON public.plan_shares
  FOR SELECT USING (
    auth.uid() = shared_by OR
    auth.uid() = shared_with_user OR
    EXISTS (SELECT 1 FROM public.team_members WHERE team_id = shared_with_team AND user_id = auth.uid())
  );

-- Allow friends to view workout_plans shared with them
CREATE POLICY "Users can view shared workout plans" ON public.workout_plans
  FOR SELECT USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.plan_shares 
      WHERE plan_id = workout_plans.id AND (
        shared_with_user = auth.uid() OR
        EXISTS (SELECT 1 FROM public.team_members WHERE team_id = plan_shares.shared_with_team AND user_id = auth.uid())
      )
    ) OR
    EXISTS (
      SELECT 1 FROM public.friendships
      WHERE status = 'accepted' AND (
        (user_id = workout_plans.user_id AND friend_id = auth.uid()) OR
        (friend_id = workout_plans.user_id AND user_id = auth.uid())
      )
    )
  );

-- Drop the old select policy first
DROP POLICY IF EXISTS "Users can view their own workout plans" ON public.workout_plans;