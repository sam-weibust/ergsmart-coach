CREATE TABLE IF NOT EXISTS public.recovery_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  track_sleep boolean NOT NULL DEFAULT true,
  track_calories boolean NOT NULL DEFAULT true,
  track_water boolean NOT NULL DEFAULT true,
  track_weight boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recovery_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own recovery preferences"
  ON public.recovery_preferences
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
