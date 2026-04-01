import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Timer, Ruler, Camera, ImageIcon, Bluetooth } from "lucide-react";
import { WorkoutFeedback } from "./WorkoutFeedback";
import { toast as sonnerToast } from "sonner";
import { usePM5Bluetooth } from "@/hooks/usePM5Bluetooth";

interface ErgWorkoutSectionProps {
  profile: any;
  fullView?: boolean;
}

const ErgWorkoutSection = ({ profile, fullView }: ErgWorkoutSectionProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [analyzingFeedback, setAnalyzingFeedback] = useState(false);
  const [parsingPhoto, setParsingPhoto] = useState(false);
  const [feedback, setFeedback] = useState<any>(null);
  const [intervalMode, setIntervalMode] = useState<"time" | "distance">("time");
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { connected, connecting, pm5Data, connect, disconnect, isSupported } = usePM5Bluetooth();

  // Auto-populate from PM5 data
  useEffect(() => {
    if (pm5Data.distance) setWorkout(p => ({ ...p, distance: String(pm5Data.distance) }));
    if (pm5Data.splitTime) setWorkout(p => ({ ...p, avg_split: pm5Data.splitTime! }));
    if (pm5Data.elapsedTime) setWorkout(p => ({ ...p, duration: pm5Data.elapsedTime! }));
  }, [pm5Data.distance, pm5Data.splitTime, pm5Data.elapsedTime]);
  const [workout, setWorkout] = useState({
    workout_type: "steady_state",
    distance: "",
    duration: "",
    avg_split: "",
    avg_heart_rate: "",
    calories: "",
    notes: "",
    warmup_duration: "",
    cooldown_duration: "",
    rest_periods: "",
    // Interval-specific fields
    interval_count: "",
    interval_duration: "",
    interval_distance: "",
    interval_rest: "",
  });

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsingPhoto(true);
    sonnerToast.info("Reading your erg screen...");

    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data: { session } } = await supabase.auth.getSession();

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-erg-screen`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ imageBase64: base64 }),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `Error ${resp.status}`);
      }

      const data = await resp.json();
      const w = data.workout;

      setWorkout(prev => ({
        ...prev,
        workout_type: w.workout_type || prev.workout_type,
        distance: w.distance ? String(w.distance) : prev.distance,
        duration: w.duration || prev.duration,
        avg_split: w.avg_split || prev.avg_split,
        avg_heart_rate: w.avg_heart_rate ? String(w.avg_heart_rate) : prev.avg_heart_rate,
        calories: w.calories ? String(w.calories) : prev.calories,
        notes: w.notes || prev.notes,
      }));

      sonnerToast.success("Erg data imported! Review and save.");
    } catch (err: any) {
      console.error("Photo parse error:", err);
      sonnerToast.error(err.message || "Failed to read erg screen");
    } finally {
      setParsingPhoto(false);
      // Reset inputs so same file can be re-selected
      if (photoInputRef.current) photoInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  const getAIFeedback = async (savedWorkout: any) => {
    setAnalyzingFeedback(true);
    try {
      // Fetch recent workouts for context
      const { data: recentWorkouts } = await supabase
        .from("erg_workouts")
        .select("*")
        .eq("user_id", profile.id)
        .order("workout_date", { ascending: false })
        .limit(5);

      const { data, error } = await supabase.functions.invoke("analyze-workout", {
        body: {
          workoutType: "erg",
          workout: savedWorkout,
          profile: profile,
          recentWorkouts: recentWorkouts || [],
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      setFeedback(data.feedback);
    } catch (error) {
      console.error("Error getting feedback:", error);
      // Don't show error toast - feedback is optional
    } finally {
      setAnalyzingFeedback(false);
    }
  };

  const handleSave = async () => {
    if (!profile) return;

    setLoading(true);
    setFeedback(null);
    
    try {
      const workoutData = {
        user_id: profile.id,
        workout_type: workout.workout_type,
        distance: workout.distance ? parseInt(workout.distance) : null,
        duration: workout.duration || null,
        avg_split: workout.avg_split || null,
        avg_heart_rate: workout.avg_heart_rate ? parseInt(workout.avg_heart_rate) : null,
        calories: workout.calories ? parseInt(workout.calories) : null,
        notes: workout.notes || null,
        warmup_duration: workout.warmup_duration || null,
        cooldown_duration: workout.cooldown_duration || null,
        rest_periods: workout.rest_periods || null,
      };

      const { data, error } = await supabase
        .from("erg_workouts")
        .insert(workoutData as any)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Workout logged!",
        description: "Analyzing your performance...",
      });

      // Get AI feedback
      await getAIFeedback({
        ...workoutData,
        id: data.id,
      });

      setWorkout({
        workout_type: "steady_state",
        distance: "",
        duration: "",
        avg_split: "",
        avg_heart_rate: "",
        calories: "",
        notes: "",
        warmup_duration: "",
        cooldown_duration: "",
        rest_periods: "",
        interval_count: "",
        interval_duration: "",
        interval_distance: "",
        interval_rest: "",
      });
      setIntervalMode("time");
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
    <div className="space-y-4">
      {feedback && (
        <WorkoutFeedback feedback={feedback} onDismiss={() => setFeedback(null)} />
      )}
      
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Log Erg Workout
            </CardTitle>
            <div className="flex gap-2">
              {/* PM5 Bluetooth Connect */}
              {isSupported && (
                connected ? (
                  <Button variant="outline" size="sm" onClick={disconnect} className="gap-1.5">
                    <Bluetooth className="h-4 w-4 text-green-500" />
                    <Badge variant="outline" className="text-green-600 border-green-500/30 text-xs px-1.5">Connected</Badge>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={connect} disabled={connecting} className="gap-1.5">
                    {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bluetooth className="h-4 w-4" />}
                    <span className="hidden sm:inline">Connect Erg</span>
                  </Button>
                )
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => cameraInputRef.current?.click()}
                disabled={parsingPhoto}
                className="gap-1.5"
              >
                {parsingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                <span className="hidden sm:inline">Snap Erg</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => photoInputRef.current?.click()}
                disabled={parsingPhoto}
                className="gap-1.5"
              >
                {parsingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                <span className="hidden sm:inline">Upload Photo</span>
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Take a photo of your erg screen or type your workout manually.
          </p>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhotoCapture}
          />
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoCapture}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="workout_type">Workout Type</Label>
            <Select
              value={workout.workout_type}
              onValueChange={(value) => setWorkout({ ...workout, workout_type: value })}
            >
              <SelectTrigger id="workout_type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="steady_state">Steady State</SelectItem>
                <SelectItem value="intervals">Intervals</SelectItem>
                <SelectItem value="sprint">Sprint</SelectItem>
                <SelectItem value="test">Test (2K/5K/6K)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Interval Configuration */}
          {workout.workout_type === "intervals" && (
            <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Interval Type</Label>
                <RadioGroup
                  value={intervalMode}
                  onValueChange={(v: "time" | "distance") => setIntervalMode(v)}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="time" id="time" />
                    <Label htmlFor="time" className="flex items-center gap-1 cursor-pointer">
                      <Timer className="h-3 w-3" /> Time
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="distance" id="distance" />
                    <Label htmlFor="distance" className="flex items-center gap-1 cursor-pointer">
                      <Ruler className="h-3 w-3" /> Distance
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs"># of Intervals</Label>
                  <Input
                    type="number"
                    placeholder="8"
                    value={workout.interval_count}
                    onChange={(e) => setWorkout({ ...workout, interval_count: e.target.value })}
                  />
                </div>
                
                {intervalMode === "time" ? (
                  <div className="space-y-1">
                    <Label className="text-xs">Interval Duration</Label>
                    <Input
                      placeholder="3:00"
                      value={workout.interval_duration}
                      onChange={(e) => setWorkout({ ...workout, interval_duration: e.target.value })}
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label className="text-xs">Interval Distance (m)</Label>
                    <Input
                      type="number"
                      placeholder="500"
                      value={workout.interval_distance}
                      onChange={(e) => setWorkout({ ...workout, interval_distance: e.target.value })}
                    />
                  </div>
                )}
                
                <div className="space-y-1">
                  <Label className="text-xs">Rest Between</Label>
                  <Input
                    placeholder="1:00"
                    value={workout.interval_rest}
                    onChange={(e) => setWorkout({ ...workout, interval_rest: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="distance">Total Distance (m)</Label>
              <Input
                id="distance"
                type="number"
                placeholder="5000"
                value={workout.distance}
                onChange={(e) => setWorkout({ ...workout, distance: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Total Duration (MM:SS)</Label>
              <Input
                id="duration"
                placeholder="20:00"
                value={workout.duration}
                onChange={(e) => setWorkout({ ...workout, duration: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="avg_split">Avg Split (/500m)</Label>
              <Input
                id="avg_split"
                placeholder="2:00.0"
                value={workout.avg_split}
                onChange={(e) => setWorkout({ ...workout, avg_split: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="avg_heart_rate">Avg HR (bpm)</Label>
              <Input
                id="avg_heart_rate"
                type="number"
                placeholder="150"
                value={workout.avg_heart_rate}
                onChange={(e) => setWorkout({ ...workout, avg_heart_rate: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="calories">Calories</Label>
              <Input
                id="calories"
                type="number"
                placeholder="500"
                value={workout.calories}
                onChange={(e) => setWorkout({ ...workout, calories: e.target.value })}
              />
            </div>
          </div>

          <div className="border-t pt-4 mt-4">
            <h4 className="text-sm font-medium mb-3">Warmup / Cooldown / Rest</h4>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="warmup_duration">Warmup (MM:SS)</Label>
                <Input
                  id="warmup_duration"
                  placeholder="10:00"
                  value={workout.warmup_duration}
                  onChange={(e) => setWorkout({ ...workout, warmup_duration: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cooldown_duration">Cooldown (MM:SS)</Label>
                <Input
                  id="cooldown_duration"
                  placeholder="5:00"
                  value={workout.cooldown_duration}
                  onChange={(e) => setWorkout({ ...workout, cooldown_duration: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rest_periods">Rest Periods</Label>
                <Input
                  id="rest_periods"
                  placeholder="e.g., 2:00 between sets"
                  value={workout.rest_periods}
                  onChange={(e) => setWorkout({ ...workout, rest_periods: e.target.value })}
                />
              </div>
            </div>
          </div>

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

          <Button onClick={handleSave} disabled={loading || analyzingFeedback} className="w-full">
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
