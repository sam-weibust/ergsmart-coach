-- Add age and health_issues columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS age integer;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS health_issues text[] DEFAULT '{}'::text[];