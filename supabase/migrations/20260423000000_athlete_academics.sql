CREATE TABLE IF NOT EXISTS public.athlete_academics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  psat_score INTEGER CHECK (psat_score >= 0 AND psat_score <= 1520),
  sat_score INTEGER CHECK (sat_score >= 0 AND sat_score <= 1600),
  act_score INTEGER CHECK (act_score >= 0 AND act_score <= 36),
  gpa NUMERIC(4,2) CHECK (gpa >= 0 AND gpa <= 5.0),
  gpa_weighted BOOLEAN DEFAULT false,
  class_rank_numerator INTEGER,
  class_rank_denominator INTEGER,
  intended_major TEXT,
  academic_interests TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE public.athlete_academics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own academics" ON public.athlete_academics FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Public read academics" ON public.athlete_academics FOR SELECT USING (true);
CREATE INDEX IF NOT EXISTS idx_athlete_academics_user ON athlete_academics(user_id);
