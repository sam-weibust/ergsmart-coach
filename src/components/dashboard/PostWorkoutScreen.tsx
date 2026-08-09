/**
 * PostWorkoutScreen — the full-screen summary an athlete sees the moment a
 * Bluetooth erg session ends.
 *
 * Owned by this file only. LiveErgView mounts it; it never mutates anything —
 * the workout row has already been inserted by the caller, so "Save to History"
 * is a confirmation, not a write.
 *
 * Design: whoop system as adapted in src/index.css (white surface, navy #1a1a2e
 * ink/accent, 4px grid, system shadow tokens). Charts follow the dataviz rules:
 * one measure per chart, 2px lines, hairline recessive grid, ~10% area wash,
 * no dual axes, no dot on every point, axis text in text tokens (never the
 * series color).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  HeartPulse,
  Loader2,
  Share2,
  Sparkles,
} from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { invokeAI } from "@/lib/aiInvoke";
import { supabase } from "@/integrations/supabase/client";
import { WorkoutShareCard } from "./WorkoutShareCard";

// ─────────────────────────────────────────────────────────────────────────────
// Props — fixed contract. LiveErgView is coded against this exact shape.
// ─────────────────────────────────────────────────────────────────────────────

export interface PostWorkoutStroke {
  split: number | null;
  watts: number | null;
  hr: number | null;
  /** elapsed seconds since the piece started */
  t: number;
}

export interface PostWorkoutScreenProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  workoutId: string | null;
  /** the erg_workouts row that was inserted */
  row: any;
  strokes: PostWorkoutStroke[];
  /** one array of force samples (Newtons) per stroke */
  forceCurves: number[][];
  userId: string;
}

/** AI feedback shape returned by the analyze-workout edge function. */
interface AIFeedback {
  overallRating?: "excellent" | "good" | "average" | "needs_improvement";
  summary?: string;
  strengths?: string[];
  improvements?: string[];
  recommendation?: string;
  motivationalMessage?: string;
  progressNote?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart tokens — every value traces back to a design token in src/index.css.
// ─────────────────────────────────────────────────────────────────────────────

const INK = "hsl(var(--foreground))";        // navy — the single series hue
const HR_RED = "hsl(var(--destructive))";    // HR is required to read red
const AXIS = "hsl(var(--muted-foreground))";
const GRID = "hsl(var(--border))";
const SURFACE = "hsl(var(--background))";

const axisTick = { fill: AXIS, fontSize: 11 } as const;
const tooltipStyle = {
  background: SURFACE,
  border: "1px solid hsl(var(--border))",
  borderRadius: 6,
  fontSize: 12,
  color: INK,
  boxShadow: "var(--shadow-floating)",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Unit + format helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Splits reach this screen either as seconds per 500 m (~60–300) or, when they
 * come straight off the PM5 wire, as centiseconds (~6000–30000). A real 500 m
 * split is never 1000 s, so the threshold disambiguates safely.
 */
function splitToSeconds(v: number | null | undefined): number | null {
  if (v == null || !isFinite(v) || v <= 0) return null;
  const s = v > 1000 ? v / 100 : v;
  return s >= 30 && s <= 900 ? s : null;
}

/** m:ss.t — the /500 m split as the PM5 shows it. */
function fmtSplit(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec) || sec <= 0) return "--:--";
  const m = Math.floor(sec / 60);
  const rest = sec - m * 60;
  return `${m}:${rest.toFixed(1).padStart(4, "0")}`;
}

