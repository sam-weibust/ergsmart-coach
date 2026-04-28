-- Daily nutrition summary: one row per user per day, created on Save and Finish
CREATE TABLE IF NOT EXISTS public.daily_nutrition_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  total_calories numeric NOT NULL DEFAULT 0,
  total_protein numeric NOT NULL DEFAULT 0,
  total_carbs numeric NOT NULL DEFAULT 0,
  total_fat numeric NOT NULL DEFAULT 0,
  goal_calories numeric NOT NULL DEFAULT 0,
  goal_protein numeric NOT NULL DEFAULT 0,
  goal_carbs numeric NOT NULL DEFAULT 0,
  goal_fat numeric NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

ALTER TABLE public.daily_nutrition_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own nutrition summaries"
  ON public.daily_nutrition_summary
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_daily_nutrition_summary_user_date
  ON public.daily_nutrition_summary (user_id, date DESC);
