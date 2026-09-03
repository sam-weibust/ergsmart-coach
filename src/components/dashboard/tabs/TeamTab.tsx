import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { colors } from "@/lib/design-system";
import {
  Loader2, ChevronDown, ChevronUp, ChevronRight, ClipboardList, Users,
} from "lucide-react";
import type { AthleteTabProps } from "./types";

import { MessageBoard } from "@/components/dashboard/MessageBoard";
import RecoveryDashboard from "@/components/dashboard/RecoveryDashboard";
import MealPlanTab from "@/components/dashboard/MealPlanTab";
import PracticeDetail from "@/components/dashboard/team-optimization/PracticeDetail";

// Lineup seat display order: Cox (0), then 8 down to 1.
const SEAT_ORDER = [0, 8, 7, 6, 5, 4, 3, 2, 1];

// Shared focus ring for the plain <button> elements below (Button.tsx's own
// cva base carries the same treatment; these are hand-rolled so they need it
// spelled out explicitly to stay keyboard-accessible).
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Returns YYYY-MM-DD in the user's local timezone. */
function localToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── STATE A: No team — join by code ─────────────────────────────────────────

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
      // Single SECURITY DEFINER RPC. The old lookup+insert pair could never
      // work for a prospective member: RLS hides teams you are not on from the
      // `teams` SELECT policy, and `team_members` INSERT requires a coach.
      // The RPC raises "No team found with that code" / "You are already on
      // this team" itself, so just surface error.message.
      // Cast: types.ts has not been regenerated with the new RPC yet.
      const { data, error } = await (supabase as any).rpc("join_team_by_code", {
        p_code: trimmed,
      });
      if (error) throw new Error(error.message);
      // RETURNS TABLE → data is an array of { team_id, team_name }.
      const team = (data as { team_id: string; team_name: string }[] | null)?.[0];
      if (!team) throw new Error("No team found with that code. Check the code and try again.");
      return team.team_name;
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
      <div className="w-full max-w-sm flex flex-col items-center gap-5">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Users className="h-6 w-6 text-primary" strokeWidth={1.5} />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-xl text-foreground">Join a Team</h2>
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
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          <Button
            size="lg"
            className="w-full"
            onClick={() => join.mutate()}
            disabled={join.isPending || !code.trim()}
          >
            {join.isPending
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" strokeWidth={1.5} />
              : <Users className="h-4 w-4 mr-2" strokeWidth={1.5} />}
            {join.isPending ? "Joining…" : "Join Team"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Section 1: Attendance check-in ──────────────────────────────────────────

function AttendanceCard({
  userId, teamId,
}: { userId: string; teamId: string }) {
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
    <div>
      <p className="text-sm text-muted-foreground mb-3">{todayLabel}</p>

      {myStatus ? (
        <div className="flex items-center justify-between gap-3">
          <span className={cn(
            "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium",
            myStatus === "present" ? "bg-success/15 text-success" : "bg-danger-subtle text-destructive"
          )}>
            <span className="h-1 w-1 rounded-full bg-current shrink-0" />
            {myStatus === "present" ? "You're confirmed for practice" : "You marked yourself absent"}
          </span>
          <button
            type="button"
            onClick={() => checkIn.mutate(myStatus === "present" ? "absent" : "present")}
            disabled={checkIn.isPending}
            className={cn(
              "text-sm font-medium text-primary hover:underline shrink-0 py-2 rounded disabled:opacity-50 disabled:pointer-events-none",
              FOCUS_RING
            )}
          >
            {checkIn.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> : "Change"}
          </button>
        </div>
      ) : (
        <div className="flex gap-3">
          <Button
            variant="success"
            className="flex-1 h-14 rounded-full text-base font-semibold"
            onClick={() => checkIn.mutate("present")}
            disabled={checkIn.isPending}
          >
            {checkIn.isPending && pendingStatus === "present"
              ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
              : "I'll Be There"}
          </Button>
          <button
            type="button"
            onClick={() => checkIn.mutate("absent")}
            disabled={checkIn.isPending}
            className={cn(
              "flex-1 h-14 rounded-full text-base font-semibold bg-danger-subtle text-destructive flex items-center justify-center gap-2 transition-opacity active:scale-[0.98] hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none",
              FOCUS_RING
            )}
          >
            {checkIn.isPending && pendingStatus === "absent"
              ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
              : "Can't Make It"}
          </button>
        </div>
      )}
    </div>
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
  // Secondary tags shown next to the workout name — plain text, not badges.
  const workoutMeta: string[] = workout
    ? [workout.boat_class, workout.zone, workout.duration].filter(Boolean)
    : [];

  return (
    <div>
      <p className="label-caption mb-2">Today's Workout</p>
      {!hasContent ? (
        <p className="text-sm italic text-subtle">Your coach hasn't posted today's workout yet.</p>
      ) : workout ? (
        <div className="space-y-2">
          {(workout.name || workoutMeta.length > 0) && (
            <div className="flex items-baseline gap-2 flex-wrap">
              {workout.name && (
                <span className="text-sm font-semibold text-foreground">{workout.name}</span>
              )}
              {workoutMeta.length > 0 && (
                <span className="text-sm text-muted-foreground">{workoutMeta.join(" · ")}</span>
              )}
            </div>
          )}
          {workout.warmup && (
            <div>
              <p className="label-caption mb-0.5">Warmup</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{workout.warmup}</p>
            </div>
          )}
          {workout.description && (
            <p className="text-base text-foreground whitespace-pre-wrap">{workout.description}</p>
          )}
          {workout.rates && <p className="text-sm text-muted-foreground">Rates: {workout.rates}</p>}
          {workout.cooldown && (
            <div>
              <p className="label-caption mb-0.5">Cooldown</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{workout.cooldown}</p>
            </div>
          )}
          {workout.notes && <p className="text-sm italic text-subtle">{workout.notes}</p>}
        </div>
      ) : (
        <p className="text-base text-foreground whitespace-pre-wrap">{description}</p>
      )}
    </div>
  );
}

// ─── Section 3: Lineups (published only, own seat highlighted) ────────────────

function LineupCard({
  teamId, userId,
}: { teamId: string; userId: string }) {
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

  const list = lineups as any[];

  return (
    <div>
      <p className="label-caption mb-2">Lineup</p>
      {list.length === 0 ? (
        <p className="text-sm italic text-subtle">No lineup posted yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {list.map((lineup: any, i: number) => {
            const rawSeats: any[] = Array.isArray(lineup.seats) ? lineup.seats : [];
            const displaySeats = SEAT_ORDER
              .filter((n) => rawSeats.some((s: any) => s.seat_number === n))
              .map((n) => rawSeats.find((s: any) => s.seat_number === n));

            return (
              <div key={lineup.id} className={cn("space-y-1", i === 0 ? "pb-4" : "py-4")}>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-foreground">{lineup.name || "Lineup"}</span>
                  {lineup.boat_class && (
                    <span className="text-xs text-subtle">· {lineup.boat_class}</span>
                  )}
                </div>
                {displaySeats.length === 0 ? (
                  <p className="text-sm italic text-subtle py-1">No seats assigned.</p>
                ) : (
                  displaySeats.map((seat: any) => {
                    const isMe = seat.user_id === userId;
                    return (
                      <div
                        key={seat.seat_number}
                        className={cn(
                          "flex items-center gap-3 py-1.5 pl-3 border-l-2",
                          isMe ? "border-primary" : "border-transparent"
                        )}
                      >
                        <span className="text-xs text-subtle w-8 shrink-0 font-mono">
                          {seat.seat_number === 0 ? "C" : seat.seat_number}
                        </span>
                        <span className={cn(
                          "flex-1 truncate text-base",
                          isMe ? "text-primary font-semibold" : "text-muted-foreground"
                        )}>
                          {seat.name || "—"}
                        </span>
                        {isMe && (
                          <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                            YOU
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Section 4: Roster (collapsed, X of Y confirmed) ─────────────────────────

function RosterCard({ teamId, userId }: { teamId: string; userId: string }) {
  const [open, setOpen] = useState(false);
  const today = localToday();

  // Mirrors AthleteTeamTab.tsx's roster query (team_members joined to profiles).
  const { data: members = [] } = useQuery({
    queryKey: ["team-tab-roster", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_members")
        .select("user_id, profile:profiles(full_name, username)")
        .eq("team_id", teamId);
      return data || [];
    },
  });

  // Mirrors AthleteTeamTab.tsx's todayAttendance query — team-wide, not just
  // the current user's own row (that's AttendanceCard's separate query above).
  const { data: attendance = [] } = useQuery({
    queryKey: ["team-tab-roster-attendance", teamId, today],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("attendance")
        .select("user_id, status")
        .eq("team_id", teamId)
        .eq("date", today);
      return data || [];
    },
  });

  const memberList = members as any[];
  const attendanceByUser = Object.fromEntries(
    (attendance as any[]).map((a: any) => [a.user_id, a.status])
  );
  const confirmedCount = memberList.filter((m: any) => attendanceByUser[m.user_id] === "present").length;

  return (
    <div>
      <p className="label-caption mb-2">Roster</p>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              "w-full flex items-center justify-between gap-2 py-3 text-left rounded",
              FOCUS_RING
            )}
          >
            <span className="text-sm text-muted-foreground">
              {confirmedCount} of {memberList.length} confirmed
            </span>
            {open
              ? <ChevronUp className="h-4 w-4 text-subtle shrink-0" strokeWidth={1.5} />
              : <ChevronDown className="h-4 w-4 text-subtle shrink-0" strokeWidth={1.5} />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pt-3 space-y-0.5">
            {memberList.map((m: any) => {
              const status = attendanceByUser[m.user_id];
              const isMe = m.user_id === userId;
              return (
                <div key={m.user_id} className="flex items-center gap-2.5 py-1.5">
                  <span className={cn(
                    "h-1 w-1 rounded-full shrink-0",
                    status === "present" ? "bg-success" :
                    status === "absent" ? "bg-destructive" :
                    "bg-subtle"
                  )} />
                  <span className={cn(
                    "flex-1 truncate text-base",
                    isMe ? "text-primary font-semibold" : "text-muted-foreground"
                  )}>
                    {m.profile?.full_name || m.profile?.username || "Teammate"}
                  </span>
                  {isMe && (
                    <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                      YOU
                    </span>
                  )}
                </div>
              );
            })}
            {memberList.length === 0 && (
              <p className="text-sm italic text-subtle py-1">No teammates found.</p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ─── Section 5: Recovery (summary, expands to full dashboard) ─────────────────

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
  // Same 75/50 thresholds as the label above, just mapped to the design
  // system's success/warning/danger hex values instead of old ad hoc ones.
  const scoreColor = score === null ? colors.textTertiary
    : score >= 75 ? colors.success
    : score >= 50 ? colors.warning
    : colors.danger;

  return (
    <div>
      <p className="label-caption mb-2">Recovery</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("w-full flex items-center gap-3 text-left rounded", FOCUS_RING)}
      >
        <span
          className="h-12 w-12 rounded-full flex items-center justify-center shrink-0 text-lg font-bold"
          style={{ background: `${scoreColor}1f`, color: scoreColor }}
        >
          {isLoading ? "—" : score ?? "—"}
        </span>
        <span className="flex-1 min-w-0 text-sm text-muted-foreground truncate">
          {summary?.summary || "Track sleep, hydration, and weight."}
        </span>
        <ChevronRight className="h-4 w-4 text-subtle shrink-0" strokeWidth={1.5} />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[92vh] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Recovery</SheetTitle>
          </SheetHeader>
          <RecoveryDashboard profile={profile} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Section 6: Nutrition (today calories vs goal, expands to logging) ────────

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
    <div>
      <p className="label-caption mb-2">Nutrition</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("w-full text-left rounded", FOCUS_RING)}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-muted-foreground flex-1">
            {isLoading ? "—" : `${calories} / ${calorieTarget} cal`}
          </span>
          <ChevronRight className="h-4 w-4 text-subtle shrink-0" strokeWidth={1.5} />
        </div>
        <Progress value={pct} className="h-2.5" />
        <p className="text-sm text-muted-foreground mt-1.5">
          {calories === 0 ? "No meals logged today. Tap to log." : `${pct}% of today's goal`}
        </p>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[92vh] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Nutrition</SheetTitle>
          </SheetHeader>
          <MealPlanTab profile={profile} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Section 7: Messages (collapsed, preview) ────────────────────────────────

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
    <div>
      <p className="label-caption mb-2">Messages</p>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              "w-full flex items-center justify-between gap-2 py-3 text-left rounded",
              FOCUS_RING
            )}
          >
            {preview ? (
              <span className="text-sm text-muted-foreground truncate min-w-0 flex-1">
                {author ? `${author}: ` : ""}{preview}
              </span>
            ) : (
              <span className="text-sm italic text-subtle truncate min-w-0 flex-1">No messages yet.</span>
            )}
            {open
              ? <ChevronUp className="h-4 w-4 text-subtle shrink-0" strokeWidth={1.5} />
              : <ChevronDown className="h-4 w-4 text-subtle shrink-0" strokeWidth={1.5} />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pt-3">
            <MessageBoard
              teamId={teamId}
              currentUserId={userId}
              title={teamName ? `${teamName} Chat` : "Team Chat"}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ─── Section 8: Regattas (next upcoming + countdown, expands to full list) ────

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
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="label-caption">Regattas</p>
        {list.length > 1 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5 rounded",
              FOCUS_RING
            )}
          >
            {open ? "Hide" : `View all (${list.length})`}
            {open ? <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.5} /> : <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />}
          </button>
        )}
      </div>
      {!next ? (
        <p className="text-sm italic text-subtle">No upcoming regattas scheduled.</p>
      ) : (
        <div className="space-y-2">
          {(open ? list : [next]).map((r: any) => {
            const d = Math.round((new Date(r.date + "T12:00:00").getTime() - new Date(today + "T12:00:00").getTime()) / 86400000);
            const cd = d === 0 ? "Today!" : d === 1 ? "1d" : `${d}d`;
            return (
              <div key={r.id} className="flex items-center gap-3">
                <div className="text-center bg-primary/10 rounded-md px-2 py-1 min-w-[48px] shrink-0">
                  <p className="text-primary font-bold text-sm leading-none">{cd}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-foreground font-medium truncate">{r.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(r.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    {r.location ? ` — ${r.location}` : ""}
                  </p>
                </div>
              </div>
            );
          })}
          {!open && (
            <p className="text-sm text-muted-foreground pt-1">
              Next up in <span className="font-semibold text-foreground">{countdown}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── STATE B: On a team ──────────────────────────────────────────────────────

function TeamHome(props: AthleteTabProps) {
  const { userId, profile, teamId, teamName, isCoxswain } = props;
  const [logPracticeOpen, setLogPracticeOpen] = useState(false);
  // teamId is guaranteed non-null in this state.
  const tid = teamId as string;

  return (
    <div className="divide-y divide-border">
      <div className="pb-5">
        <AttendanceCard userId={userId} teamId={tid} />
      </div>
      <div className="py-5">
        <WorkoutCard teamId={tid} />
      </div>
      <div className="py-5">
        <LineupCard teamId={tid} userId={userId} />
      </div>
      <div className="py-5">
        <RosterCard teamId={tid} userId={userId} />
      </div>
      <div className="py-5">
        <RecoveryCard profile={profile} />
      </div>
      <div className="py-5">
        <NutritionCard profile={profile} />
      </div>
      <div className="py-5">
        <MessagesCard teamId={tid} teamName={teamName} userId={userId} />
      </div>
      <div className="py-5">
        <RegattasCard teamId={tid} />
      </div>

      {isCoxswain && (
        <div className="py-5">
          <Button
            variant="outline"
            size="lg"
            className="w-full gap-2"
            onClick={() => setLogPracticeOpen(true)}
          >
            <ClipboardList className="h-4 w-4" strokeWidth={1.5} />
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
        </div>
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
