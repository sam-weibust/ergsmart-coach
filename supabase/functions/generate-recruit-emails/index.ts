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

    const systemPrompt = `You are CrewSync AI, an expert rowing recruiting assistant.

Athlete context:
${userContext}

Output ONLY a valid JSON object — no markdown, no commentary:
{
  "general_email": "coach@school.edu (or best guess pattern)",
  "coaches": [
    {
      "name": "Coach Name",
      "title": "Head Coach",
      "email": "email@school.edu",
      "confidence": "likely",
      "notes": "optional note"
    }
  ],
  "email_campaign": [
    {
      "sequence_number": 1,
      "email_type": "Initial Contact",
      "timing": "Send now",
      "subject": "Email subject line",
      "body": "Full email body text",
      "tips": "Brief tip for this email"
    },
    {
      "sequence_number": 2,
      "email_type": "Follow-Up",
      "timing": "2 weeks after initial",
      "subject": "Follow-up subject",
      "body": "Full follow-up body",
      "tips": "Brief tip"
    }
  ],
  "campaign_tips": ["tip 1", "tip 2", "tip 3"]
}

Rules:
- confidence must be one of: "verified", "likely", "pattern-based"
- Include 3 emails in the campaign (initial, follow-up, final)
- Tailor content to the specific target school
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
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          stream: false,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: `Generate the recruiting email campaign for target school: ${target_school}`,
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
    let parsed: any = { coaches: [], email_campaign: [], campaign_tips: [] };
    if (start !== -1 && end > start) {
      try { parsed = JSON.parse(rawText.slice(start, end + 1)); } catch { /* fallback */ }
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
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
