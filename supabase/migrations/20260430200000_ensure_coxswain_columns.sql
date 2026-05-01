-- Ensure all coxswain and profile columns exist (idempotent)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_coxswain boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cox_weight_lbs numeric;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cox_experience text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cox_steering_pref text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cox_voice_level int;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cox_years_coxing int;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cox_notes text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS best_2k_seconds numeric;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS best_6k_seconds numeric;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS years_rowing int;
