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
${JSON.stringify(profile, null, 2)}

GOALS:
${JSON.stringify(goals, null, 2)}

GPA:
${gpa}

GENDER:
${gender}

RECENT ERG RESULTS:
${ergSummary}
`.trim();

    const systemPrompt = `
You are CrewSync AI, an expert rowing recruiting analyst.

Your job:
- Predict the athlete's realistic recruiting tier (D1 top, D1 mid, D1 low, D2, D3, Club)
- Provide strengths and weaknesses
- Provide improvement suggestions
- Provide coach-style observations
- Provide a 30-day action plan
- Use rowing recruiting terminology naturally
- Use markdown formatting
- Be honest but encouraging
- Base everything ONLY on the provided data

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
              content:
                "Analyze the athlete and provide a full recruiting evaluation.",
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
