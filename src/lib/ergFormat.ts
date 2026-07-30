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

/** Local (not UTC) calendar date as YYYY-MM-DD for workout_date. */
export function localDateISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}
