"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";   // ⭐ FIXED
import { generateWorkout } from "@/lib/api";

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

      // Save workout
      const { error } = await supabase.from("erg_workouts").insert({
        user_id,
        ...workout,
      });

      if (error) {
        console.error(error);
        alert("Error saving workout.");
        return;
      }

      // AI feedback
      setAnalyzingFeedback(true);

      const res = await generateWorkout({
        user_id,
        workout_type: "erg-analysis",
        preferences: workout,
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value);
      }

      console.log("AI Feedback:", fullText);
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
          {/* all your inputs unchanged */}
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
