/**
 * CrewSync design system — TypeScript mirror of src/styles/design-tokens.css.
 *
 * Use these for inline styles, chart colors (recharts stroke/fill), canvas
 * drawing (force curves), and any JS logic that picks a color by value (e.g.
 * recovery score thresholds). CSS should read the CSS custom properties
 * directly (var(--surface-2), the text-xs/sm/base/... utility classes, etc.)
 * rather than importing this file — it exists for the places CSS can't reach.
 *
 * Keep in sync with design-tokens.css by hand; there is no build step that
 * generates one from the other.
 */

export const colors = {
  canvas: "#08121F",
  surface1: "#0D1929",
  surface2: "#132036",
  surface3: "#1A2C47",
  border: "rgba(255,255,255,0.07)",
  borderStrong: "rgba(255,255,255,0.14)",
  textPrimary: "#FFFFFF",
  textSecondary: "#8A9FBB",
  textTertiary: "#4E6580",
  accent: "#2272FF",
  accentHover: "#3A80FF",
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
  dangerSubtle: "rgba(239,68,68,0.12)",
} as const;

export const spacing = {
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  6: "24px",
  8: "32px",
  12: "48px",
  16: "64px",
} as const;

export const radius = {
  sm: "4px",
  md: "6px",
  lg: "8px",
  xl: "12px",
  pill: "9999px",
} as const;

export const motion = {
  fast: "120ms",
  base: "200ms",
  slow: "300ms",
  ease: "ease",
} as const;

export const typeScale = {
  xs: { size: "11px", weight: 500, lineHeight: 1.4, tracking: "0.06em" },
  sm: { size: "13px", weight: 400, lineHeight: 1.5 },
  base: { size: "15px", weight: 400, lineHeight: 1.6 },
  lg: { size: "17px", weight: 500, lineHeight: 1.5 },
  xl: { size: "20px", weight: 600, lineHeight: 1.3 },
  "2xl": { size: "24px", weight: 700, lineHeight: 1.2 },
  "3xl": { size: "32px", weight: 700, lineHeight: 1.1 },
  display: { size: "48px", weight: 700, lineHeight: 1.0 },
} as const;

export const fontFamily =
  "'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/**
 * Recovery score color, per the Me tab spec: green above 70, yellow 40–70,
 * red below 40.
 */
export function recoveryColor(score: number): string {
  if (score > 70) return colors.success;
  if (score >= 40) return colors.warning;
  return colors.danger;
}
