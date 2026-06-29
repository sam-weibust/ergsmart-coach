import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/getUser";
import type { AthleteTabProps } from "./types";

import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Activity,
  ChevronRight,
  Flame,
  Moon,
  Trophy,
  Utensils,
  Weight,
  Zap,
  Gauge,
  Ruler,
} from "lucide-react";

import RecoveryDashboard from "@/components/dashboard/RecoveryDashboard";
import MealPlanTab from "@/components/dashboard/MealPlanTab";
import HistorySection from "@/components/dashboard/HistorySection";
import StrengthProgramSection from "@/components/dashboard/StrengthProgramSection";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Watts from a 2K time in seconds. C2 power formula: P = 2.80 / (split/500)^3 */
function wattsFrom2kSeconds(totalSeconds: number | null | undefined): number | null {
  if (!totalSeconds || totalSeconds <= 0) return null;
  const splitSeconds = totalSeconds / 4; // 500m split from 2K time
  return Math.round(2.8 / Math.pow(splitSeconds / 500, 3));
}

/** Seconds → "M:SS" (or "H:MM:SS" for long pieces). */
function fmtTime(secs: number | null | undefined): string {
  if (secs == null || secs <= 0) return "—";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.round(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** PostgreSQL interval string ("HH:MM:SS.s" / "MM:SS.s") → "M:SS". */
function fmtInterval(interval: unknown): string {
  if (!interval) return "—";
  const str = String(interval).trim();
  const long = str.match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (long) {
    const totalMins = parseInt(long[1]) * 60 + parseInt(long[2]);
    const secs = Math.round(parseFloat(long[3]));
    return `${totalMins}:${String(secs).padStart(2, "0")}`;
  }
  const short = str.match(/^(\d+):(\d{2}(?:\.\d+)?)$/);
  if (short) {
    const m = short[1];
    const s = Math.round(parseFloat(short[2]));
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  return str;
}

/** Human-readable erg workout type label. */
function workoutTypeLabel(type: string | null | undefined): string {
  if (!type) return "Erg";
  const labels: Record<string, string> = {
    JustRow: "Just Row",
    FixedTimeInterval: "Time Interval",
    FixedDistanceInterval: "Distance Interval",
    FixedCalInterval: "Calorie Interval",
    multi_piece: "Multi-Piece",
    multi_piece_summary: "Multi-Piece",
  };
  return labels[type] ?? type.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim();
}

const today = () => new Date().toISOString().split("T")[0];
const nDaysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().split("T")[0];

// ─── Section shell ───────────────────────────────────────────────────────────

function SectionCard({
  title,
  icon: Icon,
  onOpen,
  children,
}: {
  title: string;
  icon: React.ElementType;
  onOpen?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="border border-border">
      <CardContent className="p-4">
        <button
          onClick={onOpen}
          disabled={!onOpen}
          className="w-full flex items-center justify-between mb-3 group disabled:cursor-default"
        >
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            {title}
          </h3>
          {onOpen && (
            <span className="text-xs text-primary flex items-center gap-0.5 group-hover:underline">
              View <ChevronRight className="h-3.5 w-3.5" />
            </span>
          )}
        </button>
        {children}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        <p className="text-xl font-bold text-foreground leading-none">{value}</p>
      </div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1.5">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground/70">{sub}</p>}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

type DetailView = "recovery" | "nutrition" | "history" | "strength" | null;

export default function MeTab(props: AthleteTabProps) {
  const { userId, profile, teamColor } = props;
  const [detail, setDetail] = useState<DetailView>(null);

  // Athlete profile (avatar, school, grad year) — same source as DashboardHome.
  const { data: ap } = useQuery({
    queryKey: ["athlete-profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const { data } = await supabase
        .from("athlete_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
  });

  // Verified personal bests from erg_scores (2k / 6k / 60min).
  const { data: bests, isLoading: bestsLoading } = useQuery({
    queryKey: ["me-verified-bests", userId],
    enabled: !!userId,
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const { data } = await supabase
        .from("erg_scores")
        .select("test_type, time_seconds, total_meters, is_verified, watts")
        .eq("user_id", user.id)
        .eq("is_verified", true);
      const rows = data || [];
      // Best 2k/6k = lowest time_seconds. Best 60min = most total_meters.
      const bestTime = (type: string) => {
        const vals = rows
          .filter((r: any) => r.test_type === type && r.time_seconds)
          .map((r: any) => r.time_seconds as number);
        return vals.length ? Math.min(...vals) : null;
      };
      const best2kWatts = (() => {
        const w = rows
          .filter((r: any) => r.test_type === "2k" && r.watts)
          .map((r: any) => Number(r.watts));
        return w.length ? Math.max(...w) : null;
      })();
      const best60Meters = (() => {
        const m = rows
          .filter((r: any) => r.test_type === "60min" && r.total_meters)
          .map((r: any) => Number(r.total_meters));
        return m.length ? Math.max(...m) : null;
      })();
      return {
        best2k: bestTime("2k"),
        best6k: bestTime("6k"),
        best60Meters,
        best2kWatts,
      };
    },
  });

  // Erg totals + workout dates (streak).
  const { data: ergStats, isLoading: ergLoading } = useQuery({
    queryKey: ["me-erg-stats", userId],
    enabled: !!userId,
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const { data } = await supabase
        .from("erg_workouts")
        .select("distance, workout_date, workout_type")
        .eq("user_id", user.id)
        .order("workout_date", { ascending: false })
        .limit(2000);
      const rows = (data || []).filter(
        // Avoid double-counting multi-piece children when a summary row exists.
        (w: any) => w.workout_type !== "multi_piece"
      );
      const totalMeters = rows.reduce((s: number, w: any) => s + (Number(w.distance) || 0), 0);
      const totalWorkouts = rows.length;
      const dates = rows.map((w: any) => w.workout_date as string).filter(Boolean);
      return { totalMeters, totalWorkouts, dates };
    },
  });

  const streak = useMemo(() => {
    const dates = ergStats?.dates ?? [];
    const t = today();
    const yesterday = nDaysAgo(1);
    const unique = [...new Set(dates)].sort((a, b) => b.localeCompare(a));
    let current = 0;
    let check = t;
    for (const d of unique) {
      if (d === check) {
        current++;
        const prev = new Date(check);
        prev.setDate(prev.getDate() - 1);
        check = prev.toISOString().split("T")[0];
      } else if (current === 0 && d === yesterday) {
        current++;
        const prev = new Date(yesterday);
        prev.setDate(prev.getDate() - 1);
        check = prev.toISOString().split("T")[0];
      } else if (d < check) {
        break;
      }
    }
    return current;
  }, [ergStats?.dates]);

  // Today's recovery (sleep + water + whoop) — mirrors DashboardHome's home query.
  const { data: recovery, isLoading: recoveryLoading } = useQuery({
    queryKey: ["me-recovery", userId],
    enabled: !!userId,
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const t = today();
      const [sleepRes, waterRes, whoopRes] = await Promise.all([
        supabase
          .from("sleep_entries")
          .select("duration_hours,quality_score,date")
          .eq("user_id", user.id)
          .order("date", { ascending: false })
          .limit(1),
        supabase.from("water_entries").select("amount_ml,date").eq("user_id", user.id).eq("date", t),
        supabase
          .from("whoop_recovery")
          .select("recovery_score")
          .eq("user_id", user.id)
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const lastSleep = sleepRes.data?.[0] ?? null;
      const whoopToday = whoopRes.data ?? null;
      const todayWater = (waterRes.data || []).reduce((s: number, e: any) => s + (e.amount_ml || 0), 0);
      const hydrationGoal =
        profile?.hydration_goal_ml && profile.hydration_goal_ml > 0 ? profile.hydration_goal_ml : 2500;

      let score: number | null = null;
      if (whoopToday?.recovery_score != null) {
        const hydComp = Math.min(100, (todayWater / hydrationGoal) * 100);
        score = Math.round(whoopToday.recovery_score * 0.7 + hydComp * 0.3);
      } else if (lastSleep) {
        const dur = Math.min(1, (lastSleep.duration_hours ?? 0) / 8) * 0.7;
        const qual = lastSleep.quality_score != null ? (lastSleep.quality_score / 10) * 0.3 : 0.15;
        const hydComp = Math.min(100, (todayWater / hydrationGoal) * 100);
        score = Math.round((dur + qual) * 100 * 0.5 + hydComp * 0.5);
      }
      return {
        score,
        sleepHours: lastSleep?.duration_hours ?? null,
        sleepQuality: lastSleep?.quality_score ?? null,
        fromWhoop: whoopToday?.recovery_score != null,
      };
    },
  });

  // Today's nutrition: logged calories + macros vs goal.
  const { data: nutrition, isLoading: nutritionLoading } = useQuery({
    queryKey: ["me-nutrition", userId],
    enabled: !!userId,
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const t = today();
      const [mealsRes, foodLogRes] = await Promise.all([
        supabase
          .from("meal_plans")
          .select("calories,protein,carbs,fats,meal_date")
          .eq("user_id", user.id)
          .eq("meal_date", t),
        // food_log isn't in the generated types — query the calorie column only
        // (matches the proven RecoveryDashboard pattern) so logged calories stay
        // consistent across the app. Macros come from meal_plans.
        (supabase.from("food_log") as any)
          .select("calories,date")
          .eq("user_id", user.id)
          .eq("date", t),
      ]);
      const meals = mealsRes.data || [];
      const foodLog = foodLogRes.data || [];
      const calories =
        meals.reduce((s: number, m: any) => s + (Number(m.calories) || 0), 0) +
        foodLog.reduce((s: number, f: any) => s + (Number(f.calories) || 0), 0);
      const protein = meals.reduce((s: number, m: any) => s + (Number(m.protein) || 0), 0);
      const carbs = meals.reduce((s: number, m: any) => s + (Number(m.carbs) || 0), 0);
      const fats = meals.reduce((s: number, m: any) => s + (Number(m.fats) || 0), 0);

      // Calorie goal — same TDEE model as RecoveryDashboard.
      const w = profile?.weight;
      const h = profile?.height || 175;
      const a = profile?.age || 25;
      const bmr = w ? 10 * w + 6.25 * h - 5 * a + 5 : 2000;
      const tdee = Math.round(bmr * 1.7);
      const goal =
        profile?.diet_goal === "cut" ? tdee - 400 : profile?.diet_goal === "bulk" ? tdee + 400 : tdee;

      return { calories, protein, carbs, fats, goal };
    },
  });

  // Last 5 erg workouts.
  const { data: recentWorkouts, isLoading: recentLoading } = useQuery({
    queryKey: ["me-recent-workouts", userId],
    enabled: !!userId,
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return [];
      const { data } = await supabase
        .from("erg_workouts")
        .select("id, workout_date, distance, avg_split, workout_type")
        .eq("user_id", user.id)
        .neq("workout_type", "multi_piece")
        .order("workout_date", { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  // Last strength session + current program (day-based; no Wendler cycle in schema).
  const { data: strength, isLoading: strengthLoading } = useQuery({
    queryKey: ["me-strength", userId],
    enabled: !!userId,
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const [logRes, workoutRes, programRes] = await Promise.all([
        supabase
          .from("strength_program_logs")
          .select("day_key, session_date")
          .eq("user_id", user.id)
          .order("session_date", { ascending: false })
          .limit(1),
        supabase
          .from("strength_workouts")
          .select("exercise, workout_date")
          .eq("user_id", user.id)
          .order("workout_date", { ascending: false })
          .limit(1),
        supabase
          .from("default_strength_programs")
          .select("name")
          .eq("is_default", true)
          .maybeSingle(),
      ]);
      const lastLog = logRes.data?.[0] ?? null;
      const lastWorkout = workoutRes.data?.[0] ?? null;
      // Use whichever strength record is most recent.
      let lastDate: string | null = null;
      let lastLabel: string | null = null;
      if (lastLog && lastWorkout) {
        if (lastLog.session_date >= lastWorkout.workout_date) {
          lastDate = lastLog.session_date;
          lastLabel = (lastLog.day_key || "").replace("day_", "Day ").toUpperCase();
        } else {
          lastDate = lastWorkout.workout_date;
          lastLabel = lastWorkout.exercise;
        }
      } else if (lastLog) {
        lastDate = lastLog.session_date;
        lastLabel = (lastLog.day_key || "").replace("day_", "Day ").toUpperCase();
      } else if (lastWorkout) {
        lastDate = lastWorkout.workout_date;
        lastLabel = lastWorkout.exercise;
      }
      return {
        lastDate,
        lastLabel,
        programName: programRes.data?.name ?? null,
      };
    },
  });

  // ── Derived display values ───────────────────────────────────────────────

  const name = profile?.full_name || profile?.username || "Athlete";
  const avatarUrl = ap?.avatar_url || profile?.avatar_url || undefined;
  const school = ap?.school || profile?.school || null;
  const gradYear = ap?.grad_year || null;
  const programName = profile?.experience_level
    ? profile.experience_level.charAt(0).toUpperCase() + profile.experience_level.slice(1)
    : null;

  // W/kg from verified best 2K watts and bodyweight.
  const best2kWatts = bests?.best2kWatts ?? wattsFrom2kSeconds(bests?.best2k);
  const weightKg = profile?.weight || null;
  const wkg = best2kWatts && weightKg ? (best2kWatts / weightKg).toFixed(1) : null;

  const totalKm = ergStats ? (ergStats.totalMeters / 1000).toFixed(1) : null;

  const calPct =
    nutrition && nutrition.goal > 0
      ? Math.min(100, Math.round((nutrition.calories / nutrition.goal) * 100))
      : 0;

  const recoveryColor = (s: number) => (s >= 75 ? "#10b981" : s >= 50 ? "#f59e0b" : "#ef4444");

  return (
    <div className="space-y-4 pb-24">
      {/* 1 ── Profile header ─────────────────────────────────────────────── */}
      <Card className="overflow-hidden border-0" style={{ background: teamColor }}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-16 w-16 ring-2 ring-white/20">
              <AvatarImage src={avatarUrl} />
              <AvatarFallback className="text-xl bg-white/20 text-white">
                {name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-bold text-white text-lg leading-tight truncate">{name}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                {programName && (
                  <Badge variant="secondary" className="text-[10px] bg-white/15 text-white border-0">
                    {programName}
                  </Badge>
                )}
                {gradYear && (
                  <Badge variant="secondary" className="text-[10px] bg-white/15 text-white border-0">
                    Class of {gradYear}
                  </Badge>
                )}
              </div>
              {school && <p className="text-[11px] text-white/60 mt-1 truncate">{school}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2 ── Personal bests ─────────────────────────────────────────────── */}
      <SectionCard title="Personal Bests" icon={Trophy}>
        {bestsLoading ? (
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Best 2K" value={fmtTime(bests?.best2k)} />
            <Stat label="Best 6K" value={fmtTime(bests?.best6k)} />
            <Stat
              label="Best 60min"
              value={bests?.best60Meters ? `${bests.best60Meters.toLocaleString()}m` : "—"}
            />
          </div>
        )}
        <p className="text-[10px] text-muted-foreground/70 text-center mt-2">Verified scores only</p>
      </SectionCard>

      {/* 3 ── Erg stats ──────────────────────────────────────────────────── */}
      <SectionCard title="Erg Stats" icon={Activity}>
        {ergLoading ? (
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            <Stat icon={Ruler} label="Total" value={totalKm ? `${totalKm}k` : "—"} sub="meters" />
            <Stat label="Workouts" value={ergStats?.totalWorkouts ?? "—"} />
            <Stat icon={Flame} label="Streak" value={streak} sub="days" />
            <Stat icon={Gauge} label="W/kg" value={wkg ?? "—"} />
          </div>
        )}
      </SectionCard>

      {/* 4 ── Recovery ───────────────────────────────────────────────────── */}
      <SectionCard title="Recovery" icon={Moon} onOpen={() => setDetail("recovery")}>
        {recoveryLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : recovery?.score != null ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold" style={{ color: recoveryColor(recovery.score) }}>
                {recovery.score}
              </span>
              <span className="text-xs text-muted-foreground">/100</span>
              {recovery.fromWhoop && (
                <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-[#e63946]/10 text-[#e63946]">
                  Whoop
                </span>
              )}
            </div>
            <div className="flex gap-4 text-right">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {recovery.sleepHours != null ? `${recovery.sleepHours}h` : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">Sleep</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {recovery.sleepQuality != null ? `${recovery.sleepQuality}/10` : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">Quality</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Log your morning check-in to see today's score.</p>
        )}
      </SectionCard>

      {/* 5 ── Nutrition ──────────────────────────────────────────────────── */}
      <SectionCard title="Nutrition" icon={Utensils} onOpen={() => setDetail("nutrition")}>
        {nutritionLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <p className="text-sm">
                <span className="text-xl font-bold text-foreground">
                  {nutrition?.calories ? Math.round(nutrition.calories).toLocaleString() : 0}
                </span>
                <span className="text-xs text-muted-foreground">
                  {" "}/ {nutrition?.goal ? nutrition.goal.toLocaleString() : "—"} kcal
                </span>
              </p>
              <span className="text-xs text-muted-foreground">{calPct}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${calPct}%`, background: teamColor }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground pt-1">
              <span>P {nutrition ? Math.round(nutrition.protein) : 0}g</span>
              <span>C {nutrition ? Math.round(nutrition.carbs) : 0}g</span>
              <span>F {nutrition ? Math.round(nutrition.fats) : 0}g</span>
            </div>
          </div>
        )}
      </SectionCard>

      {/* 6 ── Workout history ────────────────────────────────────────────── */}
      <SectionCard title="Recent Workouts" icon={Activity} onOpen={() => setDetail("history")}>
        {recentLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : (recentWorkouts?.length ?? 0) === 0 ? (
          <p className="text-xs text-muted-foreground">No workouts logged yet.</p>
        ) : (
          <div className="space-y-1.5">
            {(recentWorkouts as any[]).map((w) => (
              <div key={w.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">
                    {w.distance ? `${(w.distance / 1000).toFixed(1)}k` : workoutTypeLabel(w.workout_type)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {w.workout_date
                      ? new Date(w.workout_date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : ""}
                  </p>
                </div>
                <p className="text-xs font-mono font-semibold text-foreground">
                  {fmtInterval(w.avg_split)}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* 7 ── Strength ───────────────────────────────────────────────────── */}
      <SectionCard title="Strength" icon={Weight} onOpen={() => setDetail("strength")}>
        {strengthLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <div className="space-y-1.5">
            {strength?.programName && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Zap className="h-3.5 w-3.5 text-primary" />
                {strength.programName}
              </div>
            )}
            {strength?.lastDate ? (
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-foreground truncate">
                  Last: {strength.lastLabel || "Session"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(strength.lastDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No strength sessions logged yet.</p>
            )}
          </div>
        )}
      </SectionCard>

      {/* ── Detail drawers (reuse full existing components) ─────────────────── */}
      <Sheet open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent
          side="bottom"
          className="h-[92vh] overflow-y-auto p-4"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
        >
          <SheetHeader className="mb-3">
            <SheetTitle>
              {detail === "recovery"
                ? "Recovery"
                : detail === "nutrition"
                ? "Nutrition"
                : detail === "history"
                ? "Workout History"
                : detail === "strength"
                ? "Strength"
                : ""}
            </SheetTitle>
          </SheetHeader>
          {detail === "recovery" && <RecoveryDashboard profile={profile} />}
          {detail === "nutrition" && <MealPlanTab profile={profile} />}
          {detail === "history" && <HistorySection profile={profile} />}
          {detail === "strength" && <StrengthProgramSection profile={profile} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
