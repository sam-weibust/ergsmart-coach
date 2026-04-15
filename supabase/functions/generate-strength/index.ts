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

    // Caller sends: { weight, height, experience, goals } OR { user_id, muscle_group, equipment, preferences }
    const body = await req.json();
    const user_id = body.user_id;
    const muscle_group = body.muscle_group || "full body";
    const equipment = body.equipment || "standard gym";
    const preferences = body.preferences || {};

    // Use inline fields if provided (from MultiSetStrengthForm), else fetch from DB
    const inlineWeight = body.weight;
    const inlineHeight = body.height;
    const inlineExperience = body.experience;
    const inlineGoals = body.goals;

    let profile: any = null;
    let goals: any = null;
    let recentStrength: any[] = [];

    if (user_id) {
      const [profileRes, goalsRes, strengthRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user_id).maybeSingle(),
        supabase.from("user_goals").select("*").eq("user_id", user_id).maybeSingle(),
        supabase.from("strength_workouts").select("*").eq("user_id", user_id)
          .order("workout_date", { ascending: false }).limit(5),
      ]);
      profile = profileRes.data;
      goals = goalsRes.data;
      recentStrength = strengthRes.data || [];
    }

    const userContext = `
USER PROFILE:
- Experience: ${inlineExperience || profile?.experience_level || "Unknown"}
- Weight: ${inlineWeight || profile?.weight || "Unknown"}kg
- Height: ${inlineHeight || profile?.height || "Unknown"}cm
- Goals: ${inlineGoals || profile?.goals || "General fitness"}
${recentStrength.length ? `\nRECENT STRENGTH:\n${recentStrength.map((w) => `- ${w.exercise} ${w.sets}x${w.reps} @ ${w.weight}kg`).join("\n")}` : ""}
`.trim();

    const systemPrompt = `You are CrewSync AI, an expert strength coach for rowers.

User context:
${userContext}

Output ONLY a valid JSON object with this exact structure — no markdown, no commentary:
{
  "suggestions": {
    "suggestions": [
      {
        "exercise": "Exercise Name",
        "sets": 3,
        "reps": 8,
        "recommendedWeight": 60,
        "notes": "brief coaching cue"
      }
    ]
  }
}

Rules:
- Include 5-8 exercises appropriate for the requested muscle group and equipment
- recommendedWeight is in kilograms
- sets and reps are numbers
- Make exercises rowing-specific and periodization-appropriate
- No text outside the JSON object`.trim();

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
          max_tokens: 2048,
          stream: false,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: `Muscle group: ${muscle_group}\nEquipment: ${equipment}\nPreferences: ${JSON.stringify(preferences, null, 2)}`,
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
    let parsed: any = { suggestions: { suggestions: [] } };
    if (start !== -1 && end > start) {
      try { parsed = JSON.parse(rawText.slice(start, end + 1)); } catch { /* fallback */ }
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-strength error:", e);
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
