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
      throw new Error("Missing ANTHROPIC_API_KEY");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // ---------------------------
    // SAFE JSON PARSING
    // ---------------------------
    const raw = await req.text();
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user_id = body.user_id;
    const workout_type = body.workout_type ?? "general";
    const preferences = body.preferences ?? {};

    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------------------------
    // FETCH USER CONTEXT
    // ---------------------------
    const [profileRes, goalsRes, ergRes, strengthRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user_id).maybeSingle(),
      supabase.from("user_goals").select("*").eq("user_id", user_id).maybeSingle(),
      supabase
        .from("erg_workouts")
        .select("*")
        .eq("user_id", user_id)
        .order("workout_date", { ascending: false })
        .limit(5),
      supabase
        .from("strength_workouts")
        .select("*")
        .eq("user_id", user_id)
        .order("workout_date", { ascending: false })
        .limit(5),
    ]);

    const profile = profileRes.data;
    const goals = goalsRes.data;
    const recentErg = ergRes.data || [];
    const recentStrength = strengthRes.data || [];

    // ---------------------------
    // BUILD USER CONTEXT
    // ---------------------------
    const userContext = `
USER PROFILE:
- Name: ${profile?.full_name || "Unknown"}
- Type: ${profile?.user_type || "rower"}
- Experience: ${profile?.experience_level || "Unknown"}
- Age: ${profile?.age || "Unknown"}, Weight: ${profile?.weight || "Unknown"}kg, Height: ${profile?.height || "Unknown"}cm

USER GOALS:
- Current 2K: ${goals?.current_2k_time || "Not set"} → Goal: ${goals?.goal_2k_time || "Not set"}
- Current 5K: ${goals?.current_5k_time || "Not set"} → Goal: ${goals?.goal_5k_time || "Not set"}
- Current 6K: ${goals?.current_6k_time || "Not set"} → Goal: ${goals?.goal_6k_time || "Not set"}

RECENT ERG WORKOUTS:
${
  recentErg.length
    ? recentErg
        .map(
          (w) =>
            `- ${w.workout_date}: ${w.workout_type}, ${w.distance}m, duration: ${w.duration}, avg split: ${w.avg_split}`
        )
        .join("\n")
    : "No recent erg workouts"
}

RECENT STRENGTH WORKOUTS:
${
  recentStrength.length
    ? recentStrength
        .map(
          (w) =>
            `- ${w.workout_date}: ${w.exercise}, ${w.sets}x${w.reps} @ ${w.weight}kg`
        )
        .join("\n")
    : "No recent strength workouts"
}
`.trim();

    // ---------------------------
    // COMPUTE PLAN DIMENSIONS
    // ---------------------------
    const totalWeeks = Math.max(1, (preferences.months ?? 3) * 4);
    const durationLabel = `${preferences.months ?? 3} months (${totalWeeks} weeks)`;

    // ---------------------------
    // SYSTEM PROMPT
    // ---------------------------
    const systemPrompt = `You are CrewSync AI, an expert rowing and strength training coach.

USER CONTEXT:
${userContext}

You are generating a complete multi-week training plan.
You MUST output the FULL plan, not a sample.
You MUST output EVERY week explicitly from Week 1 through Week ${totalWeeks}.
You MUST NOT summarize.
You MUST NOT skip weeks.
You MUST NOT say "repeat this pattern."
You MUST NOT compress multiple weeks into one description.
You MUST NOT output commentary before or after the JSON.

Your ONLY output should be a single valid JSON object with this exact structure:

{
  "duration": "${durationLabel}",
  "total_weeks": ${totalWeeks},
  "plan": [
    {
      "week": 1,
      "phase": "Base",
      "days": [
        {
          "day": "Monday",
          "workout": "..."
        }
      ]
    }
  ]
}

Rules you MUST follow:
- The JSON must be valid and parseable.
- No trailing commas.
- No markdown formatting.
- No text outside the JSON.
- The "plan" array MUST contain exactly ${totalWeeks} week objects.
- Each week MUST contain 7 days (Monday through Sunday).
- Each day MUST have a "day" (day name string) and "workout" (detailed description string) field.
- Each week MUST have a "phase" field: one of "Base", "Build", "Peak", or "Taper".
- The workouts MUST be specific, actionable, and unique for each day.
- Include erg zone (UT2/UT1/TR/AT), distance or duration, target split, and strength/recovery notes inline in the "workout" string.

Now generate the FULL plan for all ${totalWeeks} weeks.`.trim();

    // ---------------------------
    // CALL CLAUDE 3 HAIKU (guaranteed available)
    // ---------------------------
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
          model: "claude-sonnet-4-6",
          max_tokens: 16000,
          stream: false,

          system: systemPrompt,

          messages: [
            {
              role: "user",
              content: `Generate the complete ${durationLabel} training plan for this athlete. Output only the JSON object.`,
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
    const text = result?.content?.[0]?.text;

    if (!text) {
      return new Response(JSON.stringify({ error: "Invalid AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract the outermost JSON object, tolerating any preamble/fences from the model
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      console.error("No JSON object found in response:", text);
      return new Response(JSON.stringify({ error: "AI returned invalid JSON" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const cleaned = text.slice(start, end + 1);

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("JSON parse error:", cleaned);
      return new Response(JSON.stringify({ error: "AI returned invalid JSON" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-workout error:", e);
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
