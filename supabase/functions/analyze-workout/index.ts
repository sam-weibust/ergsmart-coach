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

    // Frontend must send: { user_id, workout }
    const { user_id, workout } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!workout) {
      return new Response(JSON.stringify({ error: "Missing workout data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user profile + goals for context
    const [profileRes, goalsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user_id).maybeSingle(),
      supabase
        .from("user_goals")
        .select("*")
        .eq("user_id", user_id)
        .maybeSingle(),
    ]);

    const profile = profileRes.data;
    const goals = goalsRes.data;

    const userContext = `
USER PROFILE:
- Name: ${profile?.full_name || "Unknown"}
- Experience: ${profile?.experience_level || "Unknown"}
- Age: ${profile?.age || "Unknown"}, Weight: ${profile?.weight || "Unknown"}kg

USER GOALS:
- 2K: ${goals?.current_2k_time || "Not set"} → Goal: ${goals?.goal_2k_time || "Not set"}
- 5K: ${goals?.current_5k_time || "Not set"} → Goal: ${goals?.goal_5k_time || "Not set"}
- 6K: ${goals?.current_6k_time || "Not set"} → Goal: ${goals?.goal_6k_time || "Not set"}
`.trim();

    const systemPrompt = `
You are CrewSync AI, an expert rowing and strength training analyst.

Your job:
- Analyze the user's workout in depth
- Identify strengths, weaknesses, pacing trends, technique implications
- Provide actionable recommendations
- Suggest drills, pacing adjustments, or strength focuses
- Use rowing terminology naturally
- Use markdown formatting
- Keep feedback honest but encouraging

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
          model: "claude-3-5-sonnet-latest",
          max_tokens: 4096,
          stream: true,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `Analyze this workout:\n${JSON.stringify(
                workout,
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

    return new Response(anthropicResponse.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
      },
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
