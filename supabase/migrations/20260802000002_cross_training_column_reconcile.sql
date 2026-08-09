-- ─────────────────────────────────────────────────────────────────────────────
-- RECONCILE: public.cross_training has two conflicting CREATE TABLE definitions
--
--   20260424000003_healthkit_tables.sql:22  CREATE TABLE IF NOT EXISTS ...
--       (duration_minutes, calories, distance_meters, heart_rate_max, source)
--   20260428000002_cross_training.sql:1     CREATE TABLE IF NOT EXISTS ...
--       (distance, distance_unit, duration_seconds, notes)
--
-- Because both use IF NOT EXISTS and the HealthKit migration sorts FIRST, the
-- live table is the HealthKit shape and the second migration is a silent no-op.
-- CrossTrainingSection.tsx inserts distance / distance_unit / duration_seconds /
-- notes, so every manual cross-training log fails with
-- `column "distance" of relation "cross_training" does not exist`.
--
-- This migration makes the table a superset of both shapes so either writer
-- works. Fully idempotent (ADD COLUMN IF NOT EXISTS / guarded DEFAULT).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.cross_training
  ADD COLUMN IF NOT EXISTS distance         numeric,
  ADD COLUMN IF NOT EXISTS distance_unit    text NOT NULL DEFAULT 'mi',
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS notes            text,
  -- present in the HealthKit shape only; added here so the union is stable
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS calories         integer,
  ADD COLUMN IF NOT EXISTS distance_meters  integer,
  ADD COLUMN IF NOT EXISTS heart_rate_average integer,
  ADD COLUMN IF NOT EXISTS heart_rate_max   integer,
  ADD COLUMN IF NOT EXISTS source           text DEFAULT 'manual';

-- The HealthKit shape declares `date` with no default; the manual logger relies
-- on one existing when the field is omitted.
ALTER TABLE public.cross_training
  ALTER COLUMN date SET DEFAULT current_date;

-- ── SANITY CHECK (SELECT only) ──────────────────────────────────────────────
--   SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'cross_training'
--   ORDER BY ordinal_position;
-- ─────────────────────────────────────────────────────────────────────────────

-- RLS is already enabled and both definitions installed an equivalent
-- FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
-- policy, so no policy change is required here.
