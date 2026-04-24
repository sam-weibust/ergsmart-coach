/**
 * Returns today's date as YYYY-MM-DD in the user's local timezone.
 * Uses `toLocaleDateString('en-CA')` which always returns YYYY-MM-DD.
 * Unlike `toISOString().split('T')[0]`, this never returns yesterday's date
 * for users west of UTC after midnight.
 */
export function getLocalDate(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA");
}

/**
 * Returns a date N days before today in local timezone.
 */
export function getLocalDateDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return getLocalDate(d);
}
