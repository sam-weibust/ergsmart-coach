import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Sparkles } from "lucide-react";

interface StrengthWorkoutSectionProps {
  profile: any;
  fullView?: boolean;
}

// Convert lbs to kg for storage (database stores in kg)
const lbsToKg = (lbs: number) => lbs / 2.20462;

const StrengthWorkoutSection = ({ profile, fullView }: StrengthWorkoutSectionProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [workout, setWorkout] = useState({
    exercise: "",
    sets: "",
    reps: "",
    weight: "", // stored as lbs in UI
    notes: "",
  });

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

  const selectSuggestion = (suggestion: any) => {
    // Convert kg recommendation to lbs for display
    const weightLbs = Math.round(suggestion.recommendedWeight * 2.205);
    setWorkout({
      exercise: suggestion.exercise,
      sets: suggestion.sets.toString(),
      reps: suggestion.reps.toString(),
      weight: weightLbs.toString(),
      notes: suggestion.notes,
    });
    setSuggestions([]);
  };

  const handleSave = async () => {
    if (!profile || !workout.exercise) return;

    setLoading(true);
    try {
      // Convert lbs to kg for storage
      const weightKg = lbsToKg(parseFloat(workout.weight));
      
      const { error } = await supabase.from("strength_workouts").insert({
        user_id: profile.id,
        exercise: workout.exercise,
        sets: parseInt(workout.sets),
        reps: parseInt(workout.reps),
        weight: weightKg,
        notes: workout.notes || null,
      });

      if (error) throw error;

      toast({
        title: "Workout logged!",
        description: "Your strength workout has been saved.",
      });

      setWorkout({
        exercise: "",
        sets: "",
        reps: "",
        weight: "",
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

  return (
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
                      {sug.sets} sets × {sug.reps} reps @ {Math.round(sug.recommendedWeight * 2.205)} lbs
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

        <Button onClick={handleSave} disabled={loading || !workout.exercise} className="w-full">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Log Workout"
          )}
        </Button>
      </CardContent>
    </Card>
  );
};

export default StrengthWorkoutSection;