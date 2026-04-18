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

    const { team_id, boat_class, athlete_ids, locked_seats = [], race_name, race_date, factor_weights } = await req.json();

    // Fetch all relevant data
    const [ergRes, seatRaceRes, loadRes] = await Promise.all([
      supabase.from("erg_scores").select("*").in("user_id", athlete_ids).order("recorded_at", { ascending: false }),
      supabase.from("seat_races").select("*").eq("team_id", team_id).order("race_date", { ascending: false }).limit(10),
      supabase.from("weekly_load_logs").select("*").in("user_id", athlete_ids).order("week_start", { ascending: false }).limit(athlete_ids.length * 4),
    ]);

    const prompt = `You are an elite rowing coach building a race lineup.

Race: ${race_name || "Regatta"} on ${race_date || "upcoming"}
Boat class: ${boat_class}
Factor weights: ${JSON.stringify(factor_weights || { erg: 0.4, onwater: 0.3, seat_race: 0.3 })}
Locked seats (cannot change): ${JSON.stringify(locked_seats)}

Erg scores (latest per athlete): ${JSON.stringify(ergRes.data?.slice(0, 50) || [])}
Recent seat race sessions: ${JSON.stringify(seatRaceRes.data || [])}
Recent load/fatigue: ${JSON.stringify(loadRes.data || [])}
Athlete IDs to place: ${JSON.stringify(athlete_ids)}

Build the optimal lineup balancing all factors. Flag any fatigue concerns.

Respond with ONLY valid JSON:
{
  "seats": [
    {"seat_number": 1, "user_id": "...", "rationale": "...", "confidence": 0.0-1.0},
    ...
  ],
  "cox": {"user_id": "...", "rationale": "..."} or null,
  "overall_rationale": "...",
  "fatigue_flags": [{"user_id": "...", "concern": "..."}],
  "overall_confidence": 0.0-1.0
}`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) throw new Error(`Anthropic error: ${await resp.text()}`);
    const result = await resp.json();
    const text = result?.content?.[0]?.text ?? "{}";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const lineup = JSON.parse(text.slice(start, end + 1));

    return new Response(JSON.stringify(lineup), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
