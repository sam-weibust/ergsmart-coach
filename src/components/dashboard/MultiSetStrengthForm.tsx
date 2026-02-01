import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Sparkles, Dumbbell } from "lucide-react";
import { WorkoutFeedback } from "./WorkoutFeedback";

interface Exercise {
  exercise: string;
  sets: string;
  reps: string;
  weight: string; // lbs
}

interface MultiSetStrengthFormProps {
  profile: any;
}

// Convert lbs to kg for storage
const lbsToKg = (lbs: number) => lbs / 2.20462;

const MultiSetStrengthForm = ({ profile }: MultiSetStrengthFormProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [analyzingFeedback, setAnalyzingFeedback] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<any>(null);
  
  const [exercises, setExercises] = useState<Exercise[]>([
    { exercise: "", sets: "", reps: "", weight: "" }
  ]);
  
  const [workoutMeta, setWorkoutMeta] = useState({
    warmup_notes: "",
    cooldown_notes: "",
    rest_between_sets: "",
    notes: "",
  });

  const addExercise = () => {
    setExercises([...exercises, { exercise: "", sets: "", reps: "", weight: "" }]);
  };

  const removeExercise = (index: number) => {
    if (exercises.length > 1) {
      setExercises(exercises.filter((_, i) => i !== index));
    }
  };

  const updateExercise = (index: number, field: keyof Exercise, value: string) => {
    const updated = [...exercises];
    updated[index][field] = value;
    setExercises(updated);
  };

  const getSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-strength", {
        body: {
          weight: profile.weight,
          height: profile.height,
          experience: profile.experience_level,
          goals: profile.goals,
        },
      });

      if (error) throw error;
      setSuggestions(data.suggestions.suggestions || []);
    } catch (error) {
      console.error("Error getting suggestions:", error);
      toast({
        title: "Error",
        description: "Failed to get suggestions. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const applySuggestions = () => {
    if (suggestions.length === 0) return;
    
    const newExercises: Exercise[] = suggestions.map((sug) => ({
      exercise: sug.exercise,
      sets: sug.sets.toString(),
      reps: sug.reps.toString(),
      weight: Math.round(sug.recommendedWeight * 2.205).toString(), // kg to lbs
    }));
    
    setExercises(newExercises);
    setSuggestions([]);
  };

  const getAIFeedback = async (savedWorkouts: any[]) => {
    setAnalyzingFeedback(true);
    try {
      const { data: recentWorkouts } = await supabase
        .from("strength_workouts")
        .select("*")
        .eq("user_id", profile.id)
        .order("workout_date", { ascending: false })
        .limit(10);

      const { data, error } = await supabase.functions.invoke("analyze-workout", {
        body: {
          workoutType: "strength",
          workout: { exercises: savedWorkouts, meta: workoutMeta },
          profile: profile,
          recentWorkouts: recentWorkouts || [],
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      setFeedback(data.feedback);
    } catch (error) {
      console.error("Error getting feedback:", error);
    } finally {
      setAnalyzingFeedback(false);
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    
    const validExercises = exercises.filter(e => e.exercise && e.sets && e.reps && e.weight);
    if (validExercises.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one complete exercise.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setFeedback(null);
    
    try {
      const workoutsToInsert = validExercises.map(ex => ({
        user_id: profile.id,
        exercise: ex.exercise,
        sets: parseInt(ex.sets),
        reps: parseInt(ex.reps),
        weight: lbsToKg(parseFloat(ex.weight)),
        notes: workoutMeta.notes || null,
        warmup_notes: workoutMeta.warmup_notes || null,
        cooldown_notes: workoutMeta.cooldown_notes || null,
        rest_between_sets: workoutMeta.rest_between_sets || null,
      }));

      const { data, error } = await supabase
        .from("strength_workouts")
        .insert(workoutsToInsert as any)
        .select();

      if (error) throw error;

      toast({
        title: "Workout logged!",
        description: `${validExercises.length} exercise(s) saved. Analyzing...`,
      });

      // Get AI feedback
      await getAIFeedback(data);

      // Reset form
      setExercises([{ exercise: "", sets: "", reps: "", weight: "" }]);
      setWorkoutMeta({
        warmup_notes: "",
        cooldown_notes: "",
        rest_between_sets: "",
        notes: "",
      });
    } catch (error) {
      console.error("Error saving workout:", error);
      toast({
        title: "Error",
        description: "Failed to save workout. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const validExerciseCount = exercises.filter(e => e.exercise && e.sets && e.reps && e.weight).length;

  return (
    <div className="space-y-4">
      {feedback && (
        <WorkoutFeedback feedback={feedback} onDismiss={() => setFeedback(null)} />
      )}
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Dumbbell className="h-5 w-5" />
              Log Strength Workout
            </span>
            <Button
              onClick={getSuggestions}
              disabled={loadingSuggestions}
              variant="outline"
              size="sm"
            >
              {loadingSuggestions ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  AI Suggestions
                </>
              )}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {suggestions.length > 0 && (
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <Label>AI Suggested Workout</Label>
                <Button size="sm" onClick={applySuggestions}>
                  Apply All
                </Button>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                {suggestions.map((sug, idx) => (
                  <div key={idx}>
                    {sug.exercise}: {sug.sets}×{sug.reps} @ {Math.round(sug.recommendedWeight * 2.205)} lbs
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Exercise List */}
          <div className="space-y-3">
            {exercises.map((ex, index) => (
              <div key={index} className="p-3 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Exercise {index + 1}</Label>
                  {exercises.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeExercise(index)}
                      className="h-8 w-8 p-0 text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Input
                    placeholder="Exercise name (e.g., Deadlift)"
                    value={ex.exercise}
                    onChange={(e) => updateExercise(index, "exercise", e.target.value)}
                  />
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Sets</Label>
                    <Input
                      type="number"
                      placeholder="3"
                      value={ex.sets}
                      onChange={(e) => updateExercise(index, "sets", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Reps</Label>
                    <Input
                      type="number"
                      placeholder="8"
                      value={ex.reps}
                      onChange={(e) => updateExercise(index, "reps", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Weight (lbs)</Label>
                    <Input
                      type="number"
                      placeholder="225"
                      value={ex.weight}
                      onChange={(e) => updateExercise(index, "weight", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Button variant="outline" onClick={addExercise} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add Exercise
          </Button>

          {/* Warmup/Cooldown/Rest */}
          <div className="border-t pt-4 mt-4">
            <h4 className="text-sm font-medium mb-3">Warmup / Cooldown / Rest</h4>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="warmup_notes">Warmup</Label>
                <Input
                  id="warmup_notes"
                  placeholder="e.g., 5 min row"
                  value={workoutMeta.warmup_notes}
                  onChange={(e) => setWorkoutMeta({ ...workoutMeta, warmup_notes: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cooldown_notes">Cooldown</Label>
                <Input
                  id="cooldown_notes"
                  placeholder="e.g., stretching"
                  value={workoutMeta.cooldown_notes}
                  onChange={(e) => setWorkoutMeta({ ...workoutMeta, cooldown_notes: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rest_between_sets">Rest Between Sets</Label>
                <Input
                  id="rest_between_sets"
                  placeholder="e.g., 2:00"
                  value={workoutMeta.rest_between_sets}
                  onChange={(e) => setWorkoutMeta({ ...workoutMeta, rest_between_sets: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Session Notes</Label>
            <Textarea
              id="notes"
              placeholder="How did the workout feel? Any PRs?"
              value={workoutMeta.notes}
              onChange={(e) => setWorkoutMeta({ ...workoutMeta, notes: e.target.value })}
              className="min-h-16"
            />
          </div>

          <Button 
            onClick={handleSave} 
            disabled={loading || analyzingFeedback || validExerciseCount === 0} 
            className="w-full"
          >
            {loading || analyzingFeedback ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {analyzingFeedback ? "Analyzing..." : "Saving..."}
              </>
            ) : (
              `Log ${validExerciseCount} Exercise${validExerciseCount !== 1 ? "s" : ""} & Get Feedback`
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default MultiSetStrengthForm;
