import { useMemo, useState } from "react";
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
  SplitSquareVertical, Target, Trophy, Radio, Gauge, Weight, GraduationCap, type LucideIcon,
} from "lucide-react";
import type { AthleteTabProps } from "./types";

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

/* ──────────────────────────────────────────────────────────────────────────
 * Tool registry. Each tool id maps to a label, icon and the existing
 * component to render in the sub-view sheet. Props are supplied at render
 * time (see renderTool) because some need `profile` / a calculator tab id.
 * ──────────────────────────────────────────────────────────────────────── */
type ToolId =
  | "live-erg" | "plan" | "ask"
  | "predictor" | "critique" | "comparison" | "history" | "strength" | "recruiting"
  | "calc-split" | "calc-zones" | "calc-race" | "calc-stroke" | "calc-watts" | "calc-weight";

const TRAINING_TOOLS: { id: ToolId; label: string; desc: string; icon: LucideIcon }[] = [
  { id: "predictor",  label: "2K Predictor",        desc: "AI conservative 2K prediction",   icon: Zap },
  { id: "critique",   label: "Technique Critique",  desc: "Upload a video for AI feedback",  icon: Video },
  { id: "comparison", label: "Workout Comparison",  desc: "Compare your sessions & trends",  icon: GitCompareArrows },
  { id: "history",    label: "Erg History",         desc: "Browse & export past workouts",   icon: History },
  { id: "strength",   label: "Strength Logging",    desc: "Log lifts & strength programs",    icon: Dumbbell },
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

// Best-effort "current week": elapsed weeks since the plan was created,
// clamped to the plan length. Plans carry no explicit start_date.
function currentWeekIndex(createdAt: string | undefined, weekCount: number): number {
  if (!createdAt || weekCount === 0) return 0;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return 0;
  const elapsedWeeks = Math.floor((Date.now() - created) / (7 * 24 * 60 * 60 * 1000));
  return Math.min(Math.max(elapsedWeeks, 0), weekCount - 1);
}

// Pick today's day from a week's `days[]` by matching day name, else by index.
function todaysSession(week: any): { label: string; summary: string } | null {
  const days: any[] = Array.isArray(week?.days) ? week.days : [];
  if (days.length === 0) return null;
  const dow = new Date().getDay(); // 0=Sun
  const NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const todayName = NAMES[dow];

  let day =
    days.find((d) => {
      const n = (typeof d?.day_name === "string" ? d.day_name : typeof d?.day === "string" ? d.day : "").toLowerCase();
      return n.includes(todayName);
    }) ?? days[Math.min(dow, days.length - 1)];

  if (!day) return null;
  const label =
    typeof day?.day_name === "string" ? day.day_name :
    typeof day?.day === "string" ? day.day :
    todayName.charAt(0).toUpperCase() + todayName.slice(1);

  if (day?.is_rest === true) return { label, summary: "Rest day — recovery." };

  const session = day?.required ?? day?.ergWorkout ?? null;
  const summary =
    (typeof day?.workout === "string" && day.workout) ||
    session?.title || session?.description ||
    day?.optional?.title || day?.optional?.description ||
    "Rest / no session today.";
  return { label, summary };
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
      const { data } = await supabase
        .from("workout_plans")
        .select("title, workout_data, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return null;
      const weeks = extractWeeks((data as any).workout_data);
      const weekIdx = currentWeekIndex((data as any).created_at, weeks.length);
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

  const accent = teamColor || "#0a1628";

  const lastChatPreview = useMemo(() => {
    if (!lastChat?.content) return null;
    const who = lastChat.role === "assistant" ? "Coach" : "You";
    const text = String(lastChat.content).replace(/\s+/g, " ").trim();
    return `${who}: ${text.length > 90 ? text.slice(0, 90) + "…" : text}`;
  }, [lastChat]);

  function renderTool(id: ToolId) {
    switch (id) {
      case "live-erg":   return <LiveErgView />;
      case "plan":       return <WorkoutPlanSection />;
      case "ask":        return <AskSection />;
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

      {/* ── 4. Training Tools ─────────────────────────────────────────────── */}
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

      {/* ── 5. Calculators ────────────────────────────────────────────────── */}
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
