-- whoop_connections
CREATE TABLE IF NOT EXISTS public.whoop_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  whoop_user_id TEXT,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);
ALTER TABLE public.whoop_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own whoop connection" ON public.whoop_connections
  FOR ALL USING (auth.uid() = user_id);

-- whoop_recovery
CREATE TABLE IF NOT EXISTS public.whoop_recovery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  whoop_cycle_id BIGINT,
  date DATE NOT NULL,
  recovery_score INTEGER,
  hrv_rmssd NUMERIC(8,3),
  resting_heart_rate INTEGER,
  sleep_performance_percentage NUMERIC(5,2),
  skin_temp_celsius NUMERIC(5,2),
  blood_oxygen_percentage NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_whoop_recovery_user_date ON whoop_recovery(user_id, date DESC);
ALTER TABLE public.whoop_recovery ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own whoop recovery" ON public.whoop_recovery
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Public read whoop recovery" ON public.whoop_recovery
  FOR SELECT USING (true);

-- whoop_sleep
CREATE TABLE IF NOT EXISTS public.whoop_sleep (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  whoop_sleep_id BIGINT,
  date DATE NOT NULL,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_hours NUMERIC(4,2),
  sleep_efficiency_percentage NUMERIC(5,2),
  sleep_performance_percentage NUMERIC(5,2),
  disturbance_count INTEGER,
  light_sleep_ms BIGINT,
  slow_wave_sleep_ms BIGINT,
  rem_sleep_ms BIGINT,
  awake_ms BIGINT,
  sleep_need_ms BIGINT,
  sleep_debt_ms BIGINT,
  respiratory_rate NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_whoop_sleep_user_date ON whoop_sleep(user_id, date DESC);
ALTER TABLE public.whoop_sleep ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own whoop sleep" ON public.whoop_sleep
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Public read whoop sleep" ON public.whoop_sleep
  FOR SELECT USING (true);

-- whoop_strain
CREATE TABLE IF NOT EXISTS public.whoop_strain (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  whoop_cycle_id BIGINT,
  date DATE NOT NULL,
  strain NUMERIC(5,2),
  kilojoule NUMERIC(8,2),
  average_heart_rate INTEGER,
  max_heart_rate INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_whoop_strain_user_date ON whoop_strain(user_id, date DESC);
ALTER TABLE public.whoop_strain ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own whoop strain" ON public.whoop_strain
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Public read whoop strain" ON public.whoop_strain
  FOR SELECT USING (true);

-- whoop_workouts
CREATE TABLE IF NOT EXISTS public.whoop_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  whoop_workout_id BIGINT UNIQUE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  sport_id INTEGER,
  sport_name TEXT,
  strain NUMERIC(5,2),
  kilojoule NUMERIC(8,2),
  average_heart_rate INTEGER,
  max_heart_rate INTEGER,
  zone_1_ms BIGINT,
  zone_2_ms BIGINT,
  zone_3_ms BIGINT,
  zone_4_ms BIGINT,
  zone_5_ms BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_whoop_workouts_user ON whoop_workouts(user_id, start_time DESC);
ALTER TABLE public.whoop_workouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own whoop workouts" ON public.whoop_workouts
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Public read whoop workouts" ON public.whoop_workouts
  FOR SELECT USING (true);
