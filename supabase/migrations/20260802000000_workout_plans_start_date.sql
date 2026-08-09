-- ─────────────────────────────────────────────────────────────────────────────
-- workout_plans.start_date
--
-- Problem: the training-plan calendar (PlanCalendarView, PerformanceTab and the
-- .ics export) computed each session's date as `created_at + week*7 + dayIndex`.
-- Plan JSON labels its days "Monday"…"Sunday", so unless the plan happened to be
-- generated on a Monday every single day cell was off by 1-6 days.
--
-- Fix: give plans an explicit anchor. `start_date` is always the MONDAY that
-- begins week 1 of the plan. New plans write it at creation time; existing rows
-- are backfilled to the Monday of the week they were created in.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + a backfill that only touches NULLs.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.workout_plans
  ADD COLUMN IF NOT EXISTS start_date date;

COMMENT ON COLUMN public.workout_plans.start_date IS
  'Monday of week 1 of the plan. Day N of week W falls on start_date + (W*7 + N) days. Falls back to date_trunc(''week'', created_at) when null.';

-- ── Sanity check (SELECT only — run this first to see the blast radius) ──────
--
--   SELECT count(*) AS rows_to_backfill
--   FROM public.workout_plans
--   WHERE start_date IS NULL;
--
-- ─────────────────────────────────────────────────────────────────────────────

-- date_trunc('week', ts) returns the Monday 00:00 of that ISO week in Postgres.
UPDATE public.workout_plans
SET start_date = (date_trunc('week', COALESCE(created_at, now())))::date
WHERE start_date IS NULL;

CREATE INDEX IF NOT EXISTS workout_plans_user_start_date_idx
  ON public.workout_plans (user_id, start_date DESC);
