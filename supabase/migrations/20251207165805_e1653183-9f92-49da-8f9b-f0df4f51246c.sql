-- Fix security: Restrict profiles SELECT to authenticated users only
DROP POLICY IF EXISTS "Users can search profiles by email or username" ON public.profiles;
CREATE POLICY "Authenticated users can search profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

-- Create team_messages table for team message boards
CREATE TABLE public.team_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;

-- Team members can view messages in their teams
CREATE POLICY "Team members can view team messages" ON public.team_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM team_members WHERE team_members.team_id = team_messages.team_id AND team_members.user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM teams WHERE teams.id = team_messages.team_id AND teams.coach_id = auth.uid()
    )
  );

-- Team members can post messages
CREATE POLICY "Team members can post messages" ON public.team_messages
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND (
      EXISTS (
        SELECT 1 FROM team_members WHERE team_members.team_id = team_messages.team_id AND team_members.user_id = auth.uid()
      ) OR EXISTS (
        SELECT 1 FROM teams WHERE teams.id = team_messages.team_id AND teams.coach_id = auth.uid()
      )
    )
  );

-- Users can delete their own messages
CREATE POLICY "Users can delete own messages" ON public.team_messages
  FOR DELETE USING (auth.uid() = user_id);

-- Create friend_messages table for friend direct messages
CREATE TABLE public.friend_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.friend_messages ENABLE ROW LEVEL SECURITY;

-- Users can view messages they sent or received
CREATE POLICY "Users can view their messages" ON public.friend_messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Users can send messages to accepted friends
CREATE POLICY "Users can send messages to friends" ON public.friend_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND EXISTS (
      SELECT 1 FROM friendships 
      WHERE friendships.status = 'accepted' 
      AND ((friendships.user_id = sender_id AND friendships.friend_id = receiver_id)
           OR (friendships.friend_id = sender_id AND friendships.user_id = receiver_id))
    )
  );

-- Users can delete their own sent messages
CREATE POLICY "Users can delete sent messages" ON public.friend_messages
  FOR DELETE USING (auth.uid() = sender_id);

-- Create team_goals table for team goal tracking
CREATE TABLE public.team_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  target_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES public.profiles(id)
);

ALTER TABLE public.team_goals ENABLE ROW LEVEL SECURITY;

-- Team members can view team goals
CREATE POLICY "Team members can view team goals" ON public.team_goals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM team_members WHERE team_members.team_id = team_goals.team_id AND team_members.user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM teams WHERE teams.id = team_goals.team_id AND teams.coach_id = auth.uid()
    )
  );

-- Coaches can create team goals
CREATE POLICY "Coaches can create team goals" ON public.team_goals
  FOR INSERT WITH CHECK (
    auth.uid() = created_by AND EXISTS (
      SELECT 1 FROM teams WHERE teams.id = team_goals.team_id AND teams.coach_id = auth.uid()
    )
  );

-- Coaches can delete team goals
CREATE POLICY "Coaches can delete team goals" ON public.team_goals
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM teams WHERE teams.id = team_goals.team_id AND teams.coach_id = auth.uid()
    )
  );

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_messages;