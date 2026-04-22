-- Weight entries
CREATE TABLE IF NOT EXISTS public.weight_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  weight NUMERIC(6,2) NOT NULL,
  unit TEXT NOT NULL DEFAULT 'lbs',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_weight_entries_user_date ON weight_entries(user_id, date DESC);
ALTER TABLE public.weight_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own weight" ON public.weight_entries
  FOR ALL USING (auth.uid() = user_id);

-- Water entries
CREATE TABLE IF NOT EXISTS public.water_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_ml INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_water_entries_user_date ON water_entries(user_id, date DESC);
ALTER TABLE public.water_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own water" ON public.water_entries
  FOR ALL USING (auth.uid() = user_id);

-- Sleep entries
CREATE TABLE IF NOT EXISTS public.sleep_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  duration_hours NUMERIC(4,2) NOT NULL,
  quality_score INTEGER CHECK (quality_score BETWEEN 1 AND 10),
  bedtime TIME,
  wake_time TIME,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sleep_entries_user_date ON sleep_entries(user_id, date DESC);
ALTER TABLE public.sleep_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own sleep" ON public.sleep_entries
  FOR ALL USING (auth.uid() = user_id);

-- Recovery scores
CREATE TABLE IF NOT EXISTS public.recovery_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  score NUMERIC(5,2),
  sleep_component NUMERIC(5,2),
  hydration_component NUMERIC(5,2),
  calorie_component NUMERIC(5,2),
  weight_component NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);
ALTER TABLE public.recovery_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own recovery scores" ON public.recovery_scores
  FOR ALL USING (auth.uid() = user_id);

-- AI insights cache
CREATE TABLE IF NOT EXISTS public.ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL DEFAULT 'daily',
  content TEXT NOT NULL,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, insight_type)
);
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own insights" ON public.ai_insights
  FOR ALL USING (auth.uid() = user_id);

-- Hydration goal on profiles (default 2500ml)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hydration_goal_ml INTEGER DEFAULT 2500;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS weight_unit TEXT DEFAULT 'lbs';
