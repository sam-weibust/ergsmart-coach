-- Add detailed metric columns to erg_workouts (from Concept2 detail API)
ALTER TABLE erg_workouts
  ADD COLUMN IF NOT EXISTS stroke_rate INTEGER,
  ADD COLUMN IF NOT EXISTS max_heart_rate INTEGER,
  ADD COLUMN IF NOT EXISTS min_heart_rate INTEGER,
  ADD COLUMN IF NOT EXISTS drag_factor INTEGER,
  ADD COLUMN IF NOT EXISTS cal_hour NUMERIC,
  ADD COLUMN IF NOT EXISTS work_per_stroke NUMERIC;

-- Per-split / per-interval data table
CREATE TABLE IF NOT EXISTS erg_workout_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID NOT NULL REFERENCES erg_workouts(id) ON DELETE CASCADE,
  split_number INTEGER NOT NULL,
  distance INTEGER,
  time_seconds NUMERIC,
  pace_deciseconds INTEGER,
  stroke_rate INTEGER,
  avg_stroke_rate INTEGER,
  calories INTEGER,
  cal_per_hour NUMERIC,
  heart_rate_avg INTEGER,
  heart_rate_min INTEGER,
  heart_rate_max INTEGER,
  drag_factor INTEGER,
  rest_time_seconds NUMERIC,
  finish BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workout_id, split_number)
);

CREATE INDEX IF NOT EXISTS idx_erg_workout_splits_workout_id ON erg_workout_splits(workout_id);

ALTER TABLE erg_workout_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own workout splits"
  ON erg_workout_splits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM erg_workouts
      WHERE erg_workouts.id = erg_workout_splits.workout_id
        AND erg_workouts.user_id = auth.uid()
    )
  );
