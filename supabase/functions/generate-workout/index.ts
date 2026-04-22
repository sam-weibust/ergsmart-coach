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
          "day": 1,
          "type": "UT2",
          "warmup": "10 min easy rowing",
          "workout": "60 min steady state",
          "rest": "",
          "breakup": "continuous",
          "rates": "r18-20",
          "cooldown": "10 min easy",
          "ergWorkout": {
            "zone": "UT2",
            "description": "60 min steady state at UT2 intensity",
            "distance": "14000",
            "duration": "60 min",
            "targetSplit": "2:05/500m",
            "rate": "r18-20",
            "warmup": "10 min easy rowing",
            "cooldown": "10 min easy",
            "restPeriods": ""
          }
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
- Each week MUST contain 7 days.
- Each week MUST have a "phase" field: one of "Base", "Build", "Peak", or "Taper".
- Each day MUST have ALL of these fields:
  - "day": integer 1 (Monday) through 7 (Sunday)
  - "type": one of "UT2", "UT1", "TR", "AT", "LIFT", "REST", "OFF", or "CROSS"
  - "warmup": short string (e.g. "10 min easy") or "" for rest days
  - "workout": concise printable description (e.g. "4x2000m @AT" or "Squat 4x6, Deadlift 3x5") or "Rest" for rest days
  - "rest": rest interval between pieces (e.g. "3:00 rest") or ""
  - "breakup": piece structure (e.g. "4x2000m" or "3x20 min") or "" for continuous/rest
  - "rates": stroke rate or lift tempo (e.g. "r20-22" or "controlled") or ""
  - "cooldown": short string (e.g. "10 min easy") or "" for rest days
  - "ergWorkout": object with { zone, description, distance (meters as string), duration (e.g. "60 min"), targetSplit (e.g. "2:05/500m"), rate, warmup, cooldown, restPeriods } — use null for non-erg days
- The workouts MUST be specific, actionable, and unique for each day.
- For strength/lift days set "type" to "LIFT" and set "ergWorkout" to null.
- For rest/off days set "type" to "REST", set "workout" to "Rest", and set "ergWorkout" to null.

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

    // ---------------------------
    // EXTRACT + PARSE JSON (with repair pass on failure)
    // ---------------------------
    const tryParseJson = (raw: string): object | null => {
      const s = raw.indexOf("{");
      const e = raw.lastIndexOf("}");
      if (s === -1 || e === -1 || e <= s) return null;
      try {
        return JSON.parse(raw.slice(s, e + 1));
      } catch {
        return null;
      }
    };

    let parsed = tryParseJson(text);

    if (!parsed) {
      // First parse failed — send through strict JSON repair pass
      console.warn("First parse failed, attempting repair pass");

      const repairSystemPrompt = `You are a strict JSON‑only generator for RowSync's training‑plan API.
Your ONLY job is to take a natural‑language training plan and output a fully valid JSON object that can be parsed by Supabase Edge Functions without errors.

RULES:
- Output MUST be valid JSON.
- NO comments, no trailing commas, no explanations, no markdown.
- Never wrap JSON in code fences.
- Never include text before or after the JSON.
- All strings must be double‑quoted.
- All null values must be literal null.
- All numbers must be numbers, not strings.
- If the input contains invalid JSON fragments, rewrite them into valid JSON.
- If the input contains extra text, ignore it and produce clean JSON only.
- If the input contains durations like "45 min", convert them to strings.
- If the input contains distances like "10500", convert them to strings unless explicitly numeric.
- Ensure arrays and objects are properly closed.
- Ensure every week, day, and ergWorkout object is valid.

EXPECTED OUTPUT SHAPE:
{
  "duration": "string",
  "total_weeks": number,
  "plan": [
    {
      "week": number,
      "phase": "string",
      "days": [
        {
          "day": number,
          "type": "string",
          "warmup": "string",
          "workout": "string",
          "rest": "string",
          "breakup": "string",
          "rates": "string",
          "cooldown": "string",
          "ergWorkout": {
            "zone": "string",
            "description": "string",
            "distance": "string",
            "duration": "string",
            "targetSplit": "string",
            "rate": "string",
            "warmup": "string",
            "cooldown": "string",
            "restPeriods": "string"
          }
        }
      ]
    }
  ]
}

When given ANY training plan text — even if messy, partial, or malformed —
you MUST return a fully valid JSON object matching the schema above.
If something is missing, fill it with an empty string or null.
Your output must ALWAYS be valid JSON.`;

      const repairResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 16000,
          stream: false,
          system: repairSystemPrompt,
          messages: [{ role: "user", content: text }],
        }),
      });

      if (repairResponse.ok) {
        const repairResult = await repairResponse.json();
        const repairText = repairResult?.content?.[0]?.text ?? "";
        parsed = tryParseJson(repairText);
        if (parsed) {
          console.log("Repair pass succeeded");
        } else {
          console.error("Repair pass also failed:", repairText);
        }
      } else {
        console.error("Repair pass HTTP error:", repairResponse.status);
      }
    }

    if (!parsed) {
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
