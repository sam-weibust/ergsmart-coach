import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { workoutType, workout, profile, recentWorkouts, recoveryLogs } = await req.json();

    console.log(`Analyzing ${workoutType} workout for user`);

    // ⭐ USE YOUR ANTHROPIC KEY
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    let systemPrompt = "";
    let userPrompt = "";

    // -------------------------------
    // ERG WORKOUT ANALYSIS
    // -------------------------------
    if (workoutType === "erg") {
      systemPrompt = `You are an expert rowing coach and performance analyst. Analyze the user's erg workout and provide personalized feedback. Be encouraging but also provide actionable insights. Consider their fitness level, goals, and recent performance trends.

Return your response as JSON with this structure:
{
  "overallRating": "excellent" | "good" | "average" | "needs_improvement",
  "summary": "1-2 sentence summary of performance",
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["area to improve 1", "area to improve 2"],
  "recommendation": "Specific actionable tip for next workout",
  "motivationalMessage": "Short encouraging message"
}`;

      userPrompt = `Analyze this erg workout:
- Type: ${workout.workout_type}
- Distance: ${workout.distance || "N/A"}m
- Duration: ${workout.duration || "N/A"}
- Avg Split: ${workout.avg_split || "N/A"}
- Avg Heart Rate: ${workout.avg_heart_rate || "N/A"} bpm
- Calories: ${workout.calories || "N/A"}
- Notes: ${workout.notes || "None"}

User Profile:
- Experience: ${profile?.experience_level || "intermediate"}
- Goals: ${profile?.goals || "general fitness"}
- Current 2K time: ${profile?.current_2k_time || "Unknown"}

Recent workout history (last 5):
${recentWorkouts?.length > 0
        ? recentWorkouts
            .map(
              (w: any) =>
                `- ${w.workout_type}: ${w.distance || "N/A"}m in ${w.duration || "N/A"} @ ${w.avg_split || "N/A"}`
            )
            .join("\n")
        : "No recent workouts"}

Recent injury/recovery logs (last 7 days):
${recoveryLogs?.length > 0
        ? recoveryLogs
            .map(
              (r: any) =>
                `- ${r.log_date}: ${r.body_region}, severity ${r.severity}/5${
                  r.notes ? ` (${r.notes})` : ""
                }`
            )
            .join("\n")
        : "No recent recovery issues"}
${recoveryLogs?.some((r: any) => r.severity >= 4)
        ? "\n⚠️ IMPORTANT: User has recent severe injury/pain. Recommend rest or modification."
        : ""}`;
    }

    // -------------------------------
    // STRENGTH WORKOUT ANALYSIS
    // -------------------------------
    else if (workoutType === "strength") {
      systemPrompt = `You are an expert strength and conditioning coach. Analyze the user's strength workout and provide personalized feedback. Focus on form, progression, and rowing-specific benefits. Be encouraging but also provide actionable insights.

Return your response as JSON with this structure:
{
  "overallRating": "excellent" | "good" | "average" | "needs_improvement",
  "summary": "1-2 sentence summary of performance",
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["area to improve 1", "area to improve 2"],
  "recommendation": "Specific actionable tip for next workout",
  "motivationalMessage": "Short encouraging message",
  "progressNote": "Note about weight/volume progression if applicable"
}`;

      const weightLbs = Math.round(workout.weight * 2.20462);

      userPrompt = `Analyze this strength workout:
- Exercise: ${workout.exercise}
- Sets: ${workout.sets}
- Reps: ${workout.reps}
- Weight: ${weightLbs} lbs
- Rest Between Sets: ${workout.rest_between_sets || "N/A"}
- Notes: ${workout.notes || "None"}
- Warmup: ${workout.warmup_notes || "None specified"}
- Cooldown: ${workout.cooldown_notes || "None specified"}

User Profile:
- Experience: ${profile?.experience_level || "intermediate"}
- Goals: ${profile?.goals || "general fitness"}
- Body Weight: ${
        profile?.weight ? Math.round(profile.weight * 2.20462) : "Unknown"
      } lbs

Recent workouts for this exercise:
${
        recentWorkouts?.length > 0
          ? recentWorkouts
              .map(
                (w: any) =>
                  `- ${w.exercise}: ${w.sets}x${w.reps} @ ${Math.round(
                    w.weight * 2.20462
                  )} lbs`
              )
              .join("\n")
          : "No recent workouts for this exercise"
      }`;
    }

    else {
      throw new Error("Invalid workout type");
    }

    // ⭐ CALL ANTHROPIC INSTEAD OF LOVABLE
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-latest",
        max_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic error:", response.status, errorText);
      throw new Error(`Anthropic error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content[0].text;

    const feedback = JSON.parse(content);

    return new Response(JSON.stringify({ feedback }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error analyzing workout:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
