CREATE TABLE IF NOT EXISTS weekly_challenge_completions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id text NOT NULL,
  week_number integer NOT NULL,
  year integer NOT NULL,
  completed_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id, challenge_id, week_number, year)
);

ALTER TABLE weekly_challenge_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own completions"
  ON weekly_challenge_completions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own completions"
  ON weekly_challenge_completions FOR INSERT
  WITH CHECK (auth.uid() = user_id);
