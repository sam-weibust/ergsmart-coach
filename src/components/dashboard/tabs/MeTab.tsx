import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/getUser";
import type { AthleteTabProps } from "./types";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { recoveryColor } from "@/lib/design-system";

// The "More" surface (regattas, recruiting, connected apps, achievements,
// challenges, nutrition detail, H2H history) lives in its own always-visible
// bottom-bar tab — see ./MoreTab.tsx. Erg history and the strength program
// each have their own entry point on the Performance tab, and full
// recovery/nutrition detail live on the Team tab, so this screen stays a
// read-only "how am I doing today" snapshot: header, headline stats,
// recovery, nutrition, and recent workouts — no drill-in sheets.

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

/** One-line recovery status blurb, matching the recoveryColor tiers (>70 / 40-70 / <40). */
function recoveryBlurb(score: number): string {
  if (score > 70) return "Well recovered — good to push today.";
  if (score >= 40) return "Moderate recovery — listen to your body.";
  return "Low recovery — prioritize rest today.";
}

const today = () => new Date().toISOString().split("T")[0];
const nDaysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().split("T")[0];

// ─── Stats strip item ────────────────────────────────────────────────────────

function StatItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="text-center px-2">
      <p className="text-xs uppercase text-subtle">{label}</p>
      <p className="text-xl text-foreground data-value mt-1">{value}</p>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function MeTab(props: AthleteTabProps) {
  const { userId, profile } = props;

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

  // ── Derived display values ───────────────────────────────────────────────

  const name = profile?.full_name || profile?.username || "Athlete";
  const avatarUrl = ap?.avatar_url || profile?.avatar_url || undefined;
  const gradYear = ap?.grad_year || null;
  const programName = profile?.experience_level
    ? profile.experience_level.charAt(0).toUpperCase() + profile.experience_level.slice(1)
    : null;

  const totalKm = ergStats ? (ergStats.totalMeters / 1000).toFixed(1) : null;

  const calPct =
    nutrition && nutrition.goal > 0
      ? Math.min(100, Math.round((nutrition.calories / nutrition.goal) * 100))
      : 0;

  return (
    <div className="divide-y divide-border pb-24">
      {/* 1 ── Profile header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 px-4 py-5">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarImage src={avatarUrl} />
            <AvatarFallback className="bg-surface-2 text-foreground text-lg font-semibold">
              {name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-xl text-foreground truncate">{name}</p>
            {(programName || gradYear) && (
              <p className="text-sm text-muted-foreground truncate mt-0.5">
                {[programName, gradYear ? `Class of ${gradYear}` : null].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs uppercase text-subtle">Best 2K</p>
          <p className="text-lg font-semibold text-primary data-value mt-1">
            {bestsLoading ? "—" : fmtTime(bests?.best2k)}
          </p>
        </div>
      </div>

      {/* 2 ── Stats strip ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 divide-x divide-border px-4 py-5">
        <StatItem label="Total Meters" value={ergLoading ? "—" : totalKm ? `${totalKm}k` : "0k"} />
        <StatItem label="Total Workouts" value={ergLoading ? "—" : ergStats?.totalWorkouts ?? 0} />
        <StatItem label="Current Streak" value={ergLoading ? "—" : streak} />
      </div>

      {/* 3 ── Recovery ───────────────────────────────────────────────────── */}
      <div className="px-4 py-5">
        <h2 className="label-caption mb-3">Recovery</h2>
        {recoveryLoading ? (
          <div className="flex items-center gap-4">
            <span className="text-3xl text-subtle data-value">—</span>
            <p className="text-sm text-muted-foreground">Loading today's recovery…</p>
          </div>
        ) : recovery?.score != null ? (
          <div className="flex items-center gap-4">
            <span className="text-3xl data-value" style={{ color: recoveryColor(recovery.score) }}>
              {recovery.score}
            </span>
            <p className="text-sm text-muted-foreground flex-1">{recoveryBlurb(recovery.score)}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Log your morning check-in to see today's score.</p>
        )}
      </div>

      {/* 4 ── Nutrition ──────────────────────────────────────────────────── */}
      <div className="px-4 py-5">
        <h2 className="label-caption mb-3">Nutrition</h2>
        <div className="flex items-baseline justify-between mb-2">
          <div className="flex items-baseline gap-1">
            <span className="text-xl text-foreground data-value">
              {nutritionLoading
                ? "—"
                : nutrition?.calories
                ? Math.round(nutrition.calories).toLocaleString()
                : "0"}
            </span>
            <span className="text-sm text-muted-foreground">
              / {nutritionLoading ? "—" : nutrition?.goal ? nutrition.goal.toLocaleString() : "—"} kcal
            </span>
          </div>
          <span className="text-sm text-muted-foreground">{nutritionLoading ? "—" : `${calPct}%`}</span>
        </div>
        <div className="h-2 w-full rounded-full bg-surface-2 overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${calPct}%` }} />
        </div>
        <div className="flex justify-between text-sm text-muted-foreground pt-3">
          <span>P {nutritionLoading ? "—" : Math.round(nutrition?.protein ?? 0)}g</span>
          <span>C {nutritionLoading ? "—" : Math.round(nutrition?.carbs ?? 0)}g</span>
          <span>F {nutritionLoading ? "—" : Math.round(nutrition?.fats ?? 0)}g</span>
        </div>
      </div>

      {/* 5 ── Workout history ────────────────────────────────────────────── */}
      <div className="px-4 py-5">
        <h2 className="label-caption mb-3">Workout History</h2>
        {recentLoading ? (
          <div>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 py-3 border-b border-border last:border-0"
              >
                <span className="text-sm text-subtle w-16 shrink-0">—</span>
                <span className="text-base text-subtle flex-1 text-center">—</span>
                <span className="text-base text-subtle data-value w-16 shrink-0 text-right">—</span>
              </div>
            ))}
          </div>
        ) : (recentWorkouts?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No workouts logged yet.</p>
        ) : (
          <div>
            {(recentWorkouts as any[]).map((w) => {
              const distanceStr = w.distance ? `${(w.distance / 1000).toFixed(1)}k` : null;
              const typeLabel = workoutTypeLabel(w.workout_type);
              return (
                <div
                  key={w.id}
                  className="flex items-center justify-between gap-3 py-3 border-b border-border last:border-0"
                >
                  <span className="text-sm text-subtle w-16 shrink-0">
                    {w.workout_date
                      ? new Date(w.workout_date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </span>
                  <span className="text-base text-foreground flex-1 text-center truncate px-2">
                    {distanceStr ? `${typeLabel} · ${distanceStr}` : typeLabel}
                  </span>
                  <span className="text-base font-semibold text-foreground data-value w-16 shrink-0 text-right">
                    {fmtInterval(w.avg_split)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
