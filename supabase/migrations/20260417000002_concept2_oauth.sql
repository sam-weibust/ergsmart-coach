-- Concept2 OAuth Integration

-- concept2_tokens table
CREATE TABLE IF NOT EXISTS concept2_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE concept2_tokens ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write tokens (never expose to frontend)
CREATE POLICY "service_role_all" ON concept2_tokens
  USING (false)
  WITH CHECK (false);

-- Add external_id to erg_workouts to prevent duplicate imports
ALTER TABLE erg_workouts ADD COLUMN IF NOT EXISTS external_id text;
CREATE UNIQUE INDEX IF NOT EXISTS erg_workouts_external_id_user_idx
  ON erg_workouts (user_id, external_id) WHERE external_id IS NOT NULL;

-- Add last_concept2_sync to athlete_profiles
ALTER TABLE athlete_profiles ADD COLUMN IF NOT EXISTS last_concept2_sync timestamptz;

-- Enable pg_cron and pg_net for scheduled syncs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Daily sync at 3am UTC for all connected athletes
-- Replace 'your-cron-secret' with the actual CRON_SECRET value from Supabase secrets
SELECT cron.schedule(
  'daily-concept2-sync',
  '0 3 * * *',
  $$
    SELECT net.http_post(
      url := 'https://lezqonvzqwpdpmyvpuvd.supabase.co/functions/v1/daily-c2-sync',
      headers := '{"Content-Type": "application/json", "x-cron-secret": "your-cron-secret"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);
