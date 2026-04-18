-- Growth features: directory, referrals, personal records

-- Add directory fields to teams
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS directory_opt_in boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS division text,
  ADD COLUMN IF NOT EXISTS program_type text,
  ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS athlete_count integer DEFAULT 0;

-- Referrals table
CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  referred_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  referrer_code text NOT NULL,
  created_at timestamptz DEFAULT now(),
  rewarded_at timestamptz
);

-- Personal records table
CREATE TABLE IF NOT EXISTS personal_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  distance_label text NOT NULL,
  time_seconds numeric NOT NULL,
  split_seconds numeric,
  watts numeric,
  stroke_rate integer,
  set_at date NOT NULL DEFAULT CURRENT_DATE,
  previous_time_seconds numeric,
  improvement_seconds numeric,
  erg_workout_id uuid,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_records ENABLE ROW LEVEL SECURITY;

-- Referrals policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='referrals' AND policyname='referrals_select') THEN
    CREATE POLICY "referrals_select" ON referrals
      FOR SELECT USING (auth.uid() = referrer_user_id OR auth.uid() = referred_user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='referrals' AND policyname='referrals_insert') THEN
    CREATE POLICY "referrals_insert" ON referrals
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='referrals' AND policyname='referrals_update') THEN
    CREATE POLICY "referrals_update" ON referrals
      FOR UPDATE USING (auth.uid() = referrer_user_id);
  END IF;
END $$;

-- Personal records policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='personal_records' AND policyname='pr_select') THEN
    CREATE POLICY "pr_select" ON personal_records
      FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='personal_records' AND policyname='pr_all') THEN
    CREATE POLICY "pr_all" ON personal_records
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals(referrer_user_id);
CREATE INDEX IF NOT EXISTS referrals_code_idx ON referrals(referrer_code);
CREATE INDEX IF NOT EXISTS pr_user_idx ON personal_records(user_id);
CREATE INDEX IF NOT EXISTS pr_user_distance_idx ON personal_records(user_id, distance_label);
