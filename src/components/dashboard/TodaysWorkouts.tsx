import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Activity, Dumbbell, Sparkles, CalendarCheck, Flower2 } from "lucide-react";
import { WorkoutFeedback } from "./WorkoutFeedback";

interface TodaysWorkoutsProps {
  profile: any;
}

const lbsToKg = (lbs: number) => lbs / 2.20462;

const getZoneColor = (zone: string) => {
  switch (zone?.toUpperCase()) {
    case "UT2": return "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30";
    case "UT1": return "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30";
    case "TR": return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
    case "AT": return "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30";
    default: return "bg-muted text-muted-foreground";
  }
};

const TodaysWorkouts = ({ profile }: TodaysWorkoutsProps) => {
  const { toast } = useToast();
  const [savingErg, setSavingErg] = useState(false);
  const [savingStrength, setSavingStrength] = useState(false);
  const [ergFeedback, setErgFeedback] = useState<any>(null);
  const [strengthFeedback, setStrengthFeedback] = useState<any>(null);

  // Erg form - only fields the user needs to fill in
  const [ergActuals, setErgActuals] = useState({
    avg_split: "",
    avg_heart_rate: "",
    calories: "",
    notes: "",
  });

  // Strength form - weights/reps achieved per exercise
  const [strengthActuals, setStrengthActuals] = useState<
    Array<{ exercise: string; sets: string; reps: string; weight: string }>
  >([]);

  // Fetch the most recent plan
  const { data: latestPlan } = useQuery({
    queryKey: ["latest-workout-plan"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data } = await supabase
        .from("workout_plans")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return data;
    },
    enabled: !!profile,
  });

  // Compute today's workout from the plan
  const todaysPlan = useMemo(() => {
    if (!latestPlan?.workout_data || !latestPlan?.created_at) return null;

    const weeks = Array.isArray(latestPlan.workout_data) ? latestPlan.workout_data as any[] : [];
    if (weeks.length === 0 || weeks[0]?.fileUrl) return null;

    const planStart = new Date(latestPlan.created_at);
    const today = new Date();
    const diffMs = today.getTime() - planStart.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return null;

    const weekIndex = Math.floor(diffDays / 7);
    const dayIndex = diffDays % 7; // 0-6

    if (weekIndex >= weeks.length) return null;

    const week = weeks[weekIndex];
    const days = week?.days;
    if (!days || !Array.isArray(days)) return null;

    const dayPlan = days[dayIndex];
    if (!dayPlan) return null;

    return {
      weekNumber: week.week || weekIndex + 1,
      phase: week.phase || "",
      dayNumber: dayPlan.day || dayIndex + 1,
      ergWorkout: dayPlan.ergWorkout || null,
      strengthWorkout: dayPlan.strengthWorkout || null,
      yogaSession: dayPlan.yogaSession || null,
    };
  }, [latestPlan]);

  // Initialize strength actuals when plan changes
  useEffect(() => {
    if (todaysPlan?.strengthWorkout?.exercises) {
      setStrengthActuals(
        todaysPlan.strengthWorkout.exercises.map((ex: any) => ({
          exercise: ex.exercise || "",
          sets: ex.sets?.toString() || "",
          reps: ex.reps?.toString() || "",
          weight: ex.weight?.toString() || "",
        }))
      );
    }
  }, [todaysPlan]);

  if (!todaysPlan) return null;

  const { ergWorkout, strengthWorkout, yogaSession, weekNumber, phase, dayNumber } = todaysPlan;
  const isRestDay = !ergWorkout && !strengthWorkout && !!yogaSession;

  const handleLogErg = async () => {
    if (!profile || !ergWorkout) return;
    setSavingErg(true);

    try {
      // Build workout type from zone
      const workoutType = ergWorkout.zone
        ? `${ergWorkout.zone.toLowerCase()}_${ergWorkout.description?.toLowerCase().includes("interval") ? "intervals" : "steady_state"}`
        : "steady_state";

      // Parse duration to extract distance if mentioned
      const durationStr = ergWorkout.duration || "";
      const distanceMatch = ergWorkout.description?.match(/(\d{3,5})\s*m/);

      const workoutData = {
        user_id: profile.id,
        workout_type: workoutType,
        distance: distanceMatch ? parseInt(distanceMatch[1]) : null,
        duration: durationStr || null,
        avg_split: ergActuals.avg_split || ergWorkout.targetSplit || null,
        avg_heart_rate: ergActuals.avg_heart_rate ? parseInt(ergActuals.avg_heart_rate) : null,
        calories: ergActuals.calories ? parseInt(ergActuals.calories) : null,
        notes: ergActuals.notes || `${ergWorkout.zone || ""} - ${ergWorkout.description || ""}`,
        warmup_duration: ergWorkout.warmup || null,
        cooldown_duration: ergWorkout.cooldown || null,
        rest_periods: ergWorkout.restPeriods || null,
      };

      const { data, error } = await supabase
        .from("erg_workouts")
        .insert(workoutData as any)
        .select()
        .single();

      if (error) throw error;

      toast({ title: "Erg workout logged!", description: "Analyzing performance..." });

      // Get AI feedback
      try {
        const { data: recentWorkouts } = await supabase
          .from("erg_workouts")
          .select("*")
          .eq("user_id", profile.id)
          .order("workout_date", { ascending: false })
          .limit(5);

        const { data: fbData } = await supabase.functions.invoke("analyze-workout", {
          body: { workoutType: "erg", workout: { ...workoutData, id: data.id }, profile, recentWorkouts: recentWorkouts || [] },
        });
        if (fbData?.feedback) setErgFeedback(fbData.feedback);
      } catch {}

      setErgActuals({ avg_split: "", avg_heart_rate: "", calories: "", notes: "" });
    } catch (error) {
      console.error("Error saving:", error);
      toast({ title: "Error", description: "Failed to save workout.", variant: "destructive" });
    } finally {
      setSavingErg(false);
    }
  };

  const handleLogStrength = async () => {
    if (!profile || strengthActuals.length === 0) return;
    setSavingStrength(true);

    try {
      const validExercises = strengthActuals.filter(e => e.exercise && e.sets && e.reps && e.weight);
      if (validExercises.length === 0) {
        toast({ title: "Error", description: "Fill in at least one exercise.", variant: "destructive" });
        return;
      }

      const workoutsToInsert = validExercises.map(ex => ({
        user_id: profile.id,
        exercise: ex.exercise,
        sets: parseInt(ex.sets),
        reps: parseInt(ex.reps),
        weight: lbsToKg(parseFloat(ex.weight)),
        warmup_notes: strengthWorkout?.warmupNotes || null,
        cooldown_notes: strengthWorkout?.cooldownNotes || null,
        rest_between_sets: strengthWorkout?.exercises?.[0]?.restBetweenSets || null,
        notes: `Plan: Week ${weekNumber}, Day ${dayNumber}`,
      }));

      const { data, error } = await supabase
        .from("strength_workouts")
        .insert(workoutsToInsert as any)
        .select();

      if (error) throw error;

      toast({ title: "Strength workout logged!", description: `${validExercises.length} exercise(s) saved.` });

      // Get AI feedback
      try {
        const { data: recentWorkouts } = await supabase
          .from("strength_workouts")
          .select("*")
          .eq("user_id", profile.id)
          .order("workout_date", { ascending: false })
          .limit(10);

        const { data: fbData } = await supabase.functions.invoke("analyze-workout", {
          body: { workoutType: "strength", workout: { exercises: data, meta: {} }, profile, recentWorkouts: recentWorkouts || [] },
        });
        if (fbData?.feedback) setStrengthFeedback(fbData.feedback);
      } catch {}
    } catch (error) {
      console.error("Error saving:", error);
      toast({ title: "Error", description: "Failed to save workout.", variant: "destructive" });
    } finally {
      setSavingStrength(false);
    }
  };

  const updateStrengthActual = (index: number, field: string, value: string) => {
    setStrengthActuals(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  return (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-primary" />
              Today's Workouts
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">Week {weekNumber}</Badge>
              {phase && <Badge variant="outline" className="capitalize">{phase}</Badge>}
              <Badge variant="outline">Day {dayNumber}</Badge>
            </div>
          </div>
          <CardDescription>
            {isRestDay
              ? "Rest day — focus on recovery and yoga"
              : "From your training plan. Just fill in your actual results and log."}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Rest Day / Yoga */}
      {isRestDay && yogaSession && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Flower2 className="h-5 w-5 text-purple-500" />
              Yoga / Recovery Session
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="font-medium">Duration:</span> {yogaSession.duration}</div>
              <div><span className="font-medium">Focus:</span> {yogaSession.focus}</div>
            </div>
            {yogaSession.poses && (
              <p className="text-sm text-muted-foreground">{yogaSession.poses}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Erg Workout */}
      {ergWorkout && (
        <div className="space-y-4">
          {ergFeedback && <WorkoutFeedback feedback={ergFeedback} onDismiss={() => setErgFeedback(null)} />}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="h-5 w-5 text-blue-500" />
                Erg Workout
                {ergWorkout.zone && (
                  <Badge variant="outline" className={getZoneColor(ergWorkout.zone)}>
                    {ergWorkout.zone}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>{ergWorkout.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Pre-filled plan details (read-only context) */}
              <div className="p-3 rounded-lg bg-muted/50 space-y-1 text-sm">
                {ergWorkout.duration && <div><span className="font-medium">Duration:</span> {ergWorkout.duration}</div>}
                {ergWorkout.targetSplit && <div><span className="font-medium">Target Split:</span> {ergWorkout.targetSplit}</div>}
                {ergWorkout.rate && <div><span className="font-medium">Rate:</span> {ergWorkout.rate} spm</div>}
                {ergWorkout.warmup && <div><span className="font-medium">Warmup:</span> {ergWorkout.warmup}</div>}
                {ergWorkout.cooldown && <div><span className="font-medium">Cooldown:</span> {ergWorkout.cooldown}</div>}
                {ergWorkout.restPeriods && <div><span className="font-medium">Rest:</span> {ergWorkout.restPeriods}</div>}
              </div>

              <Separator />

              {/* User inputs - just their actual numbers */}
              <div className="space-y-1">
                <p className="text-sm font-medium text-primary">Your Actuals</p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">Avg Split (/500m)</Label>
                  <Input
                    placeholder={ergWorkout.targetSplit || "2:00.0"}
                    value={ergActuals.avg_split}
                    onChange={(e) => setErgActuals(p => ({ ...p, avg_split: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Avg HR (bpm)</Label>
                  <Input
                    type="number"
                    placeholder="150"
                    value={ergActuals.avg_heart_rate}
                    onChange={(e) => setErgActuals(p => ({ ...p, avg_heart_rate: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Calories</Label>
                  <Input
                    type="number"
                    placeholder="500"
                    value={ergActuals.calories}
                    onChange={(e) => setErgActuals(p => ({ ...p, calories: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  placeholder="How did it feel?"
                  value={ergActuals.notes}
                  onChange={(e) => setErgActuals(p => ({ ...p, notes: e.target.value }))}
                  className="min-h-16"
                />
              </div>

              <Button onClick={handleLogErg} disabled={savingErg} className="w-full">
                {savingErg ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                ) : (
                  "Log Erg Workout"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Strength Workout */}
      {strengthWorkout && strengthWorkout.exercises?.length > 0 && (
        <div className="space-y-4">
          {strengthFeedback && <WorkoutFeedback feedback={strengthFeedback} onDismiss={() => setStrengthFeedback(null)} />}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Dumbbell className="h-5 w-5 text-orange-500" />
                Strength Workout
                {strengthWorkout.focus && (
                  <Badge variant="outline">{strengthWorkout.focus}</Badge>
                )}
              </CardTitle>
              {strengthWorkout.warmupNotes && (
                <CardDescription>Warmup: {strengthWorkout.warmupNotes}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {strengthActuals.map((ex, index) => {
                const planned = strengthWorkout.exercises[index];
                return (
                  <div key={index} className="p-3 border rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{planned?.exercise || ex.exercise}</span>
                      {planned?.restBetweenSets && (
                        <span className="text-xs text-muted-foreground">Rest: {planned.restBetweenSets}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mb-1">
                      Plan: {planned?.sets} sets × {planned?.reps} reps @ {planned?.weight || "—"}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Sets</Label>
                        <Input
                          type="number"
                          placeholder={planned?.sets?.toString() || "3"}
                          value={ex.sets}
                          onChange={(e) => updateStrengthActual(index, "sets", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Reps</Label>
                        <Input
                          type="number"
                          placeholder={planned?.reps?.toString() || "8"}
                          value={ex.reps}
                          onChange={(e) => updateStrengthActual(index, "reps", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Weight (lbs)</Label>
                        <Input
                          type="number"
                          placeholder={planned?.weight || "—"}
                          value={ex.weight}
                          onChange={(e) => updateStrengthActual(index, "weight", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              {strengthWorkout.cooldownNotes && (
                <p className="text-xs text-muted-foreground">Cooldown: {strengthWorkout.cooldownNotes}</p>
              )}

              <Button onClick={handleLogStrength} disabled={savingStrength} className="w-full">
                {savingStrength ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                ) : (
                  `Log ${strengthActuals.length} Exercise${strengthActuals.length !== 1 ? "s" : ""}`
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default TodaysWorkouts;
