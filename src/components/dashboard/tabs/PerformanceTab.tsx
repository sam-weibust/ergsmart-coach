import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/getUser";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Bluetooth, ChevronLeft, ChevronRight } from "lucide-react";
import type { AthleteTabProps } from "./types";
import { planCurrentWeekIndex, planDayDate } from "@/lib/planDates";
import { isLiftSession, sessionZone } from "@/lib/planSchema";
import { useBle } from "@/context/BleContext";

// Reused existing sections (opened inside a full-screen sheet sub-view).
import LiveErgView from "@/components/dashboard/LiveErgView";
import { WorkoutPlanSection } from "@/components/dashboard/WorkoutPlanSection";
import AskSection from "@/components/dashboard/AskSection";
import { ErgPredictor } from "@/components/dashboard/ErgPredictor";
import CritiqueSection from "@/components/dashboard/CritiqueSection";
import ComparisonSection from "@/components/dashboard/ComparisonSection";
import { CalculatorsSection } from "@/components/dashboard/calculators/CalculatorsSection";
// Manual logging. These were orphaned before: Dashboard.renderContent() (their
// only mount point) was never called by the 5-tab shell, so there was no
// reachable UI for manual erg / multi-piece / strength / cross-training logging.
// Not named in this screen's redesign brief, but PerformanceTab is still their
// ONLY reachable entry point anywhere in the app (confirmed by grep — nothing
// else imports these 4 components), so they stay as a 3rd grouped list below
// the two the brief specifies rather than silently going dark again.
import ErgWorkoutSection from "@/components/dashboard/ErgWorkoutSection";
import MultiPieceSession from "@/components/dashboard/MultiPieceSession";
import MultiSetStrengthForm from "@/components/dashboard/MultiSetStrengthForm";
import CrossTrainingSection from "@/components/dashboard/CrossTrainingSection";

/* ──────────────────────────────────────────────────────────────────────────
 * Tool registry. Each tool id maps to a label and the existing component to
 * render in the sub-view sheet. Props are supplied at render time (see
 * renderTool) because some need `profile` / a calculator tab id.
 *
 * "history" (Erg History), "strength" (Strength Program) and "recruiting"
 * (Recruiting Profile) used to live here too. They're dropped from this
 * screen because they're fully reachable elsewhere with the identical
 * component + props (Me tab → HistorySection / StrengthProgramSection; More
 * tab → RecruitingProfileSection) — not a loss of functionality, just a
 * de-duplicated entry point.
 * ──────────────────────────────────────────────────────────────────────── */
type ToolId =
  | "live-erg" | "plan" | "ask"
  | "log-erg" | "log-multipiece" | "log-strength" | "log-cross"
  | "predictor" | "critique" | "comparison"
  | "calc-split" | "calc-zones" | "calc-race" | "calc-stroke" | "calc-watts";

type ToolRow = { id: ToolId; label: string };

// Grouped-list rows exactly as named in the redesign brief, mapped onto real
// destinations that already exist in this file.
const AI_TOOLS: ToolRow[] = [
  { id: "predictor",  label: "2K Predictor" },
  { id: "critique",   label: "Technique Critique" },
  { id: "ask",        label: "AI Coach Chat" },
  { id: "comparison", label: "Workout Comparison" },
];

const CALCULATORS: ToolRow[] = [
  { id: "calc-split",  label: "Split Calculator" },
  { id: "calc-zones",  label: "Training Zones" },
  // Brief says "Race Planner" — closest real destination is this app's
  // existing Race Splits Planner (CalculatorsSection initialTab="race-plan").
  // Labelled with its real name so it doesn't relabel itself once opened.
  { id: "calc-race",   label: "Race Splits Planner" },
  { id: "calc-stroke", label: "Stroke Watch" },
  { id: "calc-watts",  label: "Watts Calculator" },
];

// Not named in the brief for this screen (which lists 5 calculators only),
// but this has no dedicated top-level destination elsewhere — kept reachable
// as the app's manual/multi-piece/strength/cross-training entry point. See
// the import comment above.
const LOG_TOOLS: ToolRow[] = [
  { id: "log-erg",        label: "Log Erg Workout" },
  { id: "log-multipiece", label: "Multi-Piece Session" },
  { id: "log-strength",   label: "Log Strength" },
  { id: "log-cross",      label: "Cross Training" },
];

