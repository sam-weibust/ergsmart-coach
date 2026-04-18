-- Virtual Combine: standardized test results and scoring
CREATE TABLE public.combine_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  two_k_seconds INTEGER, -- 2k erg time in seconds
  two_k_watts NUMERIC,
  six_k_seconds INTEGER,
  six_k_watts NUMERIC,
  bench_press_kg NUMERIC,
  deadlift_kg NUMERIC,
  squat_kg NUMERIC,
  combine_score NUMERIC DEFAULT 0,
  grad_year INTEGER,
  gender TEXT,
  weight_kg NUMERIC,
  notes TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.combine_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view combine entries" ON public.combine_entries FOR SELECT USING (true);
CREATE POLICY "Users can manage their own combine entry" ON public.combine_entries FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_combine_entries_updated_at
  BEFORE UPDATE ON public.combine_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
