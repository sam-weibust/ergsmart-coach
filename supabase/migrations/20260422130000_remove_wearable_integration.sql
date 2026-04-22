-- Remove wearable integration tables and columns.
-- The app now uses manual-only inputs for recovery tracking.

-- Drop wearable connections table (OAuth tokens, provider links)
DROP TABLE IF EXISTS public.wearable_connections CASCADE;

-- Remove wearable-tracking columns from sleep_entries
-- (source, wearable_updated_at, provider were added by the wearable migration)
ALTER TABLE public.sleep_entries
  DROP COLUMN IF EXISTS source,
  DROP COLUMN IF EXISTS wearable_updated_at,
  DROP COLUMN IF EXISTS provider;

-- Remove wearable-tracking columns from recovery_metrics
-- Keep the metric fields (hrv, resting_hr, etc.) for potential future manual use
-- but remove the wearable provenance columns
ALTER TABLE public.recovery_metrics
  DROP COLUMN IF EXISTS provider,
  DROP COLUMN IF EXISTS source,
  DROP COLUMN IF EXISTS wearable_updated_at;
