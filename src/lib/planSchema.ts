/**
 * Shared readers for the generated training-plan JSON.
 *
 * workout_plans.workout_data looks like:
 *   { total_weeks, plan: [ { week, phase, days: [ { day_name, is_rest?,
 *                            required: {...} | null, optional: {...} | null } ] } ] }
 *
 * Session objects carry (as written by the generator today):
 *   title, description, session_type, zone, targetSplit, rate,
 *   warmup, cooldown, restPeriods
 *
 * Two things about the real data that these helpers exist to absorb:
 *
 * 1. `session_type` is NOT "erg"/"lift". Across the live plans it holds
 *    "steady state", "intervals", "lifting", "AT" or "UT2". Code that gated on
 *    `session_type === "erg"` therefore matched nothing and hid every detail.
 *
 * 2. Field casing is inconsistent between the generator and older uploads
 *    (targetSplit vs target_split, restPeriods vs rest_period), so every reader
 *    checks both.
 */

/**
 * Normalises a field to null when it carries no information. Lifting sessions
 * are written with the literal string "N/A" in zone, rate and targetSplit, which
 * would otherwise print as "N/A" in the plan tables.
 */
const value = (v: any): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return /^(n\/?a|none|-|—)$/i.test(s) ? null : s;
};

/** A lift/strength session rather than a rowing session. */
export const isLiftSession = (s: any): boolean =>
  !!s && /lift|strength|weight/i.test(String(s.session_type ?? ""));

const ZONE_PATTERN = /^(UT2|UT1|AT|TR|TR1|TR2|AN|R)$/i;

/**
 * Training zone for a session. Falls back to session_type when the generator
 * put the zone there instead of in `zone` (e.g. session_type: "UT2").
 */
export const sessionZone = (s: any): string | null => {
  if (!s) return null;
  const zone = value(s.zone);
  if (zone) return zone;
  const st = value(s.session_type);
  return st && ZONE_PATTERN.test(st) ? st : null;
};

/**
 * Human "pieces"/volume line, e.g. "3 x 20:00" or "10000m".
 *
 * Note: the current generator does not emit a `pieces` field at all — the
 * volume is embedded in `title` ("4x10min UT2"), which callers render
 * separately. This returns null in that case rather than duplicating the title.
 */
export const sessionPieces = (s: any): string | null => {
  if (!s) return null;
  const explicit = value(s.pieces);
  if (explicit) return explicit;
  const bits: string[] = [];
  if (s.duration) bits.push(String(s.duration));
  if (s.distance) bits.push(`${s.distance}m`);
  if (s.sets && s.reps) bits.push(`${s.sets}x${s.reps}`);
  return bits.length ? bits.join(" · ") : null;
};

/** Prescribed /500m split. */
export const sessionTargetSplit = (s: any): string | null =>
  value(s?.targetSplit) ?? value(s?.target_split);

/** Rest prescription between pieces. */
export const sessionRest = (s: any): string | null =>
  value(s?.restPeriods) ?? value(s?.rest_period) ?? value(s?.rest);

/** Stroke rate prescription. */
export const sessionRate = (s: any): string | null => value(s?.rate);

/** Warmup prescription. */
export const sessionWarmup = (s: any): string | null => value(s?.warmup);

/** Cooldown prescription. */
export const sessionCooldown = (s: any): string | null => value(s?.cooldown);

/** One-line label for a session, preferring the title. */
export const sessionTitle = (s: any): string =>
  (s?.title && String(s.title).trim()) ||
  (s?.description && String(s.description).trim()) ||
  "Session";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** "Monday" — from day_name, legacy `day`, or position in the week. */
export const dayDisplayName = (day: any, index: number): string => {
  if (typeof day?.day_name === "string" && day.day_name.trim()) return day.day_name.trim();
  if (typeof day?.day === "string" && day.day.trim()) return day.day.trim();
  if (typeof day?.day === "number") return WEEKDAYS[(day.day - 1) % 7] ?? `Day ${day.day}`;
  return WEEKDAYS[index % 7] ?? `Day ${index + 1}`;
};

/** True when the day is an explicit rest day or carries no required session. */
export const isRestDay = (day: any): boolean =>
  day?.is_rest === true || (day != null && !day.required && !day.workout && !day.ergWorkout);

export type PhaseSummary = { phase: string; weekNumbers: number[] };

/**
 * Contiguous phase blocks across the plan, for the printable summary —
 * e.g. [{ phase: "Base", weekNumbers: [1,2,3,4] }, { phase: "Build", ... }].
 */
export const phaseBreakdown = (weeks: any[]): PhaseSummary[] => {
  const out: PhaseSummary[] = [];
  (Array.isArray(weeks) ? weeks : []).forEach((w: any, i: number) => {
    const phase = (w?.phase && String(w.phase).trim()) || "Unspecified";
    const weekNo = typeof w?.week === "number" ? w.week : i + 1;
    const last = out[out.length - 1];
    if (last && last.phase === phase) last.weekNumbers.push(weekNo);
    else out.push({ phase, weekNumbers: [weekNo] });
  });
  return out;
};

/** "1–4" or "6" for a phase block. */
export const formatWeekRange = (weekNumbers: number[]): string => {
  if (weekNumbers.length === 0) return "";
  const first = weekNumbers[0];
  const last = weekNumbers[weekNumbers.length - 1];
  return first === last ? String(first) : `${first}–${last}`;
};
