-- Add diet_goal column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS diet_goal text DEFAULT 'maintain' CHECK (diet_goal IN ('cut', 'bulk', 'maintain'));

-- Add enable_strength_training and enable_meal_plans columns for optional features
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS enable_strength_training boolean DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS enable_meal_plans boolean DEFAULT true;