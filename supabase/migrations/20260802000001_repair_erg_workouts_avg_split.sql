-- ─────────────────────────────────────────────────────────────────────────────
-- REPAIR: erg_workouts.avg_split interval corruption
--
-- erg_workouts.avg_split is INTERVAL (20251105205603_...:54). Several writers
-- passed a *display* string such as '1:50' straight into the column. Postgres
-- reads a bare 'H:MM' interval literal as HOURS:MINUTES, so '1:50' was stored as
-- 01:50:00 (1 h 50 m) instead of 00:01:50 — exactly 60x too large.
--
-- Affected writers (all fixed in the same change set):
--   RaceSection.tsx        avg_split: fmtPace(avgSplitCs)
--   DeviceSection.tsx      avg_split: formatPace(avgSplitCs)
--   MultiPieceSession.tsx  avg_split: fmt(...)          (piece + summary rows)
--   ErgWorkoutSection.tsx  avg_split: raw user text
-- LiveErgView.tsx was already correct (csToInterval → '00:01:50.00').
--
-- ── SANITY CHECK (SELECT only — run this BEFORE applying) ───────────────────
--
--   SELECT count(*) AS rows_that_would_change,
--          min(avg_split) AS smallest,
--          max(avg_split) AS largest
--   FROM public.erg_workouts
--   WHERE avg_split IS NOT NULL
--     AND avg_split >= interval '20 minutes'
--     AND avg_split <  interval '10 hours';
--
--   -- Spot-check the before/after pairs:
--   SELECT id, workout_date, workout_type, distance,
--          avg_split AS before, avg_split / 60 AS after
--   FROM public.erg_workouts
--   WHERE avg_split >= interval '20 minutes'
--     AND avg_split <  interval '10 hours'
--   ORDER BY workout_date DESC
--   LIMIT 50;
--
-- ── WHY THESE BOUNDS ────────────────────────────────────────────────────────
-- Lower bound 20 minutes: a /500m split is never anywhere near 20:00. The PM5
--   itself cannot display a pace slower than 9:59.9, and the slowest plausible
--   human split is well under 4 minutes. Anything >= 20 minutes is unambiguously
--   a 60x mis-parse, never real data.
-- Upper bound 10 hours: the corrupt values are mis-read 'M:SS' strings, so the
--   largest one possible is 9:59 -> 09:59:00. Anything above 10 hours is not a
--   product of this bug and is left alone for manual inspection.
--
-- ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
-- After the divide, every repaired row is < 10 minutes, i.e. outside the WHERE
-- clause. Re-running this migration is a guaranteed no-op.
--
-- NOTE: erg_workouts.duration is ALSO an INTERVAL fed display strings by the
-- same writers (now fixed to csToInterval / HH:MM:SS). It is deliberately NOT
-- repaired here: a genuine 1 h 30 m long row and a corrupted '1:30' are
-- indistinguishable after the fact, so an automated repair would destroy real
-- data. Only avg_split has an unambiguous plausibility window.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.erg_workouts
SET avg_split = avg_split / 60
WHERE avg_split IS NOT NULL
  AND avg_split >= interval '20 minutes'
  AND avg_split <  interval '10 hours';
