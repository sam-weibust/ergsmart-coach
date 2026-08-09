/**
 * Date anchoring for generated training plans.
 *
 * A plan's `workout_data` is `weeks[] -> days[]` and the days are labelled
 * "Monday" … "Sunday". Before `workout_plans.start_date` existed the UI derived
 * each session's real date from `created_at + weekIndex*7 + dayIndex`, so unless
 * the plan happened to be generated on a Monday every cell was 1-6 days out of
 * step with its own label.
 *
 * `planStartDate()` is the single source of truth used by PlanCalendarView, the
 * .ics export and PerformanceTab so the three can never drift apart.
 */

export interface PlanDateSource {
  start_date?: string | null;
  created_at?: string | null;
}

/**
 * Parse a Postgres `date` column ("YYYY-MM-DD") as LOCAL midnight.
 *
 * `new Date("2026-08-03")` is parsed as UTC midnight, which lands on Aug 2 for
 * anyone west of Greenwich — a whole-day-off bug in every western timezone.
 */
export function parseDateOnly(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Monday of the ISO week containing `d`, at local midnight. */
export function mondayOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // getDay(): 0=Sun … 6=Sat. (dow + 6) % 7 == days elapsed since Monday.
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}

/**
 * Local-midnight Date that week 1 / day 0 of the plan falls on.
 *
 * Prefers the explicit `start_date` column; falls back to the Monday of the
 * week the plan was created in (which is exactly what the backfill migration
 * 20260802000000 wrote for pre-existing rows), then to this week's Monday.
 */
export function planStartDate(plan: PlanDateSource | null | undefined): Date {
  if (plan?.start_date) {
    const explicit = parseDateOnly(plan.start_date);
    if (explicit) return explicit;
  }
  const created = plan?.created_at ? new Date(plan.created_at) : new Date();
  return mondayOfWeek(Number.isNaN(created.getTime()) ? new Date() : created);
}

/** Real calendar date of `dayIndex` in `weekIndex` (both 0-based). */
export function planDayDate(
  plan: PlanDateSource | null | undefined,
  weekIndex: number,
  dayIndex: number,
): Date {
  const d = planStartDate(plan);
  d.setDate(d.getDate() + weekIndex * 7 + dayIndex);
  return d;
}

/**
 * 0-based index of the week the plan is currently in, clamped to the plan
 * length. Anchored to `start_date`, so "week 1" only advances on Mondays.
 */
export function planCurrentWeekIndex(
  plan: PlanDateSource | null | undefined,
  weekCount: number,
): number {
  if (weekCount <= 0) return 0;
  const start = planStartDate(plan).getTime();
  const elapsed = Math.floor((Date.now() - start) / (7 * 24 * 60 * 60 * 1000));
  return Math.min(Math.max(elapsed, 0), weekCount - 1);
}

/** Local YYYY-MM-DD (never the UTC shift `toISOString()` would apply). */
export function localISODate(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}
