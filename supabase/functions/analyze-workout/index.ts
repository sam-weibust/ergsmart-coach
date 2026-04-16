import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const { workoutType, workout, profile: bodyProfile, recentWorkouts = [], recoveryLogs = [] } = body;
    const user_id = body.user_id || bodyProfile?.id;

    if (!workout) {
      return new Response(JSON.stringify({ error: "Missing workout data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let profile = bodyProfile;
    let goals: any = null;
    if (!profile && user_id) {
      const [profileRes, goalsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user_id).maybeSingle(),
        supabase.from("user_goals").select("*").eq("user_id", user_id).maybeSingle(),
      ]);
      profile = profileRes.data;
      goals = goalsRes.data;
    }

    const userContext = `
ATHLETE PROFILE:
- Name: ${profile?.full_name || "Unknown"}
- Experience: ${profile?.experience_level || "Unknown"}
- Age: ${profile?.age || "Unknown"}, Weight: ${profile?.weight || "Unknown"}kg
- Goals: ${profile?.goals || "Not set"}
${goals ? `\nGOALS:\n- 2K: ${goals.current_2k_time || "Not set"} → Goal: ${goals.goal_2k_time || "Not set"}` : ""}
${recentWorkouts.length ? `\nRECENT WORKOUTS:\n${recentWorkouts.slice(0, 5).map((w: any) => `- ${w.workout_date}: ${w.distance || ""}m ${w.duration || ""}`).join("\n")}` : ""}
`.trim();

    const systemPrompt = `
You are CrewSync AI, an expert rowing and strength training analyst.

Analyze the athlete's workout and respond with ONLY a valid JSON object — no markdown, no extra text, no code fences.

Required format:
{
  "overallRating": "excellent" | "good" | "average" | "needs_improvement",
  "summary": "2-3 sentence overview of the workout performance",
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["area to improve 1", "area to improve 2"],
  "recommendation": "one specific tip for the next workout",
  "motivationalMessage": "short encouraging closing message",
  "progressNote": "optional note about trend vs recent workouts, omit key if no data"
}

User context:
${userContext}
`.trim();

    const anthropicResponse = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          stream: false,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: `Workout type: ${workoutType || "general"}\n\nAnalyze this workout:\n${JSON.stringify(workout, null, 2)}`,
            },
          ],
        }),
      }
    );

    if (!anthropicResponse.ok) {
      const t = await anthropicResponse.text();
      console.error("Anthropic error:", anthropicResponse.status, t);
      return new Response(JSON.stringify({ error: "AI service unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await anthropicResponse.json();
    const text = result?.content?.[0]?.text ?? "{}";

    let feedback: any;
    try {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start === -1 || end === -1) throw new Error("No JSON found");
      feedback = JSON.parse(text.slice(start, end + 1));
    } catch {
      // Fallback structure if Claude didn't return valid JSON
      feedback = {
        overallRating: "good",
        summary: text.slice(0, 300) || "Workout logged successfully.",
        strengths: ["Completed the workout"],
        improvements: ["Continue tracking your metrics"],
        recommendation: "Keep up the consistent training.",
        motivationalMessage: "Great work — every session counts!",
      };
    }

    return new Response(JSON.stringify({ feedback }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-workout error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
