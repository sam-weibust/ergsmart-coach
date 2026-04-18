-- Program Alumni Network (coach feature)
CREATE TABLE public.program_alumni (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  athlete_name TEXT NOT NULL,
  grad_year INTEGER,
  high_school TEXT,
  college_name TEXT,
  division TEXT, -- 'D1', 'D2', 'D3', 'NAIA', 'Club', 'Ivy'
  state TEXT, -- US state abbreviation
  sport TEXT DEFAULT 'Rowing',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.program_alumni ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view their own alumni" ON public.program_alumni FOR SELECT USING (auth.uid() = coach_id);
CREATE POLICY "Coaches can manage their own alumni" ON public.program_alumni FOR ALL USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);

CREATE TRIGGER update_program_alumni_updated_at
  BEFORE UPDATE ON public.program_alumni
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
