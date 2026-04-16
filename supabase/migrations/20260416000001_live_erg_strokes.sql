-- Add stroke-by-stroke data and average watts to erg_workouts
ALTER TABLE erg_workouts ADD COLUMN IF NOT EXISTS stroke_data JSONB;
ALTER TABLE erg_workouts ADD COLUMN IF NOT EXISTS avg_watts INTEGER;
