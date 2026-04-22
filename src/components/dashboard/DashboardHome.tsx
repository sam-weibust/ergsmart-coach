import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Activity, Calendar, Medal, Pencil, Flame, Clock, Zap, Trophy,
  RefreshCw, Loader2, MessageSquare, ChevronRight, CheckCircle2,
  User, Target, BarChart3, ArrowRight, AlertCircle, Moon, Droplets, Scale
} from "lucide-react";
import { ProfileEditPanel } from "./ProfileEditPanel";
import { DashboardCommunityFeed } from "./DashboardCommunityFeed";
import { c2Sync } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { getSessionUser } from '@/lib/getUser';

interface DashboardHomeProps {
  profile: any;
  navTo: (section: string, sub?: string) => void;
}

// Calculate watts from 2K time string "M:SS"
function wattsFrom2k(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const parts = timeStr.replace(/^00:/, "").split(":");
  if (parts.length !== 2) return null;
  const minutes = parseInt(parts[0]);
  const seconds = parseInt(parts[1]);
  if (isNaN(minutes) || isNaN(seconds)) return null;
  const totalSeconds = minutes * 60 + seconds;
  const splitSeconds = totalSeconds / 4; // 500m split from 2K time
  // C2 power formula: P = 2.80 / (split/500)^3
  const p = 2.80 / Math.pow(splitSeconds / 500, 3);
  return Math.round(p);
}

