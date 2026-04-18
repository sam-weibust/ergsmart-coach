import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { team_id } = await req.json();

    const { data: members } = await supabase
      .from("team_members")
      .select("user_id, profiles(full_name, graduation_year, side_preference, position_preference, weight_kg, height_cm)")
      .eq("team_id", team_id);

    const { data: ergScores } = await supabase
      .from("erg_scores")
      .select("user_id, test_type, watts, time_seconds, recorded_at")
      .eq("team_id", team_id)
      .order("recorded_at", { ascending: false });

    const currentYear = new Date().getFullYear();

    const prompt = `You are an expert rowing recruiting coordinator.

Current year: ${currentYear}
Team members with profiles: ${JSON.stringify(members || [], null, 2)}
Recent erg scores: ${JSON.stringify(ergScores?.slice(0, 50) || [])}

Analyze the team roster for recruiting gaps. Consider:
- Graduation year distribution (who graduates in 1, 2, 3, 4 years)
- Port/starboard balance (side_preference)
- Erg score distribution (speed depth)
- Weight distribution (lightweight vs heavyweight)
- Coxswain pipeline

Respond with ONLY valid JSON:
{
  "gaps": [
    {"position": "stroke|bow|cox|mid", "side": "port|starboard|either", "urgency": "immediate|2_years|long_term", "reason": "...", "target_2k_watts": 200}
  ],
  "roster_health_score": 0-100,
  "graduation_risk": "Describe who graduates when and the impact",
  "recommendations": ["rec 1", "rec 2", "rec 3"],
  "priority_recruit_profile": "Describe the ideal next recruit in 2-3 sentences"
}`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) throw new Error(`Anthropic error: ${await resp.text()}`);
    const result = await resp.json();
    const text = result?.content?.[0]?.text ?? "{}";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const analysis = JSON.parse(text.slice(start, end + 1));

    return new Response(JSON.stringify(analysis), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
