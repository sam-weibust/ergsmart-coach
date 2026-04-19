-- Notification preferences per user with per-type toggles and unsubscribe token

CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  friend_request boolean DEFAULT true,
  friend_accepted boolean DEFAULT true,
  team_board_post boolean DEFAULT true,
  coach_viewed_profile boolean DEFAULT true,
  new_pr boolean DEFAULT true,
  weekly_challenge boolean DEFAULT true,
  training_plan_updated boolean DEFAULT true,
  unsubscribe_token text NOT NULL DEFAULT gen_random_uuid()::text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notification_preferences' AND policyname='np_select_own') THEN
    CREATE POLICY "np_select_own" ON notification_preferences
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notification_preferences' AND policyname='np_insert_own') THEN
    CREATE POLICY "np_insert_own" ON notification_preferences
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notification_preferences' AND policyname='np_update_own') THEN
    CREATE POLICY "np_update_own" ON notification_preferences
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS np_user_idx ON notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS np_token_idx ON notification_preferences(unsubscribe_token);
