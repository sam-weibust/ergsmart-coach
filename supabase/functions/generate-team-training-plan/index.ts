import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

    const { team_id, weeks, season_phase, practice_days_per_week, injured_athletes = [] } = await req.json();

    const { data: loadData } = await supabase
      .from("weekly_load_logs")
      .select("user_id, fatigue_score, total_meters")
      .eq("team_id", team_id)
      .order("week_start", { ascending: false })
      .limit(30);

    const { data: ergScores } = await supabase
      .from("erg_scores")
      .select("user_id, watts, test_type")
      .eq("team_id", team_id)
      .order("recorded_at", { ascending: false })
      .limit(50);

    const twokScores = ergScores?.filter(e => e.test_type === "2k") || [];
    const avgWatts2k = twokScores.length
      ? twokScores.reduce((acc, e) => acc + (e.watts || 0), 0) / twokScores.length
      : 0;

    const prompt = `Generate a ${weeks}-week team rowing training plan.

Season phase: ${season_phase || "general preparation"}
Practice days per week: ${practice_days_per_week || 5}
Injured/restricted athletes: ${JSON.stringify(injured_athletes)}
Team average 2k watts: ${avgWatts2k?.toFixed(0) || "unknown"}
High fatigue athletes: ${JSON.stringify(loadData?.filter(l => (l.fatigue_score || 0) >= 7).map(l => l.user_id) || [])}

Generate a complete multi-week plan. Each session must have:
- Warmup (specific, 10-15 min)
- Main set (segments with distance/rate/zone/rest)
- Cooldown (5-10 min)
- Zones: UT2 (easy), UT1 (moderate), TR (threshold), AT (anaerobic threshold)

Varsity gets higher volume (~20%) than novice.
Fatigue athletes get reduced load this week.

Respond with ONLY valid JSON:
{
  "weeks": [
    {
      "week": 1,
      "phase": "base|build|peak|taper",
      "focus": "e.g. aerobic base",
      "days": [
        {
          "day": 1,
          "day_name": "Monday",
          "session_type": "erg|on_water|rest|cross_training",
          "title": "Session title",
          "total_meters": 12000,
          "warmup": "10 min easy paddle",
          "main_set": [
            {"segment": 1, "description": "4x2000m", "distance": 2000, "repeats": 4, "zone": "UT1", "rate": 20, "rest": "3 min", "notes": ""}
          ],
          "cooldown": "10 min easy",
          "varsity_notes": "",
          "novice_notes": ""
        }
      ]
    }
  ]
}`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) throw new Error(`Anthropic error: ${await resp.text()}`);
    const result = await resp.json();
    const text = result?.content?.[0]?.text ?? "{}";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const plan = JSON.parse(text.slice(start, end + 1));

    return new Response(JSON.stringify(plan), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
