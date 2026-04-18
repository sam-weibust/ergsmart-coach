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

    const { team_id, weeks_until_race, season_phase } = await req.json();

    const { data: loadData } = await supabase
      .from("weekly_load_logs")
      .select("*, profiles(full_name, username)")
      .eq("team_id", team_id)
      .order("week_start", { ascending: false })
      .limit(100);

    const prompt = `You are an expert rowing periodization coach.

Season phase: ${season_phase || "general preparation"}
Weeks until major race: ${weeks_until_race || "unknown"}

Team weekly load data (last 8 weeks):
${JSON.stringify(loadData || [], null, 2)}

Analyze load patterns and provide recommendations. Consider:
- Safe weekly volume: on-water max 80km/week, erg max 100km/week
- Fatigue scores 7+ are high risk
- Taper should begin 2-3 weeks before race
- Volume should increase no more than 10% per week

Respond with ONLY valid JSON:
{
  "alerts": [
    {"user_id": "...", "name": "...", "type": "overtraining|undertraining|high_fatigue", "message": "..."}
  ],
  "recommendations": "3-4 sentence periodization recommendation",
  "suggested_phase": "base|build|peak|taper|recovery",
  "volume_adjustments": [
    {"user_id": "...", "name": "...", "adjustment": "reduce by 20%|maintain|increase by 10%", "reason": "..."}
  ],
  "team_readiness_score": 0-100
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
