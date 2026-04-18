-- Weekly Challenge System
CREATE TABLE public.weekly_challenges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start DATE NOT NULL UNIQUE,
  challenge_type TEXT NOT NULL, -- 'fastest_2k_improvement', 'most_meters', 'consistent_splits', 'highest_wpk_gain'
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  season_phase TEXT DEFAULT 'base',
  ai_reasoning TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.challenge_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge_id UUID NOT NULL REFERENCES public.weekly_challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  value NUMERIC NOT NULL,
  points INTEGER DEFAULT 0,
  display_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(challenge_id, user_id)
);

ALTER TABLE public.weekly_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view weekly challenges" ON public.weekly_challenges FOR SELECT USING (true);
CREATE POLICY "Anyone can view challenge entries" ON public.challenge_entries FOR SELECT USING (true);
CREATE POLICY "Users can manage their own challenge entries" ON public.challenge_entries FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_challenge_entries_updated_at
  BEFORE UPDATE ON public.challenge_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
