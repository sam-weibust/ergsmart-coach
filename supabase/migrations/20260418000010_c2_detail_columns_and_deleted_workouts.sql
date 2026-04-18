-- Add missing detail columns to erg_workouts (from actual Concept2 API field names)
ALTER TABLE erg_workouts
  ADD COLUMN IF NOT EXISTS time_formatted TEXT,
  ADD COLUMN IF NOT EXISTS calories_total INTEGER,
  ADD COLUMN IF NOT EXISTS stroke_count INTEGER,
  ADD COLUMN IF NOT EXISTS stroke_rate_average INTEGER,
  ADD COLUMN IF NOT EXISTS heart_rate_average INTEGER,
  ADD COLUMN IF NOT EXISTS heart_rate_min INTEGER,
  ADD COLUMN IF NOT EXISTS heart_rate_max INTEGER,
  ADD COLUMN IF NOT EXISTS rest_distance INTEGER,
  ADD COLUMN IF NOT EXISTS rest_time_seconds NUMERIC,
  ADD COLUMN IF NOT EXISTS workout_data JSONB,
  ADD COLUMN IF NOT EXISTS real_time_data JSONB;

-- Allow users to delete their own erg_workouts via the frontend
DO $$ BEGIN
  CREATE POLICY "Users can delete own erg workouts"
    ON erg_workouts FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Track workouts manually deleted by the athlete so the sync never re-imports them
CREATE TABLE IF NOT EXISTS deleted_c2_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  external_id TEXT NOT NULL,
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, external_id)
);

ALTER TABLE deleted_c2_workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own deleted workout records"
  ON deleted_c2_workouts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
