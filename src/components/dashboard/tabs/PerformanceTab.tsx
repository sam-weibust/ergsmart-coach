import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/getUser";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Bluetooth, ChevronLeft, ChevronRight, MessageSquare, CalendarClock,
  Zap, Video, GitCompareArrows, History, Dumbbell, Bot, Sparkles,
  SplitSquareVertical, Target, Trophy, Radio, Gauge, Weight, GraduationCap,
  Activity, Layers, PersonStanding, type LucideIcon,
} from "lucide-react";
import type { AthleteTabProps } from "./types";
import { planCurrentWeekIndex } from "@/lib/planDates";

// Reused existing sections (opened inside a full-screen sheet sub-view).
import LiveErgView from "@/components/dashboard/LiveErgView";
import { WorkoutPlanSection } from "@/components/dashboard/WorkoutPlanSection";
import AskSection from "@/components/dashboard/AskSection";
import { ErgPredictor } from "@/components/dashboard/ErgPredictor";
import CritiqueSection from "@/components/dashboard/CritiqueSection";
import ComparisonSection from "@/components/dashboard/ComparisonSection";
import HistorySection from "@/components/dashboard/HistorySection";
import StrengthProgramSection from "@/components/dashboard/StrengthProgramSection";
import { RecruitingProfileSection } from "@/components/dashboard/RecruitingProfileSection";
import { CalculatorsSection } from "@/components/dashboard/calculators/CalculatorsSection";
// Manual logging. These were orphaned before: Dashboard.renderContent() (their
// only mount point) was never called by the 5-tab shell, so there was no
// reachable UI for manual erg / multi-piece / strength / cross-training logging.
import ErgWorkoutSection from "@/components/dashboard/ErgWorkoutSection";
import MultiPieceSession from "@/components/dashboard/MultiPieceSession";
import MultiSetStrengthForm from "@/components/dashboard/MultiSetStrengthForm";
import CrossTrainingSection from "@/components/dashboard/CrossTrainingSection";

/* ──────────────────────────────────────────────────────────────────────────
 * Tool registry. Each tool id maps to a label, icon and the existing
 * component to render in the sub-view sheet. Props are supplied at render
 * time (see renderTool) because some need `profile` / a calculator tab id.
 * ──────────────────────────────────────────────────────────────────────── */
type ToolId =
  | "live-erg" | "plan" | "ask"
  | "log-erg" | "log-multipiece" | "log-strength" | "log-cross"
  | "predictor" | "critique" | "comparison" | "history" | "strength" | "recruiting"
  | "calc-split" | "calc-zones" | "calc-race" | "calc-stroke" | "calc-watts" | "calc-weight";

/**
 * Manual logging. Lives on the Performance tab rather than Me because
 * Performance is the "do a session" surface (Live Erg, training plan, AI coach,
 * training tools) while Me is the read-only "who am I / how am I doing"
 * summary. Logging a workout is an action, so it belongs next to the other
 * training actions.
 */
const LOG_TOOLS: { id: ToolId; label: string; desc: string; icon: LucideIcon }[] = [
  { id: "log-erg",        label: "Log Erg Workout",  desc: "Enter a session by hand",       icon: Activity },
  { id: "log-multipiece", label: "Multi-Piece",      desc: "Log a session of pieces",        icon: Layers },
  { id: "log-strength",   label: "Log Strength",     desc: "Sets, reps and weight",          icon: Weight },
  { id: "log-cross",      label: "Cross Training",   desc: "Runs, rides and swims",          icon: PersonStanding },
];

const TRAINING_TOOLS: { id: ToolId; label: string; desc: string; icon: LucideIcon }[] = [
  { id: "predictor",  label: "2K Predictor",        desc: "AI conservative 2K prediction",   icon: Zap },
  { id: "critique",   label: "Technique Critique",  desc: "Upload a video for AI feedback",  icon: Video },
  { id: "comparison", label: "Workout Comparison",  desc: "Compare your sessions & trends",  icon: GitCompareArrows },
  { id: "history",    label: "Erg History",         desc: "Browse & export past workouts",   icon: History },
  { id: "strength",   label: "Strength Program",    desc: "Follow the rowing lift program",  icon: Dumbbell },
  { id: "recruiting", label: "Recruiting Profile",   desc: "College recruiting details",       icon: GraduationCap },
];

