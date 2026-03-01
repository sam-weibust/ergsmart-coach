
-- Add food preferences to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS food_preferences text[] DEFAULT '{}'::text[];

-- Add is_favorite to meal_plans
ALTER TABLE public.meal_plans ADD COLUMN IF NOT EXISTS is_favorite boolean DEFAULT false;
