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

    const { team_id, boat_class, athlete_pool, locked_seats = [] } = await req.json();
    if (!team_id || !boat_class || !athlete_pool) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch erg scores for athletes
    const athleteIds = athlete_pool.map((a: any) => a.id);
    const { data: ergScores } = await supabase
      .from("erg_scores")
      .select("*")
      .in("user_id", athleteIds)
      .eq("test_type", "2k")
      .order("recorded_at", { ascending: false });

    // Group by user_id, take latest
    const latestErg: Record<string, any> = {};
    for (const s of (ergScores || [])) {
      if (!latestErg[s.user_id]) latestErg[s.user_id] = s;
    }

    const athleteData = athlete_pool.map((a: any) => ({
      id: a.id,
      name: a.full_name || a.username || "Unknown",
      weight_kg: a.weight_kg || (a.weight ? a.weight / 2.205 : null),
      height_cm: a.height_cm || (a.height ? a.height * 2.54 : null),
      side_preference: a.side_preference || "both",
      position_preference: a.position_preference || "any",
      best_2k_watts: latestErg[a.id]?.watts || null,
      best_2k_seconds: latestErg[a.id]?.time_seconds || null,
    }));

    const SEAT_COUNTS: Record<string, number> = { "8+": 9, "4+": 5, "4-": 4, "2x": 2, "2-": 3, "1x": 1 };
    const totalSeats = SEAT_COUNTS[boat_class] || 8;
    const hasCox = boat_class.includes("+");

    const prompt = `You are an expert rowing coach optimizing a boat lineup.

Boat class: ${boat_class} (${totalSeats} seats total${hasCox ? ", seat 1 is coxswain" : ""})
Locked seats (do not change): ${JSON.stringify(locked_seats)}

Available athletes:
${JSON.stringify(athleteData, null, 2)}

Rules for rowing lineup:
- Seat 1 is bow (lightest/smallest usually), highest seat number is stroke
${hasCox ? "- Seat 1 in this format is COXSWAIN (lightest, best race IQ, leadership)" : ""}
- Balance port (even seats) vs starboard (odd seats) by weight
- Put strongest 2k performers at stroke end (highest seats)
- Respect side preferences when possible
- For 8+: seats 8=stroke, 7=seven, 6=six, 5=five, 4=four, 3=three, 2=two, 1=bow${hasCox ? ", cox=separate" : ""}

Respond with ONLY valid JSON, no extra text:
{
  "seats": [
    {"seat_number": 1, "user_id": "...", "name": "...", "rationale": "one sentence"},
    ...
  ],
  "cox": {"user_id": "...", "name": "...", "rationale": "..."} or null if no cox,
  "balance_score": 0-100,
  "balance_notes": "brief port/starboard weight balance note",
  "overall_rationale": "2-3 sentence lineup strategy explanation"
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
    const suggestion = JSON.parse(text.slice(start, end + 1));

    return new Response(JSON.stringify(suggestion), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
