import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { WorkoutFeedback } from "./WorkoutFeedback";

interface StrengthWorkoutSectionProps {
  profile: any;
  fullView?: boolean;
}

const lbsToKg = (lbs: number) => lbs / 2.20462;

const StrengthWorkoutSection = ({ profile }: StrengthWorkoutSectionProps) => {
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [analyzingFeedback, setAnalyzingFeedback] = useState(false);

  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<any>(null);

  const [workout, setWorkout] = useState({
    exercise: "",
    sets: "",
    reps: "",
    weight: "",
    notes: "",
    warmup_notes: "",
    cooldown_notes: "",
    rest_between_sets: "",
  });

  // ⭐ STANDARDIZED: generate-strength via fetch()
  const getSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const [{ data: { session } }, { data: { user } }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.getUser(),
      ]);

      if (!session?.access_token || !user?.id) {
        throw new Error("Not logged in");
      }

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-strength`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            user_id: user.id,
            weight: profile.weight,
            height: profile.height,
            experience: profile.experience_level,
            goals: profile.goals,
          }),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `Error ${resp.status}`);
      }

      const data = await resp.json();
      setSuggestions(data.suggestions?.suggestions || []);
    } catch (error: any) {
      console.error("Error getting suggestions:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to get suggestions.",
        variant: "destructive",
      });
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const selectSuggestion = (s: any) => {
    const weightLbs = Math.round(s.recommendedWeight * 2.205);
    setWorkout({
      exercise: s.exercise,
      sets: s.sets.toString(),
      reps: s.reps.toString(),
      weight: weightLbs.toString(),
      notes: s.notes,
      warmup_notes: "",
      cooldown_notes: "",
      rest_between_sets: "",
    });
    setSuggestions([]);
  };

  // ⭐ STANDARDIZED: analyze-workout via fetch()
  const getAIFeedback = async (savedWorkout: any) => {
    setAnalyzingFeedback(true);
    try {
      const [{ data: { session } }, { data: { user } }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.getUser(),
      ]);

      if (!session?.access_token || !user?.id) {
        throw new Error("Not logged in");
      }

      const { data: recentWorkouts } = await supabase
        .from("strength_workouts")
        .select("*")
        .eq("user_id", user.id)
        .eq("exercise", savedWorkout.exercise)
        .order("workout_date", { ascending: false })
        .limit(5);

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-workout`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            user_id: user.id,
            workoutType: "strength",
            workout: savedWorkout,
            profile,
            recentWorkouts: recentWorkouts || [],
          }),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `Error ${resp.status}`);
      }

      const data = await resp.json();
      setFeedback(data.feedback);
    } catch (error: any) {
      console.error("Error getting feedback:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to analyze workout.",
        variant: "destructive",
      });
    } finally {
      setAnalyzingFeedback(false);
    }
  };

  const handleSave = async () => {
    if (!profile || !workout.exercise) return;

    setLoading(true);
    setFeedback(null);

    try {
      const weightKg = lbsToKg(parseFloat(workout.weight));

      const workoutData = {
        user_id: profile.id,
        exercise: workout.exercise,
        sets: parseInt(workout.sets),
        reps: parseInt(workout.reps),
        weight: weightKg,
        notes: workout.notes || null,
        warmup_notes: workout.warmup_notes || null,
        cooldown_notes: workout.cooldown_notes || null,
        rest_between_sets: workout.rest_between_sets || null,
      };

      const { data, error } = await supabase
        .from("strength_workouts")
        .insert(workoutData as any)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Workout logged!",
        description: "Analyzing your performance...",
      });

      await getAIFeedback({
        ...workoutData,
        id: data.id,
      });

      setWorkout({
        exercise: "",
        sets: "",
        reps: "",
        weight: "",
        notes: "",
        warmup_notes: "",
        cooldown_notes: "",
        rest_between_sets: "",
      });
    } catch (error: any) {
      console.error("Error saving workout:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save workout.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {feedback && (
        <WorkoutFeedback feedback={feedback} onDismiss={() => setFeedback(null)} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Log Strength Workout
            </span>
            <Button
              onClick={getSuggestions}
              disabled={loadingSuggestions}
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              {loadingSuggestions ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Get AI Suggestions
                </>
              )}
            </Button>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {suggestions.length > 0 && (
            <div className="space-y-2">
              <Label>Suggested Exercises (Pick One)</Label>
              <div className="grid gap-2">
                {suggestions.map((sug, idx) => (
                  <Button
                    key={idx}
                    onClick={() => selectSuggestion(sug)}
                    variant="outline"
                    className="justify-start h-auto py-3"
                  >
                    <div className="text-left">
                      <div className="font-semibold">{sug.exercise}</div>
                      <div className="text-sm text-muted-foreground">
                        {sug.sets} sets × {sug.reps} reps @{" "}
                        {Math.round(sug.recommendedWeight * 2.205)} lbs
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="exercise">Exercise</Label>
            <Input
              id="exercise"
              placeholder="Deadlift, Squat, Bench Press..."
              value={workout.exercise}
              onChange={(e) => setWorkout({ ...workout, exercise: e.target.value })}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="sets">Sets</Label>
              <Input
                id="sets"
                type="number"
                placeholder="3"
                value={workout.sets}
                onChange={(e) => setWorkout({ ...workout, sets: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reps">Reps</Label>
              <Input
                id="reps"
                type="number"
                placeholder="8"
                value={workout.reps}
                onChange={(e) => setWorkout({ ...workout, reps: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="weight">Weight (lbs)</Label>
              <Input
                id="weight"
                type="number"
                step="5"
                placeholder="225"
                value={workout.weight}
                onChange={(e) => setWorkout({ ...workout, weight: e.target.value })}
              />
            </div>
          </div>

          <div className="border-t pt-4 mt-4">
            <h4 className="text-sm font-medium mb-3">Warmup / Cooldown / Rest</h4>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="warmup_notes">Warmup</Label>
                <Input
                  id="warmup_notes"
                  placeholder="e.g., 5 min row, dynamic stretching"
                  value={workout.warmup_notes}
                  onChange={(e) => setWorkout({ ...workout, warmup_notes: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cooldown_notes">Cooldown</Label>
                <Input
                  id="cooldown_notes"
                  placeholder="e.g., 5 min walk, static stretching"
                  value={workout.cooldown_notes}
                  onChange={(e) => setWorkout({ ...workout, cooldown_notes: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rest_between_sets">Rest Between Sets</Label>
                <Input
                  id="rest_between_sets"
                  placeholder="e.g., 2:00"
                  value={workout.rest_between_sets}
                  onChange={(e) => setWorkout({ ...workout, rest_between_sets: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Form notes, RPE, etc."
              value={workout.notes}
              onChange={(e) => setWorkout({ ...workout, notes: e.target.value })}
              className="min-h-20"
            />
          </div>

          <Button
            onClick={handleSave}
            disabled={loading || analyzingFeedback || !workout.exercise}
            className="w-full"
          >
            {loading || analyzingFeedback ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {analyzingFeedback ? "Analyzing..." : "Saving..."}
              </>
            ) : (
              "Log Workout & Get Feedback"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default StrengthWorkoutSection;
