"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { WorkoutFeedback } from "./WorkoutFeedback";
import { toast } from "sonner";

// PR distance labels
const PR_DISTANCES: Record<number, string> = {
  2000: "2k",
  5000: "5k",
  6000: "6k",
  10000: "10k",
};

const WORKOUT_TYPES = [
  { value: "steady_state", label: "Steady State" },
  { value: "ut2_steady_state", label: "UT2 — Base Endurance" },
  { value: "ut1_steady_state", label: "UT1 — Aerobic Development" },
  { value: "tr_intervals", label: "TR — Threshold Intervals" },
  { value: "at_intervals", label: "AT — High Intensity Intervals" },
  { value: "multi_piece", label: "Multi-Piece / Pieces" },
  { value: "timed_piece", label: "Timed Piece" },
  { value: "warmup", label: "Warm-Up Only" },
  { value: "cooldown", label: "Cool-Down Only" },
  { value: "test", label: "Test / Time Trial" },
];

// Parse split string "M:SS.t" → seconds per 500m
function parseSplitText(s: string | null): number | null {
  if (!s) return null;
  const parts = s.split(":");
  if (parts.length === 2) return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// Parse duration "H:MM:SS" or "MM:SS" → seconds
function parseDuration(d: string | null): number | null {
  if (!d) return null;
  const parts = d.split(":");
  if (parts.length === 3) return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  return parseFloat(d);
}

async function checkAndUpdatePR(userId: string, distanceM: number | null, splitStr: string | null, durationStr: string | null, strokeRate: string | null) {
  try {
    const splitSec = parseSplitText(splitStr);
    const durationSec = parseDuration(durationStr);

    let distanceLabel: string | null = null;
    let timeSec: number | null = null;
    let watts: number | null = null;

    if (distanceM && PR_DISTANCES[distanceM] && splitSec && splitSec > 0) {
      distanceLabel = PR_DISTANCES[distanceM];
      timeSec = (splitSec / 500) * distanceM;
      watts = Math.round(2.80 / Math.pow(splitSec / 500, 3));
    } else if (durationSec && Math.abs(durationSec - 3600) < 10 && splitSec) {
      distanceLabel = "60min";
      timeSec = durationSec;
      watts = Math.round(2.80 / Math.pow(splitSec / 500, 3));
    } else if (durationSec && Math.abs(durationSec - 1800) < 10 && splitSec) {
      distanceLabel = "30min";
      timeSec = durationSec;
    }

    if (!distanceLabel || !timeSec) return;

    const { data: existing } = await supabase
      .from("personal_records" as any)
      .select("id, time_seconds")
      .eq("user_id", userId)
      .eq("distance_label", distanceLabel)
      .order("time_seconds", { ascending: true })
      .limit(1);

    const prevBest = existing && existing.length > 0 ? (existing[0] as any).time_seconds : null;

    const isTimePiece = distanceLabel === "60min" || distanceLabel === "30min";
    const isBetter = isTimePiece
      ? !prevBest || timeSec >= prevBest
      : !prevBest || timeSec < prevBest;

    if (!isBetter) return;

    const improvementSeconds = prevBest ? Math.abs(prevBest - timeSec) : null;

    await supabase.from("personal_records" as any).insert({
      user_id: userId,
      distance_label: distanceLabel,
      time_seconds: timeSec,
      split_seconds: splitSec,
      watts,
      stroke_rate: strokeRate ? parseInt(strokeRate) : null,
      set_at: new Date().toISOString().split("T")[0],
      previous_time_seconds: prevBest,
      improvement_seconds: improvementSeconds,
    });

    if (prevBest) {
      toast.success(`🏆 New ${distanceLabel} PR! ${improvementSeconds ? Math.round(improvementSeconds) + "s faster" : ""}`);
    } else {
      toast.success(`🏆 First ${distanceLabel} recorded!`);
    }
    // Non-blocking email notification
    supabase.functions.invoke("send-notification-email", {
      body: {
        type: "new_pr",
        recipientUserId: userId,
        distanceLabel,
      },
    }).catch(() => {});
  } catch {
    // PR tracking should not block workout save
  }
}

interface ErgWorkout {
  workout_type: string;
  workout_date: string;
  distance: string;
  duration: string;
  split: string;
  heart_rate: string;
  stroke_rate: string;
  drag_factor: string;
  notes: string;
  warmup_duration: string;
  cooldown_duration: string;
  rest_periods: string;
}

const ErgWorkoutSection = ({ profile }: { profile?: any }) => {
  const today = new Date().toISOString().split("T")[0];

  const [workout, setWorkout] = useState<ErgWorkout>({
    workout_type: "steady_state",
    workout_date: today,
    distance: "",
    duration: "",
    split: "",
    heart_rate: "",
    stroke_rate: "",
    drag_factor: "",
    notes: "",
    warmup_duration: "",
    cooldown_duration: "",
    rest_periods: "",
  });

  const [saving, setSaving] = useState(false);
  const [analyzingFeedback, setAnalyzingFeedback] = useState(false);
  const [feedback, setFeedback] = useState<any>(null);

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);

    try {
      const user_id = profile?.id ?? (await supabase.auth.getUser()).data.user?.id;

      if (!user_id) {
        toast.error("You must be logged in to log a workout.");
        return;
      }

      // Calculate watts from split
      const splitSec = parseSplitText(workout.split);
      const avgWatts = splitSec && splitSec > 0
        ? Math.round(2.80 / Math.pow(splitSec / 500, 3))
        : null;

      const { error } = await supabase.from("erg_workouts").insert({
        user_id,
        workout_type: workout.workout_type || "steady_state",
        workout_date: workout.workout_date || today,
        distance: workout.distance ? parseInt(workout.distance) : null,
        duration: workout.duration || null,
        avg_split: workout.split || null,
        avg_heart_rate: workout.heart_rate ? parseInt(workout.heart_rate) : null,
        stroke_rate: workout.stroke_rate ? parseInt(workout.stroke_rate) : null,
        drag_factor: workout.drag_factor ? parseInt(workout.drag_factor) : null,
        avg_watts: avgWatts,
        notes: workout.notes || null,
        warmup_duration: workout.warmup_duration || null,
        cooldown_duration: workout.cooldown_duration || null,
        rest_periods: workout.rest_periods || null,
      } as any);

      if (error) {
        console.error("Erg workout save error:", error);
        toast.error(`Failed to save workout: ${error.message}`);
        return;
      }

      toast.success("Workout saved! Analyzing performance...");

      // Check for PR (non-blocking)
      checkAndUpdatePR(
        user_id,
        workout.distance ? parseInt(workout.distance) : null,
        workout.split || null,
        workout.duration || null,
        workout.stroke_rate || null,
      );

      // Reset form
      setWorkout({
        workout_type: "steady_state",
        workout_date: today,
        distance: "",
        duration: "",
        split: "",
        heart_rate: "",
        stroke_rate: "",
        drag_factor: "",
        notes: "",
        warmup_duration: "",
        cooldown_duration: "",
        rest_periods: "",
      });

      // AI feedback (non-blocking UI, separate loading state)
      setSaving(false);
      setAnalyzingFeedback(true);

      const { data: fbData, error: fnError } = await supabase.functions.invoke("analyze-workout", {
        body: {
          workoutType: "erg",
          workout: { ...workout },
          user_id,
        },
      });

      if (!fnError && fbData?.feedback) {
        setFeedback(fbData.feedback);
      }
    } catch (err: any) {
      console.error("Unexpected error saving erg workout:", err);
      toast.error(`Unexpected error: ${err?.message || "Unknown error"}`);
    } finally {
      setSaving(false);
      setAnalyzingFeedback(false);
    }
  };

  const isWorking = saving || analyzingFeedback;

  return (
    <div className="space-y-6">
      {feedback && (
        <WorkoutFeedback feedback={feedback} onDismiss={() => setFeedback(null)} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Log Erg Workout</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="workout_type">Workout Type</Label>
              <Select
                value={workout.workout_type}
                onValueChange={(v) => setWorkout({ ...workout, workout_type: v })}
              >
                <SelectTrigger id="workout_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKOUT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="workout_date">Date</Label>
              <Input
                id="workout_date"
                type="date"
                value={workout.workout_date}
                onChange={(e) => setWorkout({ ...workout, workout_date: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="distance">Distance (meters)</Label>
              <Input
                id="distance"
                type="number"
                placeholder="e.g., 2000"
                value={workout.distance}
                onChange={(e) => setWorkout({ ...workout, distance: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Duration (mm:ss or h:mm:ss)</Label>
              <Input
                id="duration"
                placeholder="e.g., 7:30.0"
                value={workout.duration}
                onChange={(e) => setWorkout({ ...workout, duration: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="split">Avg Split (/500m)</Label>
              <Input
                id="split"
                placeholder="e.g., 1:52.5"
                value={workout.split}
                onChange={(e) => setWorkout({ ...workout, split: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="stroke_rate">Stroke Rate (spm)</Label>
              <Input
                id="stroke_rate"
                type="number"
                placeholder="e.g., 20"
                value={workout.stroke_rate}
                onChange={(e) => setWorkout({ ...workout, stroke_rate: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="heart_rate">Avg Heart Rate (bpm)</Label>
              <Input
                id="heart_rate"
                type="number"
                placeholder="e.g., 155"
                value={workout.heart_rate}
                onChange={(e) => setWorkout({ ...workout, heart_rate: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="drag_factor">Drag Factor</Label>
            <Input
              id="drag_factor"
              type="number"
              placeholder="e.g., 130"
              value={workout.drag_factor}
              onChange={(e) => setWorkout({ ...workout, drag_factor: e.target.value })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="warmup_duration">Warmup Duration</Label>
              <Input
                id="warmup_duration"
                placeholder="e.g., 10:00"
                value={workout.warmup_duration}
                onChange={(e) => setWorkout({ ...workout, warmup_duration: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cooldown_duration">Cooldown Duration</Label>
              <Input
                id="cooldown_duration"
                placeholder="e.g., 5:00"
                value={workout.cooldown_duration}
                onChange={(e) => setWorkout({ ...workout, cooldown_duration: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rest_periods">Rest Periods</Label>
              <Input
                id="rest_periods"
                placeholder="e.g., 2x2:00"
                value={workout.rest_periods}
                onChange={(e) => setWorkout({ ...workout, rest_periods: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="How did it feel? Any observations..."
              value={workout.notes}
              onChange={(e) => setWorkout({ ...workout, notes: e.target.value })}
            />
          </div>

          <Button
            onClick={handleSave}
            disabled={isWorking}
            className="w-full"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : analyzingFeedback ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
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
