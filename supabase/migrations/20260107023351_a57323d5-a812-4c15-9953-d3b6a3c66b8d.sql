-- Add allergies column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS allergies text[] DEFAULT '{}';

-- Add warmup, cooldown, and rest period columns to erg_workouts
ALTER TABLE public.erg_workouts 
ADD COLUMN IF NOT EXISTS warmup_duration interval DEFAULT NULL,
ADD COLUMN IF NOT EXISTS cooldown_duration interval DEFAULT NULL,
ADD COLUMN IF NOT EXISTS rest_periods text DEFAULT NULL;

-- Add warmup and cooldown columns to strength_workouts
ALTER TABLE public.strength_workouts
ADD COLUMN IF NOT EXISTS warmup_notes text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS cooldown_notes text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS rest_between_sets interval DEFAULT NULL;