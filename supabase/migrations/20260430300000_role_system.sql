-- Add role column and coach-specific profile fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'athlete' CHECK (role IN ('athlete', 'coxswain', 'coach'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS coach_city text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS coach_state text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS years_coaching int;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS coaching_level text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS side_preference text;

-- Migrate existing data
UPDATE profiles SET role = 'coxswain' WHERE is_coxswain = true AND (user_type IS DISTINCT FROM 'coach');
UPDATE profiles SET role = 'coach' WHERE user_type = 'coach';
-- Everyone else stays 'athlete' (the default)

-- Index for quick role lookups
CREATE INDEX IF NOT EXISTS profiles_role_idx ON profiles(role);