// Calculator tool id → CalculatorsSection `initialTab` (CalcId). Note: Weight
// Adjustment ("weight-adj") isn't a top-level row here (not in the brief's
// 5-item Calculators list) but stays one tap away — CalculatorsSection's own
// internal tab bar/sidebar lists every calculator, this one included.
const CALC_TAB: Partial<Record<ToolId, string>> = {
  "calc-split": "split",
  "calc-zones": "zones",
  "calc-race": "race-plan",
  "calc-stroke": "stroke-watch",
  "calc-watts": "pace-watts",
};

const TOOL_TITLES: Record<ToolId, string> = {
  "live-erg": "Live Erg",
  plan: "AI Training Plan",
  ask: "AI Coach",
  "log-erg": "Log Erg Workout",
  "log-multipiece": "Multi-Piece Session",
  "log-strength": "Log Strength Workout",
  "log-cross": "Cross Training",
  predictor: "2K Predictor",
  critique: "Technique Critique",
  comparison: "Workout Comparison",
  "calc-split": "Split Calculator",
  "calc-zones": "Training Zones",
  "calc-race": "Race Splits Planner",
  "calc-stroke": "Stroke Watch",
  "calc-watts": "Watts Calculator",
};

/* ── Active-plan helpers ─────────────────────────────────────────────────── */
const extractWeeks = (workout_data: any): any[] => {
  if (!workout_data) return [];
  if (Array.isArray(workout_data)) return workout_data;
  if (Array.isArray(workout_data?.plan)) return workout_data.plan;
  if (Array.isArray(workout_data?.weeks)) return workout_data.weeks;
  return [];
};

/** One day-chip's worth of derived display info. */
type DayChip = {
  /** Single-letter weekday initial ("M", "T", "W", …), from the plan's real
   *  calendar date (planDayDate), not an assumed Monday-first array. */
  letter: string;
  isToday: boolean;
  isRest: boolean;
  /** Training zone, e.g. "UT2" — null for rest/lift/unrecognised days. */
  zone: string | null;
  /** Short bottom-of-chip label: the zone, "OFF", "LIFT", or "—". */
  abbrev: string;
};

/**
 * Small solid dot per zone, reusing the same hue convention
 * WorkoutPlanSection's getZoneColor() already established app-wide (green =
 * easy, blue = steady, amber = threshold, red = hardest), mapped onto this
 * design system's semantic status tokens instead of raw palette classes.
 * Zones that file doesn't color either (e.g. "AN") fall back to neutral here
 * too, for consistency with that existing behavior.
 */
function zoneDotClass(zone: string | null, isRest: boolean): string {
  if (isRest) return "bg-subtle";
  switch (zone) {
    case "UT2": return "bg-success";
    case "UT1": return "bg-primary";
    case "TR":
    case "TR1":
    case "TR2":
      return "bg-warning";
    case "AT": return "bg-destructive";
    default: return "bg-subtle";
  }
}

/**
 * The current week's 7 days as compact chip data. Anchored to the plan's real
 * start_date via planDayDate (see src/lib/planDates.ts) so the letters/isToday
 * line up with real weekdays, and reads zone/lift status via the shared
 * planSchema.ts readers already used by WorkoutPlanSection for the same JSON.
 */
function buildDayChips(
  plan: { start_date?: string | null; created_at?: string | null },
  week: any,
  weekIdx: number,
): DayChip[] {
  const days: any[] = Array.isArray(week?.days) ? week.days : [];
  const todayStr = new Date().toDateString();
  return Array.from({ length: 7 }, (_, i) => {
    const day = days[i];
    const date = planDayDate(plan, weekIdx, i);
    const letter = date.toLocaleDateString("en-US", { weekday: "narrow" });
    const isRest = day?.is_rest === true;
    const session = day?.required ?? day?.ergWorkout ?? null;
    const zone = isRest ? null : sessionZone(session)?.toUpperCase() ?? null;
    const isLift = !isRest && !zone && (isLiftSession(session) || !!day?.strengthWorkout);
    const abbrev = isRest ? "OFF" : zone ? zone : isLift ? "LIFT" : "—";
    return { letter, isToday: date.toDateString() === todayStr, isRest, zone, abbrev };
  });
}