function formatSplit(rawSeconds: number | null | undefined): string {
  if (!rawSeconds) return "--";
  const m = Math.floor(rawSeconds / 60);
  const s = Math.round(rawSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatInterval(interval: unknown): string {
  if (!interval) return "--";
  const str = String(interval).trim();
  // PostgreSQL interval: "HH:MM:SS.s" or "MM:SS.s"
  const long = str.match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (long) {
    const totalMins = parseInt(long[1]) * 60 + parseInt(long[2]);
    const secs = parseFloat(long[3]);
    return `${totalMins}:${secs.toFixed(1).padStart(4, "0")}`;
  }
  const short = str.match(/^(\d+):(\d{2}(?:\.\d+)?)$/);
  if (short) return str;
  return str;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function DashboardHome({ profile, navTo }: DashboardHomeProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const [syncingC2, setSyncingC2] = useState(false);
  const [completingWorkout, setCompletingWorkout] = useState(false);

  // Athlete profile (avatar, school, grad year)
  const { data: ap } = useQuery({
    queryKey: ["athlete-profile"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const { data } = await supabase.from("athlete_profiles").select("*").eq("user_id", user.id).maybeSingle();
      return data;
    },
  });

  // User goals (2K times)
  const { data: userGoals } = useQuery({
    queryKey: ["user-goals"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const { data } = await supabase.from("user_goals").select("*").eq("user_id", user.id).maybeSingle();
      return data;
    },
  });

  // Recent workouts (last 3)
  const { data: recentWorkouts = [] } = useQuery({
    queryKey: ["recent-workouts-dashboard"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return [];
      const { data } = await supabase
        .from("erg_workouts")
        .select("id, workout_date, distance, duration, avg_split, stroke_rate")
        .eq("user_id", user.id)
        .order("workout_date", { ascending: false })
        .limit(3);
      return data || [];
    },
  });

  // Training streak
  const { data: workoutDates = [] } = useQuery({
    queryKey: ["workout-dates-streak"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return [];
      const { data } = await supabase
        .from("erg_workouts")
        .select("workout_date")
        .eq("user_id", user.id)
        .order("workout_date", { ascending: false })
        .limit(400);
      return (data || []).map((w: any) => w.workout_date as string);
    },
  });

  const streak = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const unique = [...new Set(workoutDates)].sort((a, b) => b.localeCompare(a));
    let current = 0;
    let check = today;
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
  }, [workoutDates]);

  // Upcoming regattas
  const { data: upcomingRegattas = [] } = useQuery({
    queryKey: ["upcoming-regattas-dashboard"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("regattas")
        .select("id, name, event_date, location")
        .gte("event_date", today)
        .order("event_date", { ascending: true })
        .limit(1);
      return data || [];
    },
  });

  // Recent team messages
  const { data: recentMessages = [] } = useQuery({
    queryKey: ["recent-team-messages-dashboard"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return [];
      // Get user's teams first
      const { data: memberships } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id)
        .limit(5);
      if (!memberships?.length) return [];
      const teamIds = memberships.map((m: any) => m.team_id);
      const { data } = await supabase
        .from("team_messages")
        .select("id, content, created_at, category, user_id, profile:profiles!team_messages_user_id_fkey(full_name, username)")
        .in("team_id", teamIds)
        .order("created_at", { ascending: false })
        .limit(3);
      return data || [];
    },
  });

  // Today's training plan
  const { data: todayPlan } = useQuery({
    queryKey: ["today-plan-dashboard"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("workout_plans")
        .select("id, plan_content, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Weekly challenge
  const { data: weeklyChallenge } = useQuery({
    queryKey: ["weekly-challenge-dashboard"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const weekStart = format(new Date(), "yyyy-'W'II");
      const monday = new Date();
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      const weekStartStr = monday.toISOString().split("T")[0];
      const { data } = await (supabase as any)
        .from("weekly_challenges")
        .select("*")
        .eq("week_start", weekStartStr)
        .maybeSingle();
      return data;
    },
  });

  // Recovery score for dashboard widget
  const { data: recoveryScore } = useQuery({
    queryKey: ["recovery-score-home"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const t = new Date().toISOString().split("T")[0];
      const [sleepRes, waterRes, weightRes, whoopRes] = await Promise.all([
        supabase.from("sleep_entries").select("duration_hours,quality_score,date").eq("user_id", user.id).order("date", { ascending: false }).limit(1),
        supabase.from("water_entries").select("amount_ml,date").eq("user_id", user.id).eq("date", t),
        supabase.from("weight_entries").select("date").eq("user_id", user.id).eq("date", t),
        supabase.from("whoop_recovery").select("recovery_score,hrv_rmssd").eq("user_id", user.id).order("date", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const whoopToday = whoopRes.data ?? null;
      const lastSleep = sleepRes.data?.[0];
      const todayWater = (waterRes.data || []).reduce((s: number, e: any) => s + (e.amount_ml || 0), 0);
      const hydrationGoal = profile?.hydration_goal_ml || 2500;
      let score: number;
      if (whoopToday?.recovery_score != null) {
        // Whoop is the authoritative recovery source
        const hydComp = Math.min(100, (todayWater / hydrationGoal) * 100);
        score = Math.round(whoopToday.recovery_score * 0.7 + hydComp * 0.3);
      } else {
        let sleepComp = 50, hydComp = 50;
        if (lastSleep) {
          const dur = Math.min(1, lastSleep.duration_hours / 8) * 0.7;
          const qual = lastSleep.quality_score ? (lastSleep.quality_score / 10) * 0.3 : 0.15;
          sleepComp = (dur + qual) * 100;
        }
        hydComp = Math.min(100, (todayWater / hydrationGoal) * 100);
        score = Math.round(sleepComp * 0.5 + hydComp * 0.5);
      }
      return { score, weightLogged: (weightRes.data || []).length > 0, fromWhoop: whoopToday?.recovery_score != null };
    },
  });

  const handleSyncC2 = async () => {
    setSyncingC2(true);
    try {
      const user = await getSessionUser();
      if (!user) return;
      const res = await c2Sync({ user_id: user.id });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast({ title: "Sync Complete", description: `${data.imported ?? 0} workouts synced` });
      queryClient.invalidateQueries({ queryKey: ["recent-workouts-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["workout-dates-streak"] });
    } catch (e: any) {
      // If not connected, navigate to settings
      navTo("settings", "connected-apps");
    } finally {
      setSyncingC2(false);
    }
  };

  const current2kDisplay = formatInterval(userGoals?.current_2k_time);
  const watts = wattsFrom2k(current2kDisplay !== "--" ? current2kDisplay : null);
  const weightKg = profile?.weight || null;
  const wkg = watts && weightKg ? (watts / weightKg).toFixed(1) : null;

  const name = (profile as any)?.full_name || (profile as any)?.username || "Athlete";
  const firstName = name.split(" ")[0];
  const school = ap?.school || (profile as any)?.school || null;
  const gradYear = ap?.grad_year || null;

  const nextRegatta = upcomingRegattas[0];
  const daysToRegatta = nextRegatta?.event_date
    ? differenceInCalendarDays(parseISO(nextRegatta.event_date), new Date())
    : null;

  // Today's workout summary from plan
  let todaySessionSummary: string | null = null;
  if (todayPlan?.plan_content) {
    try {
      const content = typeof todayPlan.plan_content === "string"
        ? JSON.parse(todayPlan.plan_content)
        : todayPlan.plan_content;
      const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
      if (content?.workouts || Array.isArray(content)) {
        const ws = content?.workouts || content;
        const todayW = ws.find((w: any) => w.day?.toLowerCase().includes(today.toLowerCase().slice(0, 3)));
        if (todayW) todaySessionSummary = todayW.description || todayW.name || null;
      } else if (content?.erg_workout?.description) {
        todaySessionSummary = content.erg_workout.description;
      }
    } catch {}
  }

  return (
    <div className="space-y-4">

        {/* Profile Card + Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Profile Card */}
          <Card className="md:col-span-1 overflow-hidden border-0 bg-gradient-to-br from-[#0a1628] to-[#112240]">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-14 w-14 ring-2 ring-white/20">
                    <AvatarImage src={ap?.avatar_url} />
                    <AvatarFallback className="text-lg bg-[#2d6be4] text-white">
                      {name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-bold text-white text-sm leading-tight">{name}</p>
                    {gradYear && <Badge variant="secondary" className="text-[10px] mt-0.5 bg-white/10 text-white/70 border-0">{gradYear}</Badge>}
                    {school && <p className="text-[10px] text-white/50 mt-0.5 leading-tight">{school}</p>}
                  </div>
                </div>
                <Button
                  onClick={() => setEditPanelOpen(true)}
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/10 shrink-0"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className="text-center">
                  <p className="text-lg font-bold text-white">{current2kDisplay}</p>
                  <p className="text-[10px] text-white/50">Best 2K</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-white">{wkg ? `${wkg}` : "--"}</p>
                  <p className="text-[10px] text-white/50">W/kg</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Flame className="h-4 w-4 text-orange-400" />
                    <p className="text-lg font-bold text-white">{streak}</p>
                  </div>
                  <p className="text-[10px] text-white/50">Streak</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats Row */}
          <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Today's Session */}
            <Card className="border border-border">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Today</span>
                </div>
                {todaySessionSummary ? (
                  <p className="text-xs font-medium text-foreground line-clamp-2">{todaySessionSummary}</p>
                ) : (
                  <button onClick={() => navTo("training", "plan")} className="text-xs text-primary hover:underline">View Plan →</button>
                )}
              </CardContent>
            </Card>

            {/* Fatigue */}
            <Card className="border border-border">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Fatigue</span>
                </div>
                <p className="text-xs font-medium text-foreground">
                  {streak > 5 ? "Moderate" : streak > 2 ? "Low" : "Fresh"}
                </p>
                <p className="text-[10px] text-muted-foreground">{streak} day run</p>
              </CardContent>
            </Card>

            {/* AI Coach */}
            <Card
              className="border border-border cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
              onClick={() => navTo("performance", "ask")}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="h-3.5 w-3.5 text-yellow-500" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">AI Coach</span>
                </div>
                <p className="text-xs font-medium text-foreground">Active</p>
                <p className="text-[10px] text-primary">Ask now →</p>
              </CardContent>
            </Card>

            {/* Next Regatta */}
            <Card className="border border-border">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Trophy className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Regatta</span>
                </div>
                {nextRegatta ? (
                  <>
                    <p className="text-xs font-medium text-foreground line-clamp-1">{nextRegatta.name}</p>
                    <p className="text-[10px] text-primary font-semibold">
                      {daysToRegatta === null ? "" : daysToRegatta === 0 ? "Today!" : daysToRegatta === 1 ? "Tomorrow" : `${daysToRegatta}d away`}
                    </p>
                  </>
                ) : (
                  <button onClick={() => navTo("regattas")} className="text-xs text-primary hover:underline">Find regattas →</button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recovery Score Widget */}
        <button
          onClick={() => navTo("training", "recovery")}
          className="w-full text-left"
        >
          <Card className="border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Moon className="h-4.5 w-4.5 text-primary" style={{ width: 18, height: 18 }} />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Recovery</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {recoveryScore !== null && recoveryScore !== undefined ? (
                        <>
                          <span className="text-lg font-bold" style={{
                            color: (recoveryScore?.score ?? 0) >= 75 ? "#10b981" : (recoveryScore?.score ?? 0) >= 50 ? "#f59e0b" : "#ef4444"
                          }}>{recoveryScore?.score ?? "--"}</span>
                          <span className="text-xs text-muted-foreground">/100</span>
                          <span className="text-xs font-medium px-1.5 py-0.5 rounded-full" style={{
                            background: ((recoveryScore?.score ?? 0) >= 75 ? "#10b981" : (recoveryScore?.score ?? 0) >= 50 ? "#f59e0b" : "#ef4444") + "22",
                            color: (recoveryScore?.score ?? 0) >= 75 ? "#10b981" : (recoveryScore?.score ?? 0) >= 50 ? "#f59e0b" : "#ef4444"
                          }}>
                            {(recoveryScore?.score ?? 0) >= 75 ? "Good" : (recoveryScore?.score ?? 0) >= 50 ? "Moderate" : "Low"}
                          </span>
                          {recoveryScore?.fromWhoop && (
                            <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-[#e63946]/10 text-[#e63946]">Whoop</span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">Log data to score</span>
                      )}
                    </div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </button>

        {/* Quick Actions */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              onClick={() => navTo("training", "erg")}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-card hover:bg-primary/5 hover:border-primary/30 transition-all text-sm font-medium text-foreground"
            >
              <Activity className="h-4 w-4 text-primary shrink-0" />
              <span className="truncate">Log Workout</span>
            </button>
            <button
              onClick={handleSyncC2}
              disabled={syncingC2}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-card hover:bg-primary/5 hover:border-primary/30 transition-all text-sm font-medium text-foreground disabled:opacity-60"
            >
              {syncingC2 ? <Loader2 className="h-4 w-4 text-primary shrink-0 animate-spin" /> : <RefreshCw className="h-4 w-4 text-primary shrink-0" />}
              <span className="truncate">Sync C2</span>
            </button>
            <button
              onClick={() => navTo("training", "plan")}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-card hover:bg-primary/5 hover:border-primary/30 transition-all text-sm font-medium text-foreground"
            >
              <Calendar className="h-4 w-4 text-primary shrink-0" />
              <span className="truncate">Training Plan</span>
            </button>
            <button
              onClick={() => navTo("competition", "leaderboard")}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-card hover:bg-primary/5 hover:border-primary/30 transition-all text-sm font-medium text-foreground"
            >
              <Medal className="h-4 w-4 text-primary shrink-0" />
              <span className="truncate">Leaderboard</span>
            </button>
          </div>
        </div>

        {/* Recent Activity + Training Plan Snapshot */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Recent Activity */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
                <button onClick={() => navTo("training", "history")} className="text-xs text-primary hover:underline flex items-center gap-1">
                  View all <ChevronRight className="h-3 w-3" />
                </button>
              </div>
              {recentWorkouts.length === 0 ? (
                <div className="text-center py-6">
                  <Activity className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No workouts yet</p>
                  <button onClick={() => navTo("training", "erg")} className="text-xs text-primary hover:underline mt-1">Log your first workout →</button>
                </div>
              ) : (
                <div className="space-y-2">
                  {(recentWorkouts as any[]).map((w: any) => (
                    <div key={w.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Activity className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-foreground">
                            {w.distance ? `${(w.distance / 1000).toFixed(1)}k erg` : "Erg workout"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {w.workout_date ? new Date(w.workout_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {w.avg_split && (
                          <p className="text-xs font-mono font-semibold text-foreground">{formatInterval(w.avg_split)}</p>
                        )}
                        {w.duration && (
                          <p className="text-[10px] text-muted-foreground">{formatInterval(w.duration)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Training Plan Snapshot */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">Today's Training</h3>
                <button onClick={() => navTo("training", "plan")} className="text-xs text-primary hover:underline flex items-center gap-1">
                  Full plan <ChevronRight className="h-3 w-3" />
                </button>
              </div>
              {todaySessionSummary ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                    <p className="text-xs text-foreground leading-relaxed">{todaySessionSummary}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 h-8 text-xs gap-1"
                      onClick={() => navTo("training", "erg")}
                    >
                      <Activity className="h-3 w-3" />
                      Log Now
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1 text-green-600 border-green-200 hover:bg-green-50"
                      onClick={() => {
                        setCompletingWorkout(true);
                        setTimeout(() => {
                          setCompletingWorkout(false);
                          toast({ title: "Workout marked complete!" });
                        }, 500);
                      }}
                      disabled={completingWorkout}
                    >
                      {completingWorkout ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                      Done
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <Calendar className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No plan generated yet</p>
                  <button onClick={() => navTo("training", "plan")} className="text-xs text-primary hover:underline mt-1">Generate your plan →</button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Message Board + Weekly Challenge */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Message Board */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">Team Messages</h3>
                <button onClick={() => navTo("teams", "messages")} className="text-xs text-primary hover:underline flex items-center gap-1">
                  View board <ChevronRight className="h-3 w-3" />
                </button>
              </div>
              {recentMessages.length === 0 ? (
                <div className="text-center py-6">
                  <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No messages yet</p>
                  <button onClick={() => navTo("teams", "messages")} className="text-xs text-primary hover:underline mt-1">Go to message board →</button>
                </div>
              ) : (
                <div className="space-y-2">
                  {(recentMessages as any[]).map((msg: any) => {
                    const authorName = msg.profile?.full_name || msg.profile?.username || "Teammate";
                    return (
                      <div key={msg.id} className="flex gap-2 py-2 border-b last:border-0">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <User className="h-3 w-3 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold text-foreground truncate">{authorName}</p>
                            <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(msg.created_at)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{msg.content}</p>
                        </div>
                      </div>
                    );
                  })}
                  <button
                    onClick={() => navTo("teams", "messages")}
                    className="w-full text-xs text-primary hover:underline text-center pt-1"
                  >
                    Reply in message board →
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Weekly Challenge */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">Weekly Challenge</h3>
                <button onClick={() => navTo("competition", "challenges")} className="text-xs text-primary hover:underline flex items-center gap-1">
                  View all <ChevronRight className="h-3 w-3" />
                </button>
              </div>
              {weeklyChallenge ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                      <Zap className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{weeklyChallenge.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{weeklyChallenge.description}</p>
                    </div>
                  </div>
                  {weeklyChallenge.goal_value && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Goal: {weeklyChallenge.goal_value} {weeklyChallenge.unit}</span>
                      <Badge variant="secondary" className="text-[10px]">{weeklyChallenge.points} pts</Badge>
                    </div>
                  )}
                  <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => navTo("competition", "challenges")}>
                    <ArrowRight className="h-3 w-3 mr-1" />
                    Join Challenge
                  </Button>
                </div>
              ) : (
                <div className="text-center py-6">
                  <Trophy className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No active challenge this week</p>
                  <button onClick={() => navTo("competition", "challenges")} className="text-xs text-primary hover:underline mt-1">Browse challenges →</button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Community Feed */}
        <DashboardCommunityFeed navTo={navTo} />

      <ProfileEditPanel open={editPanelOpen} onClose={() => setEditPanelOpen(false)} />
    </div>
  );
}
