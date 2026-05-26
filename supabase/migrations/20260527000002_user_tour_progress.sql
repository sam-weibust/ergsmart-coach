CREATE TABLE IF NOT EXISTS public.user_tour_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tour_id text NOT NULL CHECK (tour_id IN ('athlete', 'coach', 'coxswain')),
  completed_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed boolean NOT NULL DEFAULT false,
  skipped boolean NOT NULL DEFAULT false,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tour_id)
);

CREATE INDEX IF NOT EXISTS user_tour_progress_user_idx ON public.user_tour_progress (user_id);

ALTER TABLE public.user_tour_progress ENABLE ROW LEVEL SECURITY;

-- Users can only see and modify their own tour progress
CREATE POLICY "Users can read own tour progress"
  ON public.user_tour_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tour progress"
  ON public.user_tour_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id AND tour_id IN ('athlete', 'coach', 'coxswain'));

CREATE POLICY "Users can update own tour progress"
  ON public.user_tour_progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND tour_id IN ('athlete', 'coach', 'coxswain'));

-- No DELETE policy — prevent tour data loss / manipulation
