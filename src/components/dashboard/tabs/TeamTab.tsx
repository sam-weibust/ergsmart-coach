import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Users, CheckCircle2, XCircle, Loader2, Ship, Dumbbell, HeartPulse,
  Flame, MessageSquare, MapPin, ChevronDown, ChevronUp, ChevronRight,
  ClipboardList,
} from "lucide-react";
import type { AthleteTabProps } from "./types";

import { MessageBoard } from "@/components/dashboard/MessageBoard";
import RecoveryDashboard from "@/components/dashboard/RecoveryDashboard";
import MealPlanTab from "@/components/dashboard/MealPlanTab";
import PracticeDetail from "@/components/dashboard/team-optimization/PracticeDetail";

// Lineup seat display order: Cox (0), then 8 down to 1.
const SEAT_ORDER = [0, 8, 7, 6, 5, 4, 3, 2, 1];

/** Returns YYYY-MM-DD in the user's local timezone. */
function localToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── STATE A: No team — join code card ───────────────────────────────────────

function JoinTeamState({ profile, onRefresh }: { profile: any; onRefresh: () => Promise<void> }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Mirrors TeamsSection.tsx JoinTeamCard join logic exactly.
  const join = useMutation({
    mutationFn: async () => {
      const trimmed = code.trim();
      if (!trimmed) throw new Error("Enter a join code");
      const { data: team } = await supabase
        .from("teams")
        .select("id, name")
        .ilike("join_code", trimmed)
        .maybeSingle();
      if (!team) throw new Error("No team found with that code. Check the code and try again.");
      const { error: insertError } = await supabase.from("team_members").insert({
        team_id: team.id,
        user_id: profile.id,
      });
      if (insertError) {
        if (insertError.code === "23505") throw new Error("You are already on this team.");
        throw insertError;
      }
      return team.name;
    },
    onSuccess: async (teamName) => {
      toast({ title: `Joined ${teamName}!` });
      setCode("");
      setError(null);
      try { localStorage.setItem("onboarding_complete", "true"); } catch {}
      queryClient.invalidateQueries({ queryKey: ["teams", profile?.id] });
      queryClient.invalidateQueries({ queryKey: ["user-team-memberships"] });
      queryClient.invalidateQueries({ queryKey: ["teams-member-only", profile?.id] });
      // Reload the whole shell so it picks up the new team membership.
      await onRefresh();
    },
    onError: (e: Error) => {
      setError(e.message);
    },
  });

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardContent className="pt-8 pb-8 flex flex-col items-center gap-5">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Users className="h-7 w-7 text-primary" />
          </div>
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-foreground">Join a Team</h2>
            <p className="text-sm text-muted-foreground">Ask your coach for the team join code.</p>
          </div>
          <div className="w-full space-y-3">
            <Input
              placeholder="Enter join code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && join.mutate()}
              className="text-center text-lg font-mono tracking-widest uppercase"
              autoCapitalize="characters"
            />
            {error && <p className="text-xs text-destructive text-center">{error}</p>}
            <Button
              className="w-full"
              onClick={() => join.mutate()}
              disabled={join.isPending || !code.trim()}
            >
              {join.isPending
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Users className="h-4 w-4 mr-2" />}
              {join.isPending ? "Joining…" : "Join Team"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Section 1: Attendance check-in ──────────────────────────────────────────

function AttendanceCard({
  userId, teamId, teamColor,
}: { userId: string; teamId: string; teamColor: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = localToday();
  const todayLabel = new Date(today + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
  const [pendingStatus, setPendingStatus] = useState<"present" | "absent" | null>(null);

  const checkInKey = ["team-tab-checkin", teamId, today, userId];

  const { data: myCheckIn } = useQuery({
    queryKey: checkInKey,
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await (supabase as any)
        .from("attendance")
        .select("*")
        .eq("user_id", userId)
        .eq("team_id", teamId)
        .eq("date", today)
        .maybeSingle();
      return data;
    },
    enabled: !!userId,
  });

  const checkIn = useMutation({
    mutationFn: async (status: "present" | "absent") => {
      if (!userId) throw new Error("Not authenticated");
      setPendingStatus(status);
      // Real attendance schema: attendance(user_id, team_id, date, status),
      // onConflict user_id,team_id,date — matches AthleteTeamTab/TodayTab.
      const { error } = await (supabase as any)
        .from("attendance")
        .upsert(
          { user_id: userId, team_id: teamId, date: today, status },
          { onConflict: "user_id,team_id,date" }
        );
      if (error) throw error;

      // Notify coaches when the athlete marks themselves absent so the
      // "your coach has been notified" toast is truthful. Mirrors AthleteTeamTab.
      if (status === "absent") {
        const { data: memberProfile } = await supabase
          .from("profiles")
          .select("full_name, username")
          .eq("id", userId)
          .single();
        const athleteName = memberProfile?.full_name || memberProfile?.username || "An athlete";

        const { data: coaches } = await (supabase as any)
          .from("team_coaches")
          .select("user_id")
          .eq("team_id", teamId);
        const coachIds: string[] = (coaches ?? []).map((c: any) => c.user_id);

        const { data: team } = await supabase.from("teams").select("coach_id").eq("id", teamId).single();
        if (team?.coach_id && !coachIds.includes(team.coach_id)) coachIds.push(team.coach_id);

        if (coachIds.length > 0) {
          supabase.functions.invoke("send-notification", {
            body: {
              user_ids: coachIds,
              title: "Athlete Absent",
              body: `${athleteName} can't make it to ${todayLabel} practice`,
              type: "practice_reminder",
            },
          }).catch(() => {});
        }
      }
    },
    onSuccess: (_, status) => {
      setPendingStatus(null);
      toast({
        title: status === "present"
          ? "Confirmed! See you at practice."
          : "Got it. Your coach has been notified.",
      });
      queryClient.invalidateQueries({ queryKey: checkInKey });
    },
    onError: (e: Error) => {
      setPendingStatus(null);
      // Show the exact error text per spec.
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const myStatus = myCheckIn?.status as "present" | "absent" | undefined;

  return (
    <Card className="border-2" style={{ borderColor: `${teamColor}33` }}>
      <CardContent className="pt-4 pb-4">
        <p className="text-base font-bold text-foreground">Today's Attendance</p>
        <p className="text-xs text-muted-foreground mt-0.5 mb-4">{todayLabel}</p>

        {myStatus ? (
          <div className="space-y-3">
            <div className={cn(
              "flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium",
              myStatus === "present"
                ? "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30"
                : "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30"
            )}>
              {myStatus === "present"
                ? <><CheckCircle2 className="h-4 w-4 shrink-0" />You're confirmed for practice</>
                : <><XCircle className="h-4 w-4 shrink-0" />You marked yourself absent</>}
            </div>
            <Button
              size="sm" variant="outline" className="text-xs h-8"
              onClick={() => checkIn.mutate(myStatus === "present" ? "absent" : "present")}
              disabled={checkIn.isPending}
            >
              {checkIn.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Change Response
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Button
              className="min-h-[64px] text-sm bg-green-600 hover:bg-green-700 text-white gap-2 font-semibold flex-col"
              onClick={() => checkIn.mutate("present")}
              disabled={checkIn.isPending}
            >
              {checkIn.isPending && pendingStatus === "present"
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : <CheckCircle2 className="h-6 w-6" />}
              I'll Be There
            </Button>
            <Button
              className="min-h-[64px] text-sm bg-red-600 hover:bg-red-700 text-white gap-2 font-semibold flex-col"
              onClick={() => checkIn.mutate("absent")}
              disabled={checkIn.isPending}
            >
              {checkIn.isPending && pendingStatus === "absent"
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : <XCircle className="h-6 w-6" />}
              Can't Make It
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section 2: Today's Workout (read-only) ──────────────────────────────────

function WorkoutCard({ teamId }: { teamId: string }) {
  const today = localToday();

  const { data: dailyWorkout } = useQuery({
    queryKey: ["team-tab-daily-workout", teamId, today],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("team_daily_workouts")
        .select("*")
        .eq("team_id", teamId)
        .eq("date", today)
        .maybeSingle();
      return data;
    },
  });

  const { data: practiceEntry } = useQuery({
    queryKey: ["team-tab-practice-entry", teamId, today],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("practice_entries")
        .select("workout_description")
        .eq("team_id", teamId)
        .eq("practice_date", today)
        .maybeSingle();
      return data;
    },
  });

  const workout = (dailyWorkout as any)?.workout_data as any;
  const description = (practiceEntry as any)?.workout_description as string | undefined;
  const hasContent = !!workout || !!description;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Dumbbell className="h-4 w-4 text-primary" />Today's Workout
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasContent ? (
          <p className="text-sm text-muted-foreground italic">Workout not posted yet</p>
        ) : workout ? (
          <div className="space-y-2">
            {(workout.name || workout.boat_class || workout.zone || workout.duration) && (
              <div className="flex items-center gap-2 flex-wrap">
                {workout.name && (
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{workout.name}</span>
                )}
                {workout.boat_class && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 font-medium">{workout.boat_class}</span>
                )}
                {workout.zone && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{workout.zone}</span>
                )}
                {workout.duration && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">{workout.duration}</span>
                )}
              </div>
            )}
            {workout.warmup && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Warmup</p>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{workout.warmup}</p>
              </div>
            )}
            {workout.description && (
              <p className="text-sm text-foreground whitespace-pre-wrap">{workout.description}</p>
            )}
            {workout.rates && <p className="text-xs text-muted-foreground">Rates: {workout.rates}</p>}
            {workout.cooldown && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Cooldown</p>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{workout.cooldown}</p>
              </div>
            )}
            {workout.notes && <p className="text-xs text-muted-foreground italic">{workout.notes}</p>}
          </div>
        ) : (
          <p className="text-sm text-foreground whitespace-pre-wrap">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section 3: Lineups (published only, own seat highlighted) ────────────────

function LineupCard({
  teamId, userId, teamColor,
}: { teamId: string; userId: string; teamColor: string }) {
  const today = localToday();

  const { data: lineups = [] } = useQuery({
    queryKey: ["team-tab-lineups", teamId, today],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("boat_lineups")
        .select("*")
        .eq("team_id", teamId)
        .eq("practice_date", today)
        // PUBLISHED only: a draft has published_at = null.
        .not("published_at", "is", null)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Ship className="h-4 w-4 text-primary" />Lineup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {lineups.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No lineup posted yet.</p>
        ) : (
          lineups.map((lineup: any) => {
            const rawSeats: any[] = Array.isArray(lineup.seats) ? lineup.seats : [];
            const displaySeats = SEAT_ORDER
              .filter((n) => rawSeats.some((s: any) => s.seat_number === n))
              .map((n) => rawSeats.find((s: any) => s.seat_number === n));
            const isInBoat = rawSeats.some((s: any) => s.user_id === userId);

            return (
              <div
                key={lineup.id}
                className={cn("rounded-xl border p-3 space-y-2", isInBoat && "bg-primary/5")}
                style={isInBoat ? { borderColor: `${teamColor}55` } : undefined}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{lineup.name || "Lineup"}</span>
                  {lineup.boat_class && (
                    <Badge variant="outline" className="text-[10px]">{lineup.boat_class}</Badge>
                  )}
                </div>
                <div className="space-y-0.5">
                  {displaySeats.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-3 py-1">No seats assigned.</p>
                  ) : (
                    displaySeats.map((seat: any) => {
                      const isMe = seat.user_id === userId;
                      return (
                        <div
                          key={seat.seat_number}
                          className={cn(
                            "flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm",
                            isMe && "text-white"
                          )}
                          style={isMe ? { background: teamColor } : undefined}
                        >
                          <span className={cn(
                            "text-xs w-8 shrink-0 font-mono",
                            isMe ? "text-white/70" : "text-muted-foreground"
                          )}>
                            {seat.seat_number === 0 ? "C" : seat.seat_number}
                          </span>
                          <span className={cn("flex-1 truncate", isMe && "font-semibold")}>
                            {seat.name || "—"}
                          </span>
                          {isMe && (
                            <Badge className="bg-white/20 text-white border-white/30 text-[10px] px-1.5 py-0 shrink-0">
                              YOU
                            </Badge>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section 4: Recovery (summary, expands to full dashboard) ─────────────────

function RecoveryCard({ profile }: { profile: any }) {
  const [open, setOpen] = useState(false);
  const userId = profile?.id;
  const today = localToday();

  // Lightweight today-only recovery summary. Mirrors RecoveryDashboard's
  // component math but kept minimal for the at-a-glance card.
  const { data: summary, isLoading } = useQuery({
    queryKey: ["team-tab-recovery", userId, today],
    queryFn: async () => {
      if (!userId) return null;
      const hydrationGoal = profile?.hydration_goal_ml || 2500;
      const [sleepRes, waterRes] = await Promise.all([
        (supabase as any).from("sleep_entries").select("duration_hours,quality_score,date")
          .eq("user_id", userId).eq("date", today).maybeSingle(),
        (supabase as any).from("water_entries").select("amount_ml,date")
          .eq("user_id", userId).eq("date", today),
      ]);
      const sleep = sleepRes.data;
      const water = (waterRes.data || []).reduce((s: number, w: any) => s + (w.amount_ml || 0), 0);

      if (!sleep) return { score: null as number | null, summary: "Log sleep to see today's recovery score." };

      const durationScore = Math.min(1, (sleep.duration_hours || 0) / 8) * 0.7;
      const qualityScore = sleep.quality_score ? (sleep.quality_score / 10) * 0.3 : 0.15;
      const sleepComponent = (durationScore + qualityScore) * 100;
      const hydrationComponent = Math.min(100, (water / hydrationGoal) * 100);
      // 40 sleep / 20 hydration weighting (rest default) → scale to 100.
      const score = Math.round(sleepComponent * 0.65 + hydrationComponent * 0.35);
      const label = score >= 75 ? "Good" : score >= 50 ? "Moderate" : "Low";
      return {
        score,
        summary: `${label} — ${(sleep.duration_hours || 0)}h sleep, ${(water / 1000).toFixed(1)}L water today.`,
      };
    },
    enabled: !!userId,
  });

  const score = summary?.score ?? null;
  const color = score === null ? "#94a3b8" : score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <>
      <Card className="cursor-pointer active:opacity-80 transition-opacity" onClick={() => setOpen(true)}>
        <CardContent className="py-4 px-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-full flex items-center justify-center shrink-0"
            style={{ background: `${color}1f` }}>
            {isLoading
              ? <Loader2 className="h-5 w-5 animate-spin" style={{ color }} />
              : <span className="text-lg font-bold" style={{ color }}>{score ?? "--"}</span>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <HeartPulse className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Recovery</p>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {summary?.summary || "Track sleep, hydration, and weight."}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </CardContent>
      </Card>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[92vh] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Recovery</SheetTitle>
          </SheetHeader>
          <RecoveryDashboard profile={profile} />
        </SheetContent>
      </Sheet>
    </>
  );
}

// ─── Section 5: Nutrition (today calories vs goal, expands to logging) ────────

function NutritionCard({ profile }: { profile: any }) {
  const [open, setOpen] = useState(false);
  const userId = profile?.id;
  const today = localToday();

  // Calorie target — Mifflin-St Jeor, matches MealPlanTab.
  const calorieTarget = useMemo(() => {
    if (!profile?.weight) return 2500;
    const w = Number(profile.weight);
    const h = profile.height ? Number(profile.height) : 175;
    const a = profile.age ? Number(profile.age) : 25;
    const bmr = 10 * w + 6.25 * h - 5 * a + 5;
    const tdee = Math.round(bmr * 1.7);
    const dietGoal = profile?.diet_goal || "maintain";
    if (dietGoal === "cut") return tdee - 400;
    if (dietGoal === "bulk") return tdee + 400;
    return tdee;
  }, [profile]);

  const { data: calories = 0, isLoading } = useQuery({
    queryKey: ["team-tab-nutrition", userId, today],
    queryFn: async () => {
      if (!userId) return 0;
      // Calories logged today come from meal_plans (meal_date) and food_log (date).
      const [mealsRes, foodRes] = await Promise.all([
        (supabase as any).from("meal_plans").select("calories,meal_date").eq("user_id", userId).eq("meal_date", today),
        (supabase as any).from("food_log").select("calories,date").eq("user_id", userId).eq("date", today),
      ]);
      const meals = (mealsRes.data || []).reduce((s: number, m: any) => s + (m.calories || 0), 0);
      const food = ((foodRes.data as any[]) || []).reduce((s: number, f: any) => s + (f.calories || 0), 0);
      return meals + food;
    },
    enabled: !!userId,
  });

  const pct = Math.min(100, Math.round((calories / calorieTarget) * 100));

  return (
    <>
      <Card className="cursor-pointer active:opacity-80 transition-opacity" onClick={() => setOpen(true)}>
        <CardContent className="py-4 px-4">
          <div className="flex items-center gap-2 mb-2">
            <Flame className="h-4 w-4 text-orange-500" />
            <p className="text-sm font-semibold text-foreground">Nutrition</p>
            <span className="ml-auto text-xs text-muted-foreground">
              {isLoading ? "…" : `${calories} / ${calorieTarget} cal`}
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
          <Progress value={pct} className="h-2.5" />
          <p className="text-xs text-muted-foreground mt-1.5">
            {calories === 0 ? "No meals logged today. Tap to log." : `${pct}% of today's goal`}
          </p>
        </CardContent>
      </Card>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[92vh] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Nutrition</SheetTitle>
          </SheetHeader>
          <MealPlanTab profile={profile} />
        </SheetContent>
      </Sheet>
    </>
  );
}

// ─── Section 6: Messages (collapsed, preview) ────────────────────────────────

function MessagesCard({
  teamId, teamName, userId,
}: { teamId: string; teamName: string | null; userId: string }) {
  const [open, setOpen] = useState(false);

  const { data: latest } = useQuery({
    queryKey: ["team-tab-latest-message", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_messages")
        .select("content, created_at, profile:profiles(full_name, username)")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const preview = (latest as any)?.content as string | undefined;
  const author = (latest as any)?.profile?.full_name || (latest as any)?.profile?.username;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer select-none">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2 min-w-0">
                <MessageSquare className="h-4 w-4 text-primary shrink-0" />
                <span className="shrink-0">Messages</span>
                {!open && preview && (
                  <span className="text-xs text-muted-foreground font-normal truncate">
                    · {author ? `${author}: ` : ""}{preview}
                  </span>
                )}
              </CardTitle>
              {open
                ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4">
            <MessageBoard
              teamId={teamId}
              currentUserId={userId}
              title={teamName ? `${teamName} Chat` : "Team Chat"}
            />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ─── Section 7: Regattas (next upcoming + countdown, expands to full list) ────

function RegattasCard({ teamId }: { teamId: string }) {
  const [open, setOpen] = useState(false);
  const today = localToday();

  const { data: regattas = [] } = useQuery({
    queryKey: ["team-tab-regattas", teamId, today],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("regattas")
        .select("*")
        .eq("team_id", teamId)
        .gte("date", today)
        .order("date", { ascending: true });
      return data || [];
    },
  });

  const list = regattas as any[];
  const next = list[0];
  const daysTo = next
    ? Math.round((new Date(next.date + "T12:00:00").getTime() - new Date(today + "T12:00:00").getTime()) / 86400000)
    : null;
  const countdown = daysTo === null ? "" : daysTo === 0 ? "Today!" : daysTo === 1 ? "Tomorrow" : `${daysTo} days`;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />Regattas
          </CardTitle>
          {list.length > 1 && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
            >
              {open ? "Hide" : `View all (${list.length})`}
              {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!next ? (
          <p className="text-sm text-muted-foreground italic">No upcoming regattas scheduled.</p>
        ) : (
          <div className="space-y-2">
            {(open ? list : [next]).map((r: any) => {
              const d = Math.round((new Date(r.date + "T12:00:00").getTime() - new Date(today + "T12:00:00").getTime()) / 86400000);
              const cd = d === 0 ? "Today!" : d === 1 ? "1d" : `${d}d`;
              return (
                <div key={r.id} className="flex items-center gap-3 text-sm">
                  <div className="text-center bg-primary/10 rounded px-2 py-1 min-w-[48px]">
                    <p className="text-primary font-bold text-sm leading-none">{cd}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-foreground font-medium truncate">{r.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {new Date(r.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      {r.location ? ` — ${r.location}` : ""}
                    </p>
                  </div>
                </div>
              );
            })}
            {!open && (
              <p className="text-xs text-muted-foreground pt-1">
                Next up in <span className="font-semibold text-foreground">{countdown}</span>
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── STATE B: On a team ──────────────────────────────────────────────────────

function TeamHome(props: AthleteTabProps) {
  const { userId, profile, teamId, teamName, teamColor, isCoxswain } = props;
  const [logPracticeOpen, setLogPracticeOpen] = useState(false);
  // teamId is guaranteed non-null in this state.
  const tid = teamId as string;

  return (
    <div className="space-y-4 pb-4">
      <AttendanceCard userId={userId} teamId={tid} teamColor={teamColor} />
      <WorkoutCard teamId={tid} />
      <LineupCard teamId={tid} userId={userId} teamColor={teamColor} />
      <RecoveryCard profile={profile} />
      <NutritionCard profile={profile} />
      <MessagesCard teamId={tid} teamName={teamName} userId={userId} />
      <RegattasCard teamId={tid} />

      {isCoxswain && (
        <>
          <Button
            variant="outline"
            className="w-full gap-2 mt-2"
            onClick={() => setLogPracticeOpen(true)}
          >
            <ClipboardList className="h-4 w-4" />
            Log Practice
          </Button>

          <Sheet open={logPracticeOpen} onOpenChange={setLogPracticeOpen}>
            <SheetContent side="bottom" className="h-[92vh] overflow-y-auto">
              <SheetHeader className="mb-4">
                <SheetTitle>Log Practice</SheetTitle>
              </SheetHeader>
              <PracticeDetail teamId={tid} isCoach={false} profile={profile} seasonId={null} />
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );
}

// ─── Entry ───────────────────────────────────────────────────────────────────

export default function TeamTab(props: AthleteTabProps) {
  if (!props.teamId) {
    return <JoinTeamState profile={props.profile} onRefresh={props.onRefresh} />;
  }
  return <TeamHome {...props} />;
}
