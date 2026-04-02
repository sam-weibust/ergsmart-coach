
-- Streak freezes table
CREATE TABLE public.streak_freezes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  freeze_date DATE NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, freeze_date)
);

ALTER TABLE public.streak_freezes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own streak freezes"
ON public.streak_freezes FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own streak freezes"
ON public.streak_freezes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own streak freezes"
ON public.streak_freezes FOR DELETE
USING (auth.uid() = user_id);

-- Workout annotations table
CREATE TABLE public.workout_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID NOT NULL,
  workout_type TEXT NOT NULL,
  coach_id UUID NOT NULL,
  athlete_id UUID NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.workout_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can insert annotations for their team athletes"
ON public.workout_annotations FOR INSERT
WITH CHECK (
  auth.uid() = coach_id
  AND EXISTS (
    SELECT 1 FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = workout_annotations.athlete_id
    AND t.coach_id = auth.uid()
  )
);

CREATE POLICY "Coaches can view annotations they created"
ON public.workout_annotations FOR SELECT
USING (auth.uid() = coach_id);

CREATE POLICY "Athletes can view their own annotations"
ON public.workout_annotations FOR SELECT
USING (auth.uid() = athlete_id);

CREATE POLICY "Coaches can delete their own annotations"
ON public.workout_annotations FOR DELETE
USING (auth.uid() = coach_id);

-- Add session_id to erg_workouts for multi-piece sessions
ALTER TABLE public.erg_workouts ADD COLUMN session_id TEXT;
