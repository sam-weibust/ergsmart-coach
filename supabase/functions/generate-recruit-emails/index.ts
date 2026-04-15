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

    // Frontend must send: { user_id, athlete_info, target_school }
    const { user_id, athlete_info, target_school } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user profile + goals + recent erg results
    const [profileRes, goalsRes, ergRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user_id).maybeSingle(),
      supabase
        .from("user_goals")
        .select("*")
        .eq("user_id", user_id)
        .maybeSingle(),
      supabase
        .from("erg_workouts")
        .select("*")
        .eq("user_id", user_id)
        .order("workout_date", { ascending: false })
        .limit(3),
    ]);

    const profile = profileRes.data;
    const goals = goalsRes.data;
    const recentErg = ergRes.data || [];

    const ergSummary = recentErg.length
      ? recentErg
          .map(
            (w) =>
              `- ${w.workout_date}: ${w.distance}m in ${w.duration} (avg split ${w.avg_split})`
          )
          .join("\n")
      : "No recent erg results";

    const userContext = `
ATHLETE PROFILE:
- Name: ${profile?.full_name || "Unknown"}
- Graduation Year: ${profile?.grad_year || "Unknown"}
- Height: ${profile?.height || "Unknown"}cm
- Weight: ${profile?.weight || "Unknown"}kg
- Experience: ${profile?.experience_level || "Unknown"}

PERFORMANCE:
${ergSummary}

GOALS:
- 2K: ${goals?.current_2k_time || "Not set"} → Goal: ${goals?.goal_2k_time || "Not set"}
- 5K: ${goals?.current_5k_time || "Not set"} → Goal: ${goals?.goal_5k_time || "Not set"}

TARGET SCHOOL:
${target_school}
`.trim();

    const systemPrompt = `
You are CrewSync AI, an expert rowing recruiting assistant.

Your job:
- Write polished, professional recruiting emails
- Tailor tone and content to the target school
- Highlight athlete strengths and performance
- Keep the email concise, confident, and respectful
- Use markdown formatting
- Provide 2–3 variations the athlete can choose from

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
          max_tokens: 4096,
          stream: true,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `Generate recruiting email drafts for:\n${JSON.stringify(
                athlete_info,
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
    console.error("generate-recruit-emails error:", e);
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
