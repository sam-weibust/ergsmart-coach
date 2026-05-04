-- Lineup templates: save/load lineup configurations
CREATE TABLE IF NOT EXISTS lineup_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  coach_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  boat_id uuid REFERENCES team_boats(id) ON DELETE SET NULL,
  boat_class text NOT NULL DEFAULT '8+',
  seats jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE lineup_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members view lineup templates" ON lineup_templates
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM team_members WHERE team_id = lineup_templates.team_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM teams WHERE id = lineup_templates.team_id AND coach_id = auth.uid())
    OR EXISTS (SELECT 1 FROM team_coaches WHERE team_id = lineup_templates.team_id AND user_id = auth.uid())
  );

CREATE POLICY "Coaches manage lineup templates" ON lineup_templates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM teams WHERE id = lineup_templates.team_id AND coach_id = auth.uid())
    OR EXISTS (SELECT 1 FROM team_coaches WHERE team_id = lineup_templates.team_id AND user_id = auth.uid())
  );

-- Direct messages: coach-athlete private messaging
CREATE TABLE IF NOT EXISTS direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  recipient_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own direct messages" ON direct_messages
  FOR SELECT USING (sender_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "Users send direct messages" ON direct_messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Recipients mark messages as read" ON direct_messages
  FOR UPDATE USING (recipient_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
