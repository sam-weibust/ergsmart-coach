/**
 * Human-readable formatters for PM5 metrics.
 *
 * Extracted from LiveErgView so they can be unit-tested headlessly
 * (scripts/test/pm5-parse.ts) against known PM5 byte payloads.
 *
 * Unit conventions match src/lib/ble.ts (PM5StreamData):
 *   - times / paces arrive in centiseconds (0.01 s)
 *   - distance arrives in metres (already scaled from the 0.1 m wire units)
 *   - drive length arrives in centimetres
 */

// mm:ss.t  e.g. 3:42.5 — matches the PM5 elapsed-time readout.
export function fmtTime(cs: number): string {
  const s      = Math.floor(cs / 100);
  const tenths = Math.floor((cs % 100) / 10);
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}.${tenths}`;
  return `${m}:${String(sec).padStart(2,"0")}.${tenths}`;
}

// m:ss  e.g. 1:50 — the /500m split exactly as the PM5 shows it (no tenths).
export function fmtPace(cs: number): string {
  if (!cs || cs <= 0 || cs > 100000) return "--:--";
  const s   = Math.floor(cs / 100);
  const m   = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// Whole watts — never "200.00".
export function fmtWatts(w: number | null | undefined): string {
  if (!w || w <= 0) return "-- W";
  return `${Math.round(w)} W`;
}

// Whole spm — never "28.0".
export function fmtStrokeRate(spm: number | null | undefined): string {
  if (!spm || spm <= 0) return "-- spm";
  return `${Math.round(spm)} spm`;
}

/**
 * Distance in metres. The PM5 sends 0.1 m resolution, which is meaningful for
 * short pieces, so keep one decimal below 1 km and whole metres above it.
 */
export function fmtDistance(m: number | null | undefined): string {
  if (!m || m <= 0) return "--m";
  return m < 1000 ? `${m.toFixed(1)}m` : `${Math.round(m)}m`;
}

// 0.00s  e.g. 0.85s
export function fmtDriveTime(cs: number): string {
  if (!cs) return "--";
  return `${(cs / 100).toFixed(2)}s`;
}

// 0.00m  e.g. 1.23m
export function fmtDriveLength(cm: number): string {
  if (!cm) return "--";
  return `${(cm / 100).toFixed(2)}m`;
}

/** Parse a user-typed target split ("1:50", "2:00.5") into centiseconds. */
export function parseSplitInput(str: string): number | null {
  const match = str.match(/^(\d+):(\d{1,2}(?:\.\d)?)$/);
  if (!match) return null;
  const mins = parseInt(match[1], 10);
  const secs = parseFloat(match[2]);
  return Math.round((mins * 60 + secs) * 100); // centiseconds
}

/**
 * Centiseconds → a Postgres INTERVAL literal (HH:MM:SS.ss).
 *
 * Must be fully qualified: Postgres reads the bare '1:50' as 1 hour 50 minutes,
 * so writing a display string like fmtPace() output into an INTERVAL column
 * stores a value ~60x too large.
 */
export function csToInterval(cs: number): string {
  const total = Math.max(0, cs) / 100;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

// ── Live landscape view helpers ──────────────────────────────────────────────
// Added for the landscape LiveErgView rebuild. Pure functions so the projected
// finish maths and the force-curve scores can be reasoned about (and tested)
// without a PM5 on the other end of a Bluetooth link.

/** Seconds of elapsed time below which a projection is pure noise. */
export const PROJECTION_MIN_ELAPSED_SEC = 3;

/** m:ss (or h:mm:ss) from whole seconds. Returns "—" for anything unusable. */
export function fmtClock(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return "—";
  const s   = Math.round(totalSeconds);
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * Projected finish time (seconds) for a DISTANCE target.
 *
 *   ((target - dist) * splitSeconds / 500) + elapsedSeconds
 *
 * Returns null — never Infinity/NaN — when the inputs cannot support a
 * projection: no target, the first few seconds of a piece, a zero/absurd split.
 */
export function projectedFinishSeconds(
  targetMeters: number | null | undefined,
  distanceMeters: number | null | undefined,
  splitCs: number | null | undefined,
  elapsedCs: number | null | undefined,
): number | null {
  if (targetMeters == null || !Number.isFinite(targetMeters) || targetMeters <= 0) return null;
  const elapsedSec = (elapsedCs ?? 0) / 100;
  if (!Number.isFinite(elapsedSec) || elapsedSec < PROJECTION_MIN_ELAPSED_SEC) return null;
  const dist = distanceMeters ?? 0;
  if (!Number.isFinite(dist) || dist < 0) return null;

  const remaining = targetMeters - dist;
  if (remaining <= 0) return elapsedSec;          // already there — it *is* the finish

  const splitSec = (splitCs ?? 0) / 100;
  if (!Number.isFinite(splitSec) || splitSec <= 0 || splitSec > 1000) return null;

  const total = elapsedSec + (remaining * splitSec) / 500;
  if (!Number.isFinite(total) || total > 24 * 3600) return null;
  return total;
}

/**
 * Projected distance (metres) for a TIME target.
 *
 *   dist + (dist / elapsedSeconds) * remainingSeconds
 *
 * Guards the elapsed≈0 divide-by-zero and returns null instead of Infinity.
 */
export function projectedDistanceMeters(
  targetSeconds: number | null | undefined,
  distanceMeters: number | null | undefined,
  elapsedCs: number | null | undefined,
): number | null {
  if (targetSeconds == null || !Number.isFinite(targetSeconds) || targetSeconds <= 0) return null;
  const elapsedSec = (elapsedCs ?? 0) / 100;
  if (!Number.isFinite(elapsedSec) || elapsedSec < PROJECTION_MIN_ELAPSED_SEC) return null;
  const dist = distanceMeters ?? 0;
  if (!Number.isFinite(dist) || dist <= 0) return null;

  const remaining = targetSeconds - elapsedSec;
  if (remaining <= 0) return dist;

  const rate = dist / elapsedSec;                 // m/s — elapsedSec >= 3 here
  if (!Number.isFinite(rate) || rate <= 0) return null;

  const projected = dist + rate * remaining;
  return Number.isFinite(projected) ? projected : null;
}

/**
 * Drive efficiency, 0–100: mean force as a percentage of peak force.
 *
 * A rectangular ("fill the boat early and hold it") curve scores high; a
 * spiky curve that reaches a big peak and collapses scores low. Null when the
 * curve is too short or flat to say anything.
 */
export function driveEfficiencyScore(curve: number[] | null | undefined): number | null {
  if (!curve || curve.length < 3) return null;
  const clean = curve.filter(v => Number.isFinite(v) && v >= 0);
  if (clean.length < 3) return null;
  const peak = Math.max(...clean);
  if (peak <= 0) return null;
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  return Math.max(0, Math.min(100, Math.round((mean / peak) * 100)));
}

/**
 * Catch slip: the fraction of the drive that goes by before force reaches 25%
 * of peak. Above ~0.2 the handle is being pulled through water that hasn't
 * been caught yet. Null when the curve is too short to judge.
 */
export function catchSlipRatio(curve: number[] | null | undefined): number | null {
  if (!curve || curve.length < 5) return null;
  const peak = Math.max(...curve);
  if (!Number.isFinite(peak) || peak <= 0) return null;
  const threshold = peak * 0.25;
  let i = 0;
  while (i < curve.length && curve[i] < threshold) i++;
  return i / curve.length;
}

/** Threshold above which catchSlipRatio() counts as a slipped catch. */
export const CATCH_SLIP_THRESHOLD = 0.2;

/** Local (not UTC) calendar date as YYYY-MM-DD for workout_date. */
export function localDateISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}
