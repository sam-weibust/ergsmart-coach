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

    // Use service role key (fixes all RLS/401 issues)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Frontend must send: { user_id, profile, goals, gpa, gender }
    const { user_id, profile, goals, gpa, gender } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch recent erg results for context
    const { data: ergResults } = await supabase
      .from("erg_workouts")
      .select("*")
      .eq("user_id", user_id)
      .order("workout_date", { ascending: false })
      .limit(5);

    const ergSummary = ergResults?.length
      ? ergResults
          .map(
            (w) =>
              `- ${w.workout_date}: ${w.distance}m in ${w.duration} (avg split ${w.avg_split})`
          )
          .join("\n")
      : "No recent erg results";

    const userContext = `
ATHLETE PROFILE:
- Name: ${profile?.full_name || "Unknown"}
- Age: ${profile?.age || "Unknown"}
- Height: ${profile?.height || "Unknown"}cm, Weight: ${profile?.weight || "Unknown"}kg
- Experience: ${profile?.experience_level || "Unknown"}
- Gender: ${gender || "Unknown"}
- GPA: ${gpa || "Not provided"}

CURRENT TIMES:
- 2K: ${goals?.current_2k_time || "Not set"} (goal: ${goals?.goal_2k_time || "Not set"})
- 5K: ${goals?.current_5k_time || "Not set"} (goal: ${goals?.goal_5k_time || "Not set"})
- 6K: ${goals?.current_6k_time || "Not set"} (goal: ${goals?.goal_6k_time || "Not set"})

RECENT ERG RESULTS:
${ergSummary}
`.trim();

    const systemPrompt = `You are CrewSync AI, an expert rowing recruiting analyst.

Athlete data:
${userContext}

Output ONLY a valid JSON object — no markdown, no commentary:
{
  "predicted_tier": "D1 mid",
  "summary": "2-3 sentence honest assessment",
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "action_plan": ["30-day step 1", "30-day step 2", "30-day step 3"],
  "school_predictions": [
    {
      "school": "University Name",
      "division": "D1",
      "chance": "high"
    }
  ],
  "missing_data_notes": ["note if any data was missing"]
}

Rules:
- chance must be one of: "high", "medium", "low", "reach"
- Include 8-12 realistic schools across divisions
- Be honest about tier placement based on erg times
- No text outside the JSON`.trim();

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
          max_tokens: 4096,
          stream: false,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: "Analyze the athlete and provide a full recruiting evaluation.",
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

    const aiResult = await anthropicResponse.json();
    const rawText = aiResult?.content?.[0]?.text ?? "";
    const start = rawText.indexOf("{");
    const end = rawText.lastIndexOf("}");
    let parsed: any = { predicted_tier: "Unknown", school_predictions: [], missing_data_notes: [] };
    if (start !== -1 && end > start) {
      try { parsed = JSON.parse(rawText.slice(start, end + 1)); } catch { /* fallback */ }
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("predict-recruitment error:", e);
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
