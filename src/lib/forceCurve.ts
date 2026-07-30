/**
 * Force-curve presentation helpers shared by LiveErgView's compact area chart
 * and the headless tests in scripts/test/force-curve.ts.
 * Pure — no React, no BLE, no DOM.
 */

/** Baseline top of the force axis in newtons. Peaks above this grow the axis. */
export const FORCE_AXIS_BASE_MAX = 800;

/** Points used for the flat baseline shown before any stroke arrives. */
export const FORCE_AXIS_EMPTY_POINTS = 20;

export interface ForcePoint {
  idx: number;   // sample index within the drive
  force: number; // newtons
}

/**
 * Chart rows for a parsed force curve. When no curve has arrived yet, returns a
 * flat zero baseline so the panel reads as "waiting", not as a broken chart.
 */
export function buildForceCurveAreaData(curve: number[]): ForcePoint[] {
  if (curve.length > 0) return curve.map((force, i) => ({ idx: i, force }));
  return Array.from({ length: FORCE_AXIS_EMPTY_POINTS }, (_, i) => ({ idx: i, force: 0 }));
}

/**
 * Upper bound for the force axis. Recharts *clamps* samples that fall outside
 * the Y domain to the edge of the plot, so a hard-coded 800 N ceiling silently
 * flattens the top of a strong athlete's stroke into a plateau. Keep 800 N as
 * the floor (so ordinary strokes stay comparable between screens) and round up
 * to the next 100 N above that when the stroke is bigger.
 */
export function forceCurveAxisMax(dataMax: number): number {
  if (!Number.isFinite(dataMax) || dataMax <= FORCE_AXIS_BASE_MAX) return FORCE_AXIS_BASE_MAX;
  return Math.ceil(dataMax / 100) * 100;
}
