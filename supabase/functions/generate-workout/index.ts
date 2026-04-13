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

    // Safe JSON parsing
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

    // Fetch user data
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

    // Build user context
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

    // ⭐ SYSTEM PROMPT — forces strict JSON output
    const systemPrompt = `
You are CrewSync AI, an expert rowing and strength training coach.

You MUST output STRICT JSON ONLY.
No commentary. No markdown. No explanations.

JSON FORMAT:
{
  "plan": [
    {
      "week": 1,
      "phase": "Base" | "Build" | "Peak" | "Taper",
      "days": [
        {
          "day": 1,
          "ergWorkout": {
            "zone": "UT2" | "UT1" | "TR" | "AT",
            "description": "string",
            "duration": "string",
            "distance": "number | null",
            "targetSplit": "string | null",
            "rate": "string | null",
            "warmup": "string | null",
            "restPeriods": "string | null",
            "cooldown": "string | null",
            "notes": "string | null"
          },
          "strengthWorkout": {
            "focus": "string",
            "warmupNotes": "string | null",
            "exercises": [
              {
                "exercise": "string",
                "sets": number,
                "reps": number,
                "weight": "string | null",
                "restBetweenSets": "string | null"
              }
            ],
            "cooldownNotes": "string | null",
            "notes": "string | null"
          },
          "yogaSession": {
            "duration": "string | null",
            "focus": "string | null",
            "poses": "string | null"
          },
          "mealPlan": {
            "totalCalories": number | null,
            "breakfast": "string | null",
            "lunch": "string | null",
            "dinner": "string | null",
            "snacks": "string | null",
            "macros": "string | null"
          }
        }
      ]
    }
  ]
}

User context:
${userContext}
`.trim();
console.log("ANTHROPIC KEY LENGTH:", ANTHROPIC_API_KEY?.length);

   // ⭐ CALL CLAUDE (non-streaming)
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
      model: model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      stream: false,

      // ⭐ Claude 3.5 requires system prompt HERE
      system: systemPrompt,

      // ⭐ Only user messages go in messages[]
      messages: [
        {
          role: "user",
          content: `Workout type: ${workout_type}\nPreferences: ${JSON.stringify(
            preferences,
            null,
            2
          )}`,
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

    // ⭐ Extract Claude's text
    const text = result?.content?.[0]?.text;
    if (!text) {
      return new Response(JSON.stringify({ error: "Invalid AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ⭐ Parse JSON from Claude
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      console.error("JSON parse error:", text);
      return new Response(JSON.stringify({ error: "AI returned invalid JSON" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ⭐ Return JSON to frontend
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
