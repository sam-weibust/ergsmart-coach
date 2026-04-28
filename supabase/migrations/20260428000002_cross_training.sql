CREATE TABLE IF NOT EXISTS public.cross_training (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT current_date,
  activity_type text NOT NULL CHECK (activity_type IN ('Run', 'Bike', 'Swim')),
  distance numeric,
  distance_unit text NOT NULL DEFAULT 'mi' CHECK (distance_unit IN ('mi', 'km')),
  duration_seconds integer,
  heart_rate_average integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cross_training ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own cross training"
  ON public.cross_training
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_cross_training_user_date
  ON public.cross_training (user_id, date DESC);
