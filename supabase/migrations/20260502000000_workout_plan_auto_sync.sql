-- Add workout_plan to boat_lineups (coach writes free-form plan when publishing)
ALTER TABLE boat_lineups ADD COLUMN IF NOT EXISTS workout_plan text;

-- Add last_auto_sync_at to whoop_connections (set by scheduled daily-whoop-sync only)
ALTER TABLE whoop_connections ADD COLUMN IF NOT EXISTS last_auto_sync_at timestamptz;

-- Update on_water_pieces piece_type to exactly 4 coxswain logging types
ALTER TABLE on_water_pieces DROP CONSTRAINT IF EXISTS on_water_pieces_piece_type_check;

-- Migrate existing data to new types before adding constraint
UPDATE on_water_pieces SET piece_type = 'race'       WHERE piece_type IN ('race_pace', 'race_simulation');
UPDATE on_water_pieces SET piece_type = 'intervals'  WHERE piece_type IN ('rate_work', 'starts');
UPDATE on_water_pieces SET piece_type = 'drills'     WHERE piece_type = 'technical';
-- steady_state stays as-is

ALTER TABLE on_water_pieces ADD CONSTRAINT on_water_pieces_piece_type_check
  CHECK (piece_type IN ('intervals', 'steady_state', 'drills', 'race'));

-- pg_cron: daily whoop auto-sync at 12:00 UTC (8am EST) and 13:00 UTC (8am CDT)
SELECT cron.schedule(
  'daily-whoop-sync-12utc',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://clmesnkdwohtvduzdgex.supabase.co/functions/v1/daily-whoop-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'daily-whoop-sync-13utc',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://clmesnkdwohtvduzdgex.supabase.co/functions/v1/daily-whoop-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