/** m:ss (no tenths) — for axis ticks, where tenths are noise. */
function fmtSplitShort(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec - m * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** h:mm:ss / m:ss elapsed time. */
function fmtElapsed(totalSec: number | null | undefined): string {
  if (totalSec == null || !isFinite(totalSec) || totalSec <= 0) return "--:--";
  const s = Math.round(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Postgres INTERVAL "HH:MM:SS[.ss]" (or "MM:SS") → seconds. */
function parseInterval(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const parts = v.split(":").map(Number);
  if (parts.some(n => !isFinite(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && isFinite(n) ? n : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Force-curve math — every metric defined here so the numbers are auditable.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resample a curve to exactly `n` points with linear interpolation.
 * Index i maps to position t = i/(n-1) * (len-1) on the source curve; the value
 * is the linear blend of the two neighbouring samples.
 */
function resampleLinear(curve: number[], n: number): number[] {
  if (n <= 0) return [];
  if (curve.length === 0) return new Array(n).fill(0);
  if (curve.length === 1) return new Array(n).fill(curve[0]);
  if (curve.length === n) return curve.slice();
  return Array.from({ length: n }, (_, i) => {
    const t = (i / (n - 1)) * (curve.length - 1);
    const lo = Math.floor(t);
    const hi = Math.min(lo + 1, curve.length - 1);
    return curve[lo] + (curve[hi] - curve[lo]) * (t - lo);
  });
}

interface ForceMetrics {
  /** the pointwise mean curve, on a common sample grid */
  avgCurve: number[];
  /** number of strokes that contributed */
  strokeCount: number;
  /** max of the average curve, Newtons */
  peakForceN: number;
  /** index of the peak, as a % of the drive (0–100) */
  timeToPeakPct: number;
  /** impulse fullness, 0–100 */
  driveEfficiency: number;
  /** true when force loads slowly off the catch */
  catchSlip: boolean;
  /** % of drive elapsed before force first reaches 50% of peak */
  halfPeakPct: number;
}

/** A drive is a slow load if it takes more than this share of the drive to hit 50% of peak. */
const CATCH_SLIP_THRESHOLD_PCT = 25;

/** Drive efficiency at or above this reads as a full, well-supported drive. */
const DRIVE_EFFICIENCY_GOOD = 55;

function computeForceMetrics(forceCurves: number[][]): ForceMetrics | null {
  const usable = forceCurves.filter(c => Array.isArray(c) && c.length >= 3);
  if (!usable.length) return null;

  // Strokes differ in sample count (drive length varies), so put every stroke
  // on one common grid before averaging. 40 points is finer than the PM5's
  // typical ~20–33 samples per drive, so nothing real is lost.
  const GRID_N = 40;
  const normalized = usable.map(c => resampleLinear(c.map(v => Math.max(0, num(v) ?? 0)), GRID_N));
  const avgCurve = Array.from({ length: GRID_N }, (_, i) =>
    normalized.reduce((s, c) => s + c[i], 0) / normalized.length,
  );

  const peakForceN = Math.max(...avgCurve);
  if (!(peakForceN > 0)) return null;

  const peakIdx = avgCurve.indexOf(peakForceN);

  // ── Time to Peak ──────────────────────────────────────────────────────────
  // Position of the peak expressed as a percentage of the drive:
  //   timeToPeak% = peakIndex / (N - 1) * 100
  // A strong sequenced drive peaks early (roughly 25–40%); a late peak means
  // the athlete is pulling with the arms before the legs have finished.
  const timeToPeakPct = (peakIdx / (GRID_N - 1)) * 100;

  // ── Drive Efficiency ──────────────────────────────────────────────────────
  // "Fullness" of the curve: the impulse actually produced divided by the
  // impulse of a perfect rectangle at peak force over the same drive.
  //   efficiency = (∫ F dt) / (peakForce × driveDuration) × 100
  // Integrated with the trapezoidal rule on the normalized grid, where each
  // step is 1/(N-1) of the drive, so the duration term cancels to 1.
  // 100 = force held at peak for the whole drive (physically unreachable);
  // a sharp spike scores low, a broad plateau scores high. A pure Gaussian
  // "textbook" drive scores ≈ 53; real, well-sequenced PM5 curves plateau and
  // land ≈ 55–70, so DRIVE_EFFICIENCY_GOOD is set at 55.
  let trapz = 0;
  for (let i = 1; i < GRID_N; i++) {
    trapz += ((avgCurve[i - 1] + avgCurve[i]) / 2) * (1 / (GRID_N - 1));
  }
  const driveEfficiency = Math.max(0, Math.min(100, (trapz / peakForceN) * 100));

  // ── Catch Slip ────────────────────────────────────────────────────────────
  // How much of the drive goes by before force first reaches half of peak:
  //   halfPeak% = firstIndex(F >= 0.5 × peak) / (N - 1) * 100
  // Water (or the flywheel) is being "slipped" at the catch when the load
  // builds late — past 25% of the drive the legs have already started moving
  // before the handle is loaded.
  let halfIdx = avgCurve.findIndex(v => v >= peakForceN * 0.5);
  if (halfIdx < 0) halfIdx = peakIdx;
  const halfPeakPct = (halfIdx / (GRID_N - 1)) * 100;
  const catchSlip = halfPeakPct > CATCH_SLIP_THRESHOLD_PCT;

  return {
    avgCurve,
    strokeCount: usable.length,
    peakForceN,
    timeToPeakPct,
    driveEfficiency,
    catchSlip,
    halfPeakPct,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Small presentational pieces
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  unit,
  tone = "default",
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-floating)]">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className="mt-2 font-mono text-3xl font-bold leading-none tabular-nums"
        style={{ color: tone === "danger" ? HR_RED : INK }}
      >
        {value}
        {unit ? <span className="ml-1 text-sm font-semibold text-muted-foreground">{unit}</span> : null}
      </p>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-floating)]">
      <header className="mb-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">{title}</h3>
        {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}

function EmptyState({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex h-[180px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border px-4 text-center">
      {icon}
      <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

function MetricCell({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "warn";
}) {
  const color =
    tone === "good" ? "hsl(var(--success))" : tone === "warn" ? "hsl(var(--warning))" : INK;
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-mono text-xl font-bold tabular-nums" style={{ color }}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-[10px] leading-tight text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function PostWorkoutScreen({
  open,
  onOpenChange,
  workoutId,
  row,
  strokes,
  forceCurves,
  userId,
}: PostWorkoutScreenProps) {
  const { toast } = useToast();

  const [aiState, setAiState] = useState<"idle" | "loading" | "done" | "error" | "skipped">("idle");
  const [feedback, setFeedback] = useState<AIFeedback | null>(null);
  const [feedbackText, setFeedbackText] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const [saveConfirmed, setSaveConfirmed] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [athleteName, setAthleteName] = useState("Athlete");

  // ── Derived summary ────────────────────────────────────────────────────────

  const safeStrokes = useMemo(
    () => (Array.isArray(strokes) ? strokes.filter(s => s && isFinite(s.t)) : []),
    [strokes],
  );
  const safeCurves = useMemo(
    () => (Array.isArray(forceCurves) ? forceCurves.filter(Array.isArray) : []),
    [forceCurves],
  );

  const summary = useMemo(() => {
    const r = row ?? {};

    const distance = num(r.distance) ?? num(r.total_meters) ?? 0;
    const elapsed =
      num(r.elapsed_time) ??
      parseInterval(r.duration) ??
      (safeStrokes.length ? safeStrokes[safeStrokes.length - 1].t : 0) ??
      0;

    const splitSeries = safeStrokes
      .map(s => splitToSeconds(s.split))
      .filter((v): v is number => v != null);
    const wattSeries = safeStrokes
      .map(s => num(s.watts))
      .filter((v): v is number => v != null && v > 0);
    const hrSeries = safeStrokes
      .map(s => num(s.hr))
      .filter((v): v is number => v != null && v >= 40 && v <= 220);

    // Row values win (they were computed over every PM5 frame, not just the
    // per-stroke samples); the stroke series is the fallback.
    const avgSplit =
      parseInterval(r.avg_split) ??
      num(r.avg_split_seconds) ??
      mean(splitSeries) ??
      (distance > 0 && elapsed > 0 ? (elapsed / distance) * 500 : null);

    const avgWatts = num(r.avg_watts) ?? mean(wattSeries);
    const avgSpm = num(r.stroke_rate_average) ?? num(r.stroke_rate);
    const maxHr = num(r.heart_rate_max) ?? num(r.max_heart_rate) ?? (hrSeries.length ? Math.max(...hrSeries) : null);
    const minHr = num(r.heart_rate_min) ?? num(r.min_heart_rate) ?? (hrSeries.length ? Math.min(...hrSeries) : null);

    const dateStr = (() => {
      const raw = r.workout_date ?? r.created_at;
      const d = raw ? new Date(String(raw)) : new Date();
      return isNaN(d.getTime())
        ? new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
        : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    })();

    return { distance, elapsed, avgSplit, avgWatts, avgSpm, maxHr, minHr, hrCount: hrSeries.length, dateStr };
  }, [row, safeStrokes]);

  const force = useMemo(() => computeForceMetrics(safeCurves), [safeCurves]);

  // ── Chart series ───────────────────────────────────────────────────────────

  const hrData = useMemo(
    () =>
      safeStrokes
        .map(s => ({ t: s.t, hr: num(s.hr) }))
        .filter((d): d is { t: number; hr: number } => d.hr != null && d.hr >= 40 && d.hr <= 220),
    [safeStrokes],
  );

  const splitData = useMemo(
    () =>
      safeStrokes
        .map((s, i) => ({ n: i + 1, t: s.t, split: splitToSeconds(s.split) }))
        .filter((d): d is { n: number; t: number; split: number } => d.split != null),
    [safeStrokes],
  );

  const wattsData = useMemo(
    () =>
      safeStrokes
        .map((s, i) => ({ n: i + 1, t: s.t, watts: num(s.watts) }))
        .filter((d): d is { n: number; t: number; watts: number } => d.watts != null && d.watts > 0),
    [safeStrokes],
  );

  const forceAreaData = useMemo(
    () =>
      force
        ? force.avgCurve.map((f, i) => ({
            pct: Math.round((i / (force.avgCurve.length - 1)) * 100),
            force: Math.round(f),
          }))
        : [],
    [force],
  );

  // Recharts' `reversed` YAxis alone can leave the fastest stroke pinned to the
  // frame, so pad the domain by 2 s either side and keep the ticks as m:ss.
  const splitDomain = useMemo<[number, number]>(() => {
    if (!splitData.length) return [0, 1];
    const vals = splitData.map(d => d.split);
    return [Math.min(...vals) - 2, Math.max(...vals) + 2];
  }, [splitData]);

  // ── AI analysis: exactly one call per open, StrictMode-safe ────────────────

  /**
   * The payload is a hard contract with the analyze-workout edge function:
   * metrics only, a 10-point average force curve, every number rounded. Raw
   * stroke arrays and raw force curves are never sent — they are tens of
   * thousands of tokens of noise.
   */
  const buildPayload = useCallback(() => {
    const curve10 = force
      ? resampleLinear(force.avgCurve, 10).map(v => Math.round(v))
      : null;

    return {
      workoutType: "erg" as const,
      user_id: userId,
      workout: {
        id: workoutId,
        workout_id: workoutId,
        distance: Math.round(summary.distance),
        elapsed_time: Math.round(summary.elapsed),
        avg_split_seconds: summary.avgSplit != null ? Number(summary.avgSplit.toFixed(1)) : null,
        avg_watts: summary.avgWatts != null ? Math.round(summary.avgWatts) : null,
        avg_stroke_rate: summary.avgSpm != null ? Math.round(summary.avgSpm) : null,
        max_hr: summary.maxHr != null ? Math.round(summary.maxHr) : null,
        min_hr: summary.minHr != null ? Math.round(summary.minHr) : null,
        peak_force_n: force ? Math.round(force.peakForceN) : null,
        drive_efficiency: force ? Math.round(force.driveEfficiency) : null,
        force_curve_10: curve10,
      },
    };
  }, [force, summary, userId, workoutId]);

  // Keyed on workoutId so a second, different workout in the same mount still
  // gets analysed — but a re-render, or StrictMode's double effect, never
  // fires twice. The ref is written synchronously, before any await.
  const firedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;

    if (!workoutId) {
      setAiState("skipped");
      return;
    }
    if (firedForRef.current === workoutId) return;
    firedForRef.current = workoutId;

    let cancelled = false;
    setAiState("loading");
    setAiError(null);

    (async () => {
      try {
        const { data, error } = await invokeAI("analyze-workout", { body: buildPayload() });
        if (cancelled) return;
        if (error) throw error;

        const fb = data?.feedback;
        if (fb && typeof fb === "object") {
          setFeedback(fb as AIFeedback);
          setFeedbackText(null);
          setAiState("done");
        } else if (typeof fb === "string" && fb.trim()) {
          setFeedbackText(fb);
          setFeedback(null);
          setAiState("done");
        } else {
          throw new Error("The coach had nothing to say about this piece.");
        }
      } catch (e: any) {
        if (cancelled) return;
        console.error("[PostWorkoutScreen] analyze-workout failed:", e);
        // Let a retry through — the guard is about accidental double-fires, not
        // about permanently blocking a genuine second attempt.
        firedForRef.current = null;
        setAiError(e?.message ? String(e.message) : "Analysis is unavailable right now.");
        setAiState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, workoutId, buildPayload]);

  const retryAnalysis = useCallback(async () => {
    if (!workoutId || aiState === "loading") return;
    firedForRef.current = workoutId;
    setAiState("loading");
    setAiError(null);
    try {
      const { data, error } = await invokeAI("analyze-workout", { body: buildPayload() });
      if (error) throw error;
      const fb = data?.feedback;
      if (fb && typeof fb === "object") {
        setFeedback(fb as AIFeedback);
        setAiState("done");
      } else if (typeof fb === "string" && fb.trim()) {
        setFeedbackText(fb);
        setAiState("done");
      } else {
        throw new Error("The coach had nothing to say about this piece.");
      }
    } catch (e: any) {
      firedForRef.current = null;
      setAiError(e?.message ? String(e.message) : "Analysis is unavailable right now.");
      setAiState("error");
    }
  }, [aiState, buildPayload, workoutId]);

  // Reset the per-session UI state whenever the screen is re-opened.
  useEffect(() => {
    if (!open) {
      setSaveConfirmed(false);
      setShareOpen(false);
    }
  }, [open]);

  // The share card prints the athlete's name; fetch it lazily, once.
  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, username")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled || !data) return;
      setAthleteName((data as any).full_name || (data as any).username || "Athlete");
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  const confirmSaved = useCallback(() => {
    setSaveConfirmed(true);
    toast({
      title: "Saved to history",
      description: "This piece is already in your training log.",
    });
  }, [toast]);

  const shareStats = useMemo(
    () => ({
      athleteName,
      workoutType: "Erg",
      date: summary.dateStr,
      distance: summary.distance ? `${Math.round(summary.distance)} m` : undefined,
      time: fmtElapsed(summary.elapsed),
      avgSplit: summary.avgSplit != null ? fmtSplitShort(summary.avgSplit) : undefined,
      watts: summary.avgWatts != null ? Math.round(summary.avgWatts) : undefined,
      strokeRate: summary.avgSpm != null ? Math.round(summary.avgSpm) : undefined,
      maxHR: summary.maxHr != null ? Math.round(summary.maxHr) : undefined,
      minHR: summary.minHr != null ? Math.round(summary.minHr) : undefined,
    }),
    [athleteName, summary],
  );

  // ───────────────────────────────────────────────────────────────────────────

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 sm:rounded-none"
          onOpenAutoFocus={e => e.preventDefault()}
        >
          {/* ── Header ─────────────────────────────────────────────────── */}
          <div
            className="shrink-0 border-b border-border bg-card px-4 pb-4"
            style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
          >
            <Badge className="gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Workout Complete
            </Badge>

            <DialogTitle className="mt-3 font-mono text-4xl font-bold leading-none tracking-tight text-foreground tabular-nums">
              {summary.distance ? `${Math.round(summary.distance).toLocaleString()} m` : "Erg piece"}
            </DialogTitle>

            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-mono font-semibold text-foreground tabular-nums">
                {fmtElapsed(summary.elapsed)}
              </span>
              <span className="mx-2 text-border">·</span>
              {summary.dateStr}
            </p>
          </div>

          {/* ── Scrolling body ─────────────────────────────────────────── */}
          <div
            className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
          >
            {/* 2 · Performance summary */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Avg Split" value={fmtSplit(summary.avgSplit)} unit="/500m" />
              <StatCard
                label="Avg Watts"
                value={summary.avgWatts != null ? String(Math.round(summary.avgWatts)) : "--"}
                unit="W"
              />
              <StatCard
                label="Avg Rate"
                value={summary.avgSpm != null ? String(Math.round(summary.avgSpm)) : "--"}
                unit="spm"
              />
              <StatCard
                label="Max HR"
                value={summary.maxHr != null ? String(Math.round(summary.maxHr)) : "--"}
                unit="bpm"
                tone={summary.maxHr != null ? "danger" : "default"}
              />
            </div>

            {/* 3 · Heart rate */}
            <Section title="Heart Rate" subtitle="Beats per minute over the piece">
              {hrData.length >= 2 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={hrData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
                    <XAxis
                      dataKey="t"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={fmtClock}
                      tick={axisTick}
                      stroke={GRID}
                      tickLine={false}
                    />
                    <YAxis
                      domain={["dataMin - 5", "dataMax + 5"]}
                      tick={axisTick}
                      stroke={GRID}
                      tickLine={false}
                      width={40}
                      unit=""
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(v: number) => `${fmtClock(v)} elapsed`}
                      formatter={(v: number) => [`${Math.round(v)} bpm`, "Heart rate"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="hr"
                      stroke={HR_RED}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      dot={false}
                      activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState icon={<HeartPulse className="h-5 w-5 text-muted-foreground" />}>
                  No heart-rate data for this piece. Pair a chest strap or watch before your next
                  session and it will show up here.
                </EmptyState>
              )}
            </Section>

            {/* 4 · Force curve analysis */}
            <Section
              title="Force Curve"
              subtitle={
                force
                  ? `Average of ${force.strokeCount} stroke${force.strokeCount === 1 ? "" : "s"}, across the drive`
                  : undefined
              }
            >
              {force && forceAreaData.length >= 2 ? (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={forceAreaData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                      <defs>
                        <linearGradient id="pws-force-wash" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={INK} stopOpacity={0.12} />
                          <stop offset="100%" stopColor={INK} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
                      <XAxis
                        dataKey="pct"
                        type="number"
                        domain={[0, 100]}
                        ticks={[0, 25, 50, 75, 100]}
                        tickFormatter={(v: number) => `${v}%`}
                        tick={axisTick}
                        stroke={GRID}
                        tickLine={false}
                      />
                      <YAxis
                        tick={axisTick}
                        stroke={GRID}
                        tickLine={false}
                        width={44}
                        tickFormatter={(v: number) => `${Math.round(v)}`}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        labelFormatter={(v: number) => `${v}% through the drive`}
                        formatter={(v: number) => [`${Math.round(v)} N`, "Force"]}
                      />
                      <ReferenceLine
                        x={Math.round(force.timeToPeakPct)}
                        stroke={AXIS}
                        strokeWidth={1}
                        label={{
                          value: "peak",
                          position: "top",
                          fill: AXIS,
                          fontSize: 10,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="force"
                        stroke={INK}
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="url(#pws-force-wash)"
                        dot={false}
                        activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2 }}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>

                  <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <MetricCell
                      label="Peak Force"
                      value={`${Math.round(force.peakForceN)} N`}
                      hint="Highest point of the average curve"
                    />
                    <MetricCell
                      label="Time to Peak"
                      value={`${Math.round(force.timeToPeakPct)}%`}
                      hint="Of the drive. Aim for 25–40%."
                      tone={force.timeToPeakPct >= 25 && force.timeToPeakPct <= 40 ? "good" : "warn"}
                    />
                    <MetricCell
                      label="Drive Efficiency"
                      value={`${Math.round(force.driveEfficiency)}`}
                      hint="Impulse vs. a flat peak-force drive"
                      tone={force.driveEfficiency >= DRIVE_EFFICIENCY_GOOD ? "good" : "warn"}
                    />
                    <MetricCell
                      label="Catch Slip"
                      value={force.catchSlip ? "Yes" : "No"}
                      hint={`Half peak at ${Math.round(force.halfPeakPct)}% of the drive`}
                      tone={force.catchSlip ? "warn" : "good"}
                    />
                  </div>
                </>
              ) : (
                <EmptyState>
                  No force-curve data was recorded for this piece. Force curves stream from the PM5
                  while you row — keep the monitor connected for the whole session to see them.
                </EmptyState>
              )}
            </Section>

            {/* 5 · Split progression */}
            <Section
              title="Split Progression"
              subtitle="Pace per 500 m, stroke by stroke — higher on the chart is faster"
            >
              {splitData.length >= 2 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={splitData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
                    <XAxis
                      dataKey="n"
                      tick={axisTick}
                      stroke={GRID}
                      tickLine={false}
                      label={{
                        value: "Stroke",
                        position: "insideBottom",
                        offset: -2,
                        fill: AXIS,
                        fontSize: 10,
                      }}
                    />
                    {/* reversed: a lower split is faster, so it belongs at the TOP. */}
                    <YAxis
                      reversed
                      domain={splitDomain}
                      tickFormatter={fmtSplitShort}
                      tick={axisTick}
                      stroke={GRID}
                      tickLine={false}
                      width={52}
                      label={{
                        value: "faster ↑",
                        angle: -90,
                        position: "insideLeft",
                        fill: AXIS,
                        fontSize: 10,
                      }}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(v: number) => `Stroke ${v}`}
                      formatter={(v: number) => [`${fmtSplit(v)} /500m`, "Split"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="split"
                      stroke={INK}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      dot={false}
                      activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState>
                  Not enough stroke data to plot a pacing curve for this piece.
                </EmptyState>
              )}
            </Section>

            {/* 6 · Watts progression */}
            <Section title="Power Progression" subtitle="Watts, stroke by stroke">
              {wattsData.length >= 2 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={wattsData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
                    <XAxis
                      dataKey="n"
                      tick={axisTick}
                      stroke={GRID}
                      tickLine={false}
                      label={{
                        value: "Stroke",
                        position: "insideBottom",
                        offset: -2,
                        fill: AXIS,
                        fontSize: 10,
                      }}
                    />
                    <YAxis
                      domain={["dataMin - 10", "dataMax + 10"]}
                      tick={axisTick}
                      stroke={GRID}
                      tickLine={false}
                      width={44}
                      tickFormatter={(v: number) => `${Math.round(v)}`}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(v: number) => `Stroke ${v}`}
                      formatter={(v: number) => [`${Math.round(v)} W`, "Power"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="watts"
                      stroke={INK}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      dot={false}
                      activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState>No per-stroke power data was recorded for this piece.</EmptyState>
              )}
            </Section>

            {/* 7 · AI analysis */}
            <Section title="Coach Analysis" subtitle="Generated from this session's metrics">
              {aiState === "loading" && (
                <div className="flex h-[140px] flex-col items-center justify-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-foreground" />
                  <p className="text-xs text-muted-foreground">Reading your piece…</p>
                </div>
              )}

              {aiState === "skipped" && (
                <EmptyState icon={<Sparkles className="h-5 w-5 text-muted-foreground" />}>
                  This piece could not be linked to a saved workout, so there is nothing to analyse
                  against. Your numbers above are still complete.
                </EmptyState>
              )}

              {aiState === "error" && (
                <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border px-4 py-6 text-center">
                  <AlertCircle className="h-5 w-5" style={{ color: HR_RED }} />
                  <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                    {aiError ?? "Analysis is unavailable right now."} Your workout is saved either
                    way.
                  </p>
                  <Button variant="outline" size="sm" onClick={retryAnalysis}>
                    Try again
                  </Button>
                </div>
              )}

              {aiState === "done" && (
                <div className="space-y-4 text-sm leading-relaxed text-foreground">
                  {feedbackText && <p className="whitespace-pre-wrap">{feedbackText}</p>}

                  {feedback?.summary && <p className="whitespace-pre-wrap">{feedback.summary}</p>}

                  {!!feedback?.strengths?.length && (
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        What worked
                      </p>
                      <ul className="space-y-1">
                        {feedback.strengths.map((s, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-muted-foreground">·</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {!!feedback?.improvements?.length && (
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Work on
                      </p>
                      <ul className="space-y-1">
                        {feedback.improvements.map((s, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-muted-foreground">·</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {feedback?.recommendation && (
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Next session
                      </p>
                      <p className="whitespace-pre-wrap">{feedback.recommendation}</p>
                    </div>
                  )}

                  {feedback?.progressNote && (
                    <p className="text-xs text-muted-foreground">{feedback.progressNote}</p>
                  )}

                  {feedback?.motivationalMessage && (
                    <p className="border-l-2 border-foreground pl-3 text-sm font-semibold">
                      {feedback.motivationalMessage}
                    </p>
                  )}
                </div>
              )}
            </Section>
          </div>

          {/* ── 8 · Actions ────────────────────────────────────────────── */}
          <div
            className="shrink-0 border-t border-border bg-card px-4 pt-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
          >
            <div className="flex gap-3">
              <Button
                variant={saveConfirmed ? "success" : "outline"}
                className="flex-1 gap-2"
                onClick={confirmSaved}
              >
                <Check className="h-4 w-4" />
                {saveConfirmed ? "Saved" : "Save to History"}
              </Button>
              <Button className="flex-1 gap-2" onClick={() => setShareOpen(true)}>
                <Share2 className="h-4 w-4" />
                Share Workout
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <WorkoutShareCard open={shareOpen} onClose={() => setShareOpen(false)} stats={shareStats} />
    </>
  );
}
