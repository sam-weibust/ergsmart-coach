-- Push tokens table for native push notifications
CREATE TABLE IF NOT EXISTS push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, token)
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='push_tokens' AND policyname='push_tokens_select_own') THEN
    CREATE POLICY "push_tokens_select_own" ON push_tokens FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='push_tokens' AND policyname='push_tokens_insert_own') THEN
    CREATE POLICY "push_tokens_insert_own" ON push_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='push_tokens' AND policyname='push_tokens_update_own') THEN
    CREATE POLICY "push_tokens_update_own" ON push_tokens FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='push_tokens' AND policyname='push_tokens_delete_own') THEN
    CREATE POLICY "push_tokens_delete_own" ON push_tokens FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON push_tokens(user_id);

-- Create notification_preferences if it doesn't exist, with all columns
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
  lineup_published boolean DEFAULT true,
  practice_reminder boolean DEFAULT true,
  direct_message boolean DEFAULT true,
  whoop_low_recovery boolean DEFAULT true,
  personal_best boolean DEFAULT true,
  unsubscribe_token text NOT NULL DEFAULT gen_random_uuid()::text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add columns if the table already existed without them
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS lineup_published boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS practice_reminder boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS direct_message boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS whoop_low_recovery boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS personal_best boolean DEFAULT true;

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notification_preferences' AND policyname='np_select_own') THEN
    CREATE POLICY "np_select_own" ON notification_preferences FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notification_preferences' AND policyname='np_insert_own') THEN
    CREATE POLICY "np_insert_own" ON notification_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notification_preferences' AND policyname='np_update_own') THEN
    CREATE POLICY "np_update_own" ON notification_preferences FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS np_user_idx ON notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS np_token_idx ON notification_preferences(unsubscribe_token);
