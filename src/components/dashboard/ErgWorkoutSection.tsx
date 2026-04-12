"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useSupabaseClient } from "@supabase/auth-helpers-react";

interface ErgWorkout {
  distance: string;
  duration: string;
  split: string;
  stroke_rate: string;
  drag_factor: string;
  notes: string;
  warmup_duration: string;
  cooldown_duration: string;
  rest_periods: string;
}

const ErgWorkoutSection = () => {
  const supabase = useSupabaseClient();

  const [workout, setWorkout] = useState<ErgWorkout>({
    distance: "",
    duration: "",
    split: "",
    stroke_rate: "",
    drag_factor: "",
    notes: "",
    warmup_duration: "",
    cooldown_duration: "",
    rest_periods: "",
  });

  const [loading, setLoading] = useState(false);
  const [analyzingFeedback, setAnalyzingFeedback] = useState(false);

  const handleSave = async () => {
    try {
      setLoading(true);

      const { data: userData } = await supabase.auth.getUser();
      const user_id = userData?.user?.id;

      if (!user_id) {
        alert("User not logged in.");
        return;
      }

      const { error } = await supabase.from("erg_workouts").insert({
        user_id,
        ...workout,
      });

      if (error) {
        console.error(error);
        alert("Error saving workout.");
        return;
      }

      setAnalyzingFeedback(true);

      const feedbackRes = await fetch("/api/analyze-workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id, workout }),
      });

      const feedbackData = await feedbackRes.json();
      console.log("AI Feedback:", feedbackData);

      alert("Workout logged and feedback generated!");
    } catch (err) {
      console.error(err);
      alert("Unexpected error.");
    } finally {
      setLoading(false);
      setAnalyzingFeedback(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Log Erg Workout</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Distance */}
          <div className="space-y-2">
            <Label htmlFor="distance">Distance (meters)</Label>
            <Input
              id="distance"
              placeholder="e.g., 2000"
              value={workout.distance}
              onChange={(e) => setWorkout({ ...workout, distance: e.target.value })}
            />
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label htmlFor="duration">Duration (mm:ss)</Label>
            <Input
              id="duration"
              placeholder="e.g., 07:30"
              value={workout.duration}
              onChange={(e) => setWorkout({ ...workout, duration: e.target.value })}
            />
          </div>

          {/* Split */}
          <div className="space-y-2">
            <Label htmlFor="split">Split (per 500m)</Label>
            <Input
              id="split"
              placeholder="e.g., 01:52"
              value={workout.split}
              onChange={(e) => setWorkout({ ...workout, split: e.target.value })}
            />
          </div>

          {/* Stroke Rate */}
          <div className="space-y-2">
            <Label htmlFor="stroke_rate">Stroke Rate (spm)</Label>
            <Input
              id="stroke_rate"
              placeholder="e.g., 30"
              value={workout.stroke_rate}
              onChange={(e) => setWorkout({ ...workout, stroke_rate: e.target.value })}
            />
          </div>

          {/* Drag Factor */}
          <div className="space-y-2">
            <Label htmlFor="drag_factor">Drag Factor</Label>
            <Input
              id="drag_factor"
              placeholder="e.g., 120"
              value={workout.drag_factor}
              onChange={(e) => setWorkout({ ...workout, drag_factor: e.target.value })}
            />
          </div>

          {/* Warmup */}
          <div className="space-y-2">
            <Label htmlFor="warmup_duration">Warmup Duration</Label>
            <Input
              id="warmup_duration"
              placeholder="e.g., 10:00"
              value={workout.warmup_duration}
              onChange={(e) => setWorkout({ ...workout, warmup_duration: e.target.value })}
            />
          </div>

          {/* Cooldown */}
          <div className="space-y-2">
            <Label htmlFor="cooldown_duration">Cooldown Duration</Label>
            <Input
              id="cooldown_duration"
              placeholder="e.g., 10:00"
              value={workout.cooldown_duration}
              onChange={(e) => setWorkout({ ...workout, cooldown_duration: e.target.value })}
            />
          </div>

          {/* Rest Periods */}
          <div className="space-y-2">
            <Label htmlFor="rest_periods">Rest Periods</Label>
            <Input
              id="rest_periods"
              placeholder="e.g., 2:00 between sets"
              value={workout.rest_periods}
              onChange={(e) => setWorkout({ ...workout, rest_periods: e.target.value })}
            />
          </div>
          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="How did the workout feel?"
              value={workout.notes}
              onChange={(e) => setWorkout({ ...workout, notes: e.target.value })}
              className="min-h-20"
            />
          </div>

          <Button
            onClick={handleSave}
            disabled={loading || analyzingFeedback}
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

export default ErgWorkoutSection;
