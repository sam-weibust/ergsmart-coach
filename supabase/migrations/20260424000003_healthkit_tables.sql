-- HealthKit integration tables

CREATE TABLE IF NOT EXISTS public.healthkit_heart_rate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  resting_heart_rate integer,
  hrv_ms numeric(6,2),
  heart_rate_average integer,
  source text DEFAULT 'apple_health',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

ALTER TABLE public.healthkit_heart_rate ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own healthkit_heart_rate" ON public.healthkit_heart_rate
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_healthkit_heart_rate_user_date
  ON public.healthkit_heart_rate(user_id, date DESC);

CREATE TABLE IF NOT EXISTS public.cross_training (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  activity_type text NOT NULL,
  duration_minutes integer,
  calories integer,
  distance_meters integer,
  heart_rate_average integer,
  heart_rate_max integer,
  source text DEFAULT 'apple_health',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.cross_training ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own cross_training" ON public.cross_training
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_cross_training_user_date
  ON public.cross_training(user_id, date DESC);

-- Track which users have connected HealthKit and when last synced
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS healthkit_connected boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS healthkit_last_synced timestamptz;