const CALCULATORS: { id: ToolId; label: string; desc: string; icon: LucideIcon }[] = [
  { id: "calc-split",  label: "Split Calculator",    desc: "Split ↔ total time",        icon: SplitSquareVertical },
  { id: "calc-zones",  label: "Training Zones",      desc: "UT2–SP zones from your 2K",  icon: Target },
  { id: "calc-race",   label: "Race Splits Planner", desc: "Plan a 2K 500m by 500m",    icon: Trophy },
  { id: "calc-stroke", label: "Stroke Watch",        desc: "Live on-water stroke rate",  icon: Radio },
  { id: "calc-watts",  label: "Watts Calculator",    desc: "Convert split ↔ watts",      icon: Gauge },
  { id: "calc-weight", label: "Weight Adjustment",   desc: "2K time at target weight",   icon: Weight },
];

// Calculator tool id → CalculatorsSection `initialTab` (CalcId).
const CALC_TAB: Partial<Record<ToolId, string>> = {
  "calc-split": "split",
  "calc-zones": "zones",
  "calc-race": "race-plan",
  "calc-stroke": "stroke-watch",
  "calc-watts": "pace-watts",
  "calc-weight": "weight-adj",
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
  history: "Erg History",
  strength: "Strength Logging",
  recruiting: "Recruiting Profile",
  "calc-split": "Split Calculator",
  "calc-zones": "Training Zones",
  "calc-race": "Race Splits Planner",
  "calc-stroke": "Stroke Watch",
  "calc-watts": "Watts Calculator",
  "calc-weight": "Weight Adjustment",
};

/* ── Active-plan helpers ─────────────────────────────────────────────────── */
const extractWeeks = (workout_data: any): any[] => {
  if (!workout_data) return [];
  if (Array.isArray(workout_data)) return workout_data;
  if (Array.isArray(workout_data?.plan)) return workout_data.plan;
  if (Array.isArray(workout_data?.weeks)) return workout_data.weeks;
  return [];
};

