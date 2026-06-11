-- Add force_curves column to erg_workouts for PM5 force curve persistence.
-- Stores up to the last 10 force curves from a live erg session as a JSONB array.
ALTER TABLE public.erg_workouts ADD COLUMN IF NOT EXISTS force_curves JSONB;