/* ──────────────────────────────────────────────────────────────────────────
 * PERFORMANCE TAB
 * ──────────────────────────────────────────────────────────────────────── */
export default function PerformanceTab({ profile }: AthleteTabProps) {
  const [openTool, setOpenTool] = useState<ToolId | null>(null);

  // iOS native only — Android native + every web platform falls back to info.
  const isIosNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

  // Shared BLE connection state (src/context/BleContext.tsx, provided app-wide
  // in App.tsx) — read-only here. The actual connect/disconnect flow, 10s
  // timeout and toasts all live inside LiveErgView; this entry point just
  // reflects state that's already tracked globally.
  const { ergConnected, ergDeviceName } = useBle();

  // Active training plan (most recent) — current week/phase + a 7-day chip strip.
  const { data: planInfo, isLoading: planLoading } = useQuery({
    queryKey: ["performance-active-plan"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      // `as any`: start_date was added by migration 20260802000000 and is not
      // yet in the generated Supabase types.
      const { data } = await (supabase.from("workout_plans") as any)
        .select("title, workout_data, created_at, start_date")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return null;
      const weeks = extractWeeks((data as any).workout_data);
      // Anchored to start_date (Monday of week 1), not created_at — see
      // src/lib/planDates.ts and migration 20260802000000.
      const weekIdx = planCurrentWeekIndex(data as any, weeks.length);
      const week = weeks[weekIdx];
      return {
        weekCount: weeks.length,
        weekNumber: week?.week || weekIdx + 1,
        phase: week?.phase_label || null,
        chips: buildDayChips(data as any, week, weekIdx),
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  // "Log with PM5" elsewhere in the app dispatches navigate_to_live_erg; the
  // shell switches to this tab and we open the Live Erg sub-view here.
  useEffect(() => {
    const open = () => setOpenTool("live-erg");
    window.addEventListener("navigate_to_live_erg", open);
    return () => window.removeEventListener("navigate_to_live_erg", open);
  }, []);

  function renderTool(id: ToolId) {
    switch (id) {
      case "live-erg":       return <LiveErgView />;
      case "plan":           return <WorkoutPlanSection />;
      case "ask":            return <AskSection />;
      case "log-erg":        return <div className="p-4"><ErgWorkoutSection profile={profile} /></div>;
      case "log-multipiece": return <div className="p-4"><MultiPieceSession profile={profile} /></div>;
      case "log-strength":   return <div className="p-4"><MultiSetStrengthForm profile={profile} /></div>;
      case "log-cross":      return <div className="p-4"><CrossTrainingSection profile={profile} /></div>;
      case "predictor":      return <ErgPredictor />;
      case "critique":       return <CritiqueSection />;
      case "comparison":     return <ComparisonSection profile={profile} />;
      default:
        if (CALC_TAB[id]) {
          return <CalculatorsSection initialTab={CALC_TAB[id]} profile={profile} />;
        }
        return null;
    }
  }

  return (
    <div className="p-4 pb-28 space-y-6">
      {/* ── 1. Live Erg — full-width, not a card ──────────────────────────── */}
      <section>
        {!isIosNative ? (
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 shrink-0 rounded-full bg-subtle" />
            <div className="min-w-0 flex-1">
              <div className="text-xl text-foreground">Live Erg</div>
              <div className="text-sm text-muted-foreground mt-0.5">Connect via the iOS app</div>
            </div>
            <Badge variant="secondary" className="shrink-0">iOS only</Badge>
          </div>
        ) : ergConnected ? (
          <div>
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 shrink-0 rounded-full bg-success" />
              <span className="min-w-0 flex-1 truncate text-xl text-foreground">
                {ergDeviceName || "Concept2 PM5"}
              </span>
            </div>
            <Button size="lg" className="w-full mt-4" onClick={() => setOpenTool("live-erg")}>
              Go to Live Erg
            </Button>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 shrink-0 rounded-full bg-subtle" />
              <span className="text-2xl text-foreground">Connect PM5</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Tap to connect via Bluetooth</p>
            <Button size="lg" className="w-full mt-4" onClick={() => setOpenTool("live-erg")}>
              <Bluetooth className="h-4 w-4" strokeWidth={1.5} />
              Connect
            </Button>
          </div>
        )}
      </section>

      {/* ── 2. Training plan ───────────────────────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="label-caption px-1">MY PLAN</h2>
        <button
          onClick={() => setOpenTool("plan")}
          className="w-full text-left active:opacity-80 transition-opacity"
        >
          {planLoading ? (
            <div className="text-sm text-muted-foreground py-3 px-1">Loading your plan…</div>
          ) : planInfo ? (
            <>
              <div className="flex items-baseline gap-2 px-1">
                <span className="text-xl text-foreground">
                  Week {planInfo.weekNumber}
                  {planInfo.weekCount > 0 ? ` of ${planInfo.weekCount}` : ""}
                </span>
                {planInfo.phase && (
                  <span className="text-sm text-muted-foreground">{planInfo.phase}</span>
                )}
              </div>
              <div className="mt-3 flex items-stretch justify-between gap-1 rounded-lg bg-card px-2 py-3">
                {planInfo.chips.map((chip, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex flex-1 flex-col items-center gap-1.5 rounded-md py-1",
                      chip.isToday && "bg-surface-3",
                    )}
                  >
                    <span className={cn("text-xs", chip.isToday ? "text-foreground" : "text-muted-foreground")}>
                      {chip.letter}
                    </span>
                    <span className={cn("h-2.5 w-2.5 rounded-full", zoneDotClass(chip.zone, chip.isRest))} />
                    <span className="text-xs text-subtle">{chip.abbrev}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground py-3 px-1">
              No active plan yet — tap to generate one.
            </div>
          )}
        </button>
      </section>

      {/* ── 3. AI Tools ─────────────────────────────────────────────────────── */}
      <ToolGroup title="AI Tools" rows={AI_TOOLS} onOpen={setOpenTool} />

      {/* ── 4. Calculators ──────────────────────────────────────────────────── */}
      <ToolGroup title="Calculators" rows={CALCULATORS} onOpen={setOpenTool} />

      {/* ── 5. Log a Workout — not in the redesign brief, kept reachable
             (see the import comment near the top of this file) ─────────────── */}
      <ToolGroup title="Log a Workout" rows={LOG_TOOLS} onOpen={setOpenTool} />

      {/* ── Sub-view sheet ───────────────────────────────────────────────────── */}
      <Sheet open={openTool !== null} onOpenChange={(o) => !o && setOpenTool(null)}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl p-0 flex flex-col gap-0 [&>button]:hidden"
        >
          {openTool && (
            <>
              <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0">
                <Button variant="ghost" size="sm" className="gap-1 -ml-1" onClick={() => setOpenTool(null)}>
                  <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
                  Back
                </Button>
                <span className="font-semibold">{TOOL_TITLES[openTool]}</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {renderTool(openTool)}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ── Grouped-list pattern: section header + full-width rows ─────────────────
 * [text-xs uppercase text-tertiary header; each row 48px tall, label
 * text-base left, ChevronRight 16px text-tertiary right, thin border-bottom
 * between rows]. One bg-card container per group — never nested. */
function ToolGroup({
  title, rows, onOpen,
}: {
  title: string;
  rows: ToolRow[];
  onOpen: (id: ToolId) => void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="label-caption px-1">{title}</h2>
      <div className="overflow-hidden rounded-lg bg-card">
        {rows.map((row) => (
          <ToolRowItem key={row.id} label={row.label} onClick={() => onOpen(row.id)} />
        ))}
      </div>
    </section>
  );
}

function ToolRowItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-12 w-full items-center justify-between gap-3 border-b border-border px-4 text-left last:border-b-0 active:bg-surface-3"
    >
      <span className="text-base text-foreground">{label}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-subtle" strokeWidth={1.5} />
    </button>
  );
}
