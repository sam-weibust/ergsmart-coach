-- ── Food database tables ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.food_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT current_date,
  meal_type text NOT NULL CHECK (meal_type IN ('Breakfast', 'Lunch', 'Dinner', 'Snacks')),
  food_name text NOT NULL,
  brand text,
  calories numeric NOT NULL DEFAULT 0,
  protein numeric DEFAULT 0,
  carbs numeric DEFAULT 0,
  fat numeric DEFAULT 0,
  fiber numeric DEFAULT 0,
  sugar numeric DEFAULT 0,
  serving_size numeric DEFAULT 100,
  serving_unit text DEFAULT 'g',
  serving_quantity numeric DEFAULT 1,
  food_data_id text,
  source text DEFAULT 'usda' CHECK (source IN ('usda', 'custom', 'barcode', 'template', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.food_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own food log" ON public.food_log;
CREATE POLICY "Users can manage own food log" ON public.food_log
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_food_log_user_date ON public.food_log (user_id, date DESC);

CREATE TABLE IF NOT EXISTS public.custom_foods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  food_name text NOT NULL,
  calories_per_100g numeric NOT NULL DEFAULT 0,
  protein_per_100g numeric DEFAULT 0,
  carbs_per_100g numeric DEFAULT 0,
  fat_per_100g numeric DEFAULT 0,
  default_serving_size numeric DEFAULT 100,
  default_serving_unit text DEFAULT 'g',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.custom_foods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own custom foods" ON public.custom_foods;
CREATE POLICY "Users can manage own custom foods" ON public.custom_foods
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.favorite_foods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  food_name text NOT NULL,
  food_data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, food_name)
);
ALTER TABLE public.favorite_foods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own favorites" ON public.favorite_foods;
CREATE POLICY "Users can manage own favorites" ON public.favorite_foods
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.food_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL UNIQUE,
  results jsonb NOT NULL,
  cached_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.food_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read food cache" ON public.food_cache;
CREATE POLICY "Anyone can read food cache" ON public.food_cache FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service can write food cache" ON public.food_cache;
CREATE POLICY "Service can write food cache" ON public.food_cache
  FOR ALL USING (true) WITH CHECK (true);
