import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { workout_type, preferences } = await req.json();

    // Fetch user context
    const [profileRes, goalsRes, recentErgRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase
        .from("user_goals")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("erg_workouts")
        .select("*")
        .eq("user_id", user.id)
        .order("workout_date", { ascending: false })
        .limit(5),
    ]);

    const profile = profileRes.data;
    const goals = goalsRes.data;
    const recentErg = recentErgRes.data || [];

    const userContext = `
USER PROFILE:
- Name: ${profile?.full_name || "Unknown"}
- Experience: ${profile?.experience_level || "Unknown"}
- Age: ${profile?.age || "Unknown"}, Weight: ${profile?.weight || "Unknown"}kg

USER GOALS:
- 2K: ${goals?.current_2k_time || "Not set"} → ${goals?.goal_2k_time || "Not set"}
- 5K: ${goals?.current_5k_time || "Not set"} → ${goals?.goal_5k_time || "Not set"}
- 6K: ${goals?.current_6k_time || "Not set"} → ${goals?.goal_6k_time || "Not set"}

RECENT ERG WORKOUTS:
${
  recentErg.length
    ? recentErg
        .map(
          (w) =>
            `- ${w.workout_date}: ${w.workout_type}, ${w.distance}m, duration: ${w.duration}, avg split: ${w.avg_split}`
        )
        .join("\n")
    : "No recent workouts"
}
`.trim();

    const systemPrompt = `
You are CrewSync AI — an expert rowing coach.

You design:
- Steady state sessions
- Interval workouts
- Threshold work
- Race prep pieces
- Technique-focused sessions

Guidelines:
- Use the user's real data
- Give specific paces (splits) based on fitness
- Use rowing terminology naturally
- Provide warmup + main set + cooldown
- Use markdown formatting
`;

    const userPrompt = `
Create a ${workout_type} workout.

User preferences:
${JSON.stringify(preferences, null, 2)}

User context:
${userContext}
`;

    // Anthropic request
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
          model: "claude-3-5-sonnet-latest",
          max_tokens: 4096,
          stream: true,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
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

    return new Response(anthropicResponse.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
      },
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
