-- Add 'organizer' to the user_type check constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_type_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_user_type_check
  CHECK (user_type = ANY (ARRAY['rower','coach','coxswain','organizer']));

-- Also extend the role column check to include organizer
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['athlete','coxswain','coach','organizer']));

-- Sync organizer role column for any existing organizer user_type rows
UPDATE profiles SET role = 'organizer' WHERE user_type = 'organizer' AND role IS DISTINCT FROM 'organizer';