// Pick today's day from a week's `days[]`.
//
// Plans are anchored to workout_plans.start_date (always a Monday), so day 0 of
// every week IS Monday. Index by days-since-Monday first and only fall back to
// name matching for plans whose JSON is ordered differently.
function todaysSession(week: any): {
  label: string;
  summary: string;
  zone: string | null;
  pieces: string | null;
  targetSplit: string | null;
  optionalLabel: string | null;
} | null {
  const days: any[] = Array.isArray(week?.days) ? week.days : [];
  if (days.length === 0) return null;

  const dow = new Date().getDay(); // 0=Sun … 6=Sat
  const NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const todayName = NAMES[dow];
  const mondayIndex = (dow + 6) % 7; // Mon=0 … Sun=6

  const day =
    (mondayIndex < days.length ? days[mondayIndex] : undefined) ??
    days.find((d) => {
      const n = (typeof d?.day_name === "string" ? d.day_name : typeof d?.day === "string" ? d.day : "").toLowerCase();
      return n.includes(todayName);
    }) ??
    days[days.length - 1];

  if (!day) return null;
  const label =
    typeof day?.day_name === "string" ? day.day_name :
    typeof day?.day === "string" ? day.day :
    todayName.charAt(0).toUpperCase() + todayName.slice(1);

  const optionalLabel = day?.optional?.title || day?.optional?.description || null;

  if (day?.is_rest === true) {
    return { label, summary: "Rest day — recovery.", zone: null, pieces: null, targetSplit: null, optionalLabel };
  }

  const session = day?.required ?? day?.ergWorkout ?? null;
  const summary =
    (typeof day?.workout === "string" && day.workout) ||
    session?.title || session?.description ||
    optionalLabel ||
    "Rest / no session today.";

  const pieceBits: string[] = [];
  if (session?.duration) pieceBits.push(String(session.duration));
  if (session?.distance) pieceBits.push(`${session.distance}m`);

  return {
    label,
    summary,
    zone: session?.zone ? String(session.zone) : null,
    pieces: pieceBits.length ? pieceBits.join(" · ") : null,
    targetSplit: session?.targetSplit ? String(session.targetSplit) : null,
    optionalLabel,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * PERFORMANCE TAB
 * ──────────────────────────────────────────────────────────────────────── */
export default function PerformanceTab({ profile, teamColor }: AthleteTabProps) {
  const [openTool, setOpenTool] = useState<ToolId | null>(null);

  // iOS native only — Android native + every web platform falls back to info.
  const isIosNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

  // Active training plan (most recent) — current week + today's session preview.
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
        title: (data as any).title as string,
        weekCount: weeks.length,
        weekIdx,
        weekLabel: week?.phase_label || (week?.week ? `Week ${week.week}` : `Week ${weekIdx + 1}`),
        today: week ? todaysSession(week) : null,
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  // AI coach last-message preview from chat_messages.
  const { data: lastChat } = useQuery({
    queryKey: ["performance-last-chat"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const { data } = await supabase
        .from("chat_messages")
        .select("role, content, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as any) || null;
    },
    staleTime: 60 * 1000,
  });

  const accent = teamColor || "#1A1A2E";

  const lastChatPreview = useMemo(() => {
    if (!lastChat?.content) return null;
    const who = lastChat.role === "assistant" ? "Coach" : "You";
    const text = String(lastChat.content).replace(/\s+/g, " ").trim();
    return `${who}: ${text.length > 90 ? text.slice(0, 90) + "…" : text}`;
  }, [lastChat]);

  // "Log with PM5" elsewhere in the app dispatches navigate_to_live_erg; the
  // shell switches to this tab and we open the Live Erg sub-view here.
  useEffect(() => {
    const open = () => setOpenTool("live-erg");
    window.addEventListener("navigate_to_live_erg", open);
    return () => window.removeEventListener("navigate_to_live_erg", open);
  }, []);

  function renderTool(id: ToolId) {
    switch (id) {
      case "live-erg":   return <LiveErgView />;
      case "plan":       return <WorkoutPlanSection />;
      case "ask":        return <AskSection />;
      case "log-erg":        return <div className="p-4"><ErgWorkoutSection profile={profile} /></div>;
      case "log-multipiece": return <div className="p-4"><MultiPieceSession profile={profile} /></div>;
      case "log-strength":   return <div className="p-4"><MultiSetStrengthForm profile={profile} /></div>;
      case "log-cross":      return <div className="p-4"><CrossTrainingSection profile={profile} /></div>;
      case "predictor":  return <ErgPredictor />;
      case "critique":   return <CritiqueSection />;
      case "comparison": return <ComparisonSection profile={profile} />;
      case "history":    return <HistorySection profile={profile} />;
      case "strength":   return <StrengthProgramSection profile={profile} />;
      case "recruiting": return <RecruitingProfileSection />;
      default:
        if (CALC_TAB[id]) {
          return <CalculatorsSection initialTab={CALC_TAB[id]} profile={profile} />;
        }
        return null;
    }
  }

  return (
    <div className="p-4 pb-28 space-y-6">
      {/* ── 1. Live Erg (hero) ─────────────────────────────────────────── */}
      {isIosNative ? (
        <button
          onClick={() => setOpenTool("live-erg")}
          className="w-full text-left rounded-2xl p-5 text-white shadow-lg active:scale-[0.99] transition-transform"
          style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}
        >
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-white/15 p-3">
              <Bluetooth className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <div className="text-lg font-bold">Live Erg</div>
              <div className="text-sm text-white/80">Connect your PM5 over Bluetooth and row live</div>
            </div>
            <ChevronRight className="h-5 w-5 text-white/70" />
          </div>
        </button>
      ) : (
        <div className="w-full rounded-2xl border border-dashed p-5 bg-muted/40">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-muted p-3">
              <Bluetooth className="h-7 w-7 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <div className="text-lg font-bold">Live Erg</div>
              <div className="text-sm text-muted-foreground">Connect via the iOS app</div>
            </div>
            <Badge variant="secondary">iOS only</Badge>
          </div>
        </div>
      )}

      {/* ── 2. AI Training Plan ───────────────────────────────────────────── */}
      <Card
        className="cursor-pointer active:scale-[0.99] transition-transform"
        onClick={() => setOpenTool("plan")}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl p-2.5" style={{ background: `${accent}1a` }}>
              <CalendarClock className="h-5 w-5" style={{ color: accent }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold">AI Training Plan</span>
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              </div>
              {planLoading ? (
                <Skeleton className="h-4 w-40 mt-2" />
              ) : planInfo ? (
                <div className="mt-1 space-y-1">
                  <div className="text-sm text-muted-foreground truncate">
                    {planInfo.weekLabel}
                    {planInfo.weekCount > 0 && ` of ${planInfo.weekCount}`}
                    {" · "}{planInfo.title}
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">Today: </span>
                    <span className="text-muted-foreground">
                      {planInfo.today ? `${planInfo.today.label} — ${planInfo.today.summary}` : "No session scheduled"}
                    </span>
                  </div>
                  {planInfo.today && (planInfo.today.zone || planInfo.today.pieces || planInfo.today.targetSplit || planInfo.today.optionalLabel) && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      {planInfo.today.zone && (
                        <Badge variant="outline" className="text-[10px]">{planInfo.today.zone}</Badge>
                      )}
                      {planInfo.today.pieces && (
                        <span className="text-muted-foreground">{planInfo.today.pieces}</span>
                      )}
                      {planInfo.today.targetSplit && (
                        <span className="font-mono text-muted-foreground">
                          Target {planInfo.today.targetSplit}
                        </span>
                      )}
                      {planInfo.today.optionalLabel && (
                        <Badge variant="secondary" className="text-[10px]">+ optional</Badge>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground mt-1">
                  No active plan yet — tap to generate one.
                </div>
              )}
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
          </div>
        </CardContent>
      </Card>

      {/* ── 3. AI Coach Chat ──────────────────────────────────────────────── */}
      <Card
        className="cursor-pointer active:scale-[0.99] transition-transform"
        onClick={() => setOpenTool("ask")}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl p-2.5" style={{ background: `${accent}1a` }}>
              <Bot className="h-5 w-5" style={{ color: accent }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold">AI Coach Chat</div>
              <div className="text-sm text-muted-foreground truncate mt-0.5">
                {lastChatPreview ?? "Ask anything about training, technique or racing"}
              </div>
            </div>
            <MessageSquare className="h-5 w-5 text-muted-foreground shrink-0" />
          </div>
        </CardContent>
      </Card>

      {/* ── 4. Log a Workout ──────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">
          Log a Workout
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {LOG_TOOLS.map((t) => (
            <ToolCard key={t.id} tool={t} accent={accent} onClick={() => setOpenTool(t.id)} />
          ))}
        </div>
      </section>

      {/* ── 5. Training Tools ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">
          Training Tools
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {TRAINING_TOOLS.map((t) => (
            <ToolCard key={t.id} tool={t} accent={accent} onClick={() => setOpenTool(t.id)} />
          ))}
        </div>
      </section>

      {/* ── 6. Calculators ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">
          Calculators
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {CALCULATORS.map((t) => (
            <ToolCard key={t.id} tool={t} accent={accent} onClick={() => setOpenTool(t.id)} />
          ))}
        </div>
      </section>

      {/* ── Sub-view sheet ────────────────────────────────────────────────── */}
      <Sheet open={openTool !== null} onOpenChange={(o) => !o && setOpenTool(null)}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl p-0 flex flex-col gap-0 [&>button]:hidden"
        >
          {openTool && (
            <>
              <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0">
                <Button variant="ghost" size="sm" className="gap-1 -ml-1" onClick={() => setOpenTool(null)}>
                  <ChevronLeft className="h-4 w-4" />
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

/* ── Tool grid card ──────────────────────────────────────────────────────── */
function ToolCard({
  tool, accent, onClick,
}: {
  tool: { id: ToolId; label: string; desc: string; icon: LucideIcon };
  accent: string;
  onClick: () => void;
}) {
  const Icon = tool.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-card p-3 text-left active:scale-[0.97] transition-transform",
        "flex flex-col gap-2 min-h-[96px]",
      )}
    >
      <div className="rounded-lg p-2 w-fit" style={{ background: `${accent}1a` }}>
        <Icon className="h-5 w-5" style={{ color: accent }} />
      </div>
      <div>
        <div className="text-sm font-semibold leading-tight">{tool.label}</div>
        <div className="text-xs text-muted-foreground leading-snug mt-0.5">{tool.desc}</div>
      </div>
    </button>
  );
}
