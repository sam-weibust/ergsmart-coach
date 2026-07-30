-- Live-erg (Bluetooth PM5) session metrics on erg_workouts.
--
-- Auto-saved BLE sessions record numeric elapsed time and peak power alongside
-- the existing INTERVAL duration column, so downstream queries do not have to
-- parse an interval to sort or aggregate.
--
-- The other metrics the live-erg save writes reuse existing columns:
--   min split          -> split_best            (INTERVAL, 20260418000009)
--   avg stroke rate    -> stroke_rate_average   (INTEGER,  20260418000010)
--   force curves       -> force_curves          (JSONB,    20260611000000)

ALTER TABLE public.erg_workouts
  ADD COLUMN IF NOT EXISTS elapsed_time INTEGER,   -- whole seconds
  ADD COLUMN IF NOT EXISTS max_watts    INTEGER;

COMMENT ON COLUMN public.erg_workouts.elapsed_time IS 'Total elapsed time in whole seconds (live-erg BLE sessions).';
COMMENT ON COLUMN public.erg_workouts.max_watts    IS 'Peak power observed during the session, watts.';
