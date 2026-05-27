-- Training plan preferences: stores user customization choices before plan generation
CREATE TABLE IF NOT EXISTS training_plan_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  training_goal text NOT NULL DEFAULT 'general_fitness',
  intensity text NOT NULL DEFAULT 'moderate',
  goal_date date,
  include_lifting boolean DEFAULT true,
  lifting_days_per_week integer DEFAULT 2,
  include_two_a_days boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE training_plan_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own training preferences"
  ON training_plan_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add training_reminders to notification_preferences if not exists
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS training_reminders boolean DEFAULT true;
