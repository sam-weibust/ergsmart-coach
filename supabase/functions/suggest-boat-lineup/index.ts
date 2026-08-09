import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, tokensFrom, hashKey, TTL } from "../_shared/cache.ts";
import { preflight, recordApiError, recordApiSuccess, jsonError } from "../_shared/aiGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "claude-haiku-4-5";

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

    // Cache per athlete pool + boat class + locked seats — 1h TTL.
    // The pool is a SET of candidates (the order the client happens to send
    // them in carries no meaning), and hashKey preserves array order, so sort
    // the ids explicitly or the same pool produces a different key each time.
    // locked_seats is NOT sorted — those entries are seat assignments and
    // their ordering is part of the input.
    const athleteIds = athlete_pool.map((a: any) => a.id);
    const cacheKey = `suggest_lineup:${team_id}:${boat_class}:${hashKey({ athleteIds: [...athleteIds].sort(), locked_seats })}`;
    const cached = await getCached(supabase, cacheKey);
    if (cached) {
      await logUsage(supabase, { user_id: null, function_name: "suggest-boat-lineup", model: MODEL, input_tokens: 0, output_tokens: 0, cache_hit: true });
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    // Failsafe 9: circuit breaker (after cache check).
    const blocked = await preflight(supabase, { userId: null, functionName: "suggest-boat-lineup", corsHeaders });
    if (blocked) return blocked;

    // Fetch erg scores for athletes
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

    const prompt = `Expert rowing coach optimizing a boat lineup.

Boat class: ${boat_class} (${totalSeats} seats${hasCox ? ", seat 1 is coxswain" : ""})
Locked seats (do not change): ${JSON.stringify(locked_seats)}

Athletes:
${JSON.stringify(athleteData)}

RULES:
- Seat 1 = bow (usually lightest), highest seat number = stroke
${hasCox ? "- Seat 1 is COXSWAIN: lightest, best race IQ and leadership" : ""}
- Balance port (even seats) vs starboard (odd seats) by weight
- Strongest 2k performers at the stroke end (highest seats)
- Respect side_preference where possible

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
        model: MODEL,
        // Haiku 4.5 does not think by default, so the `thinking` block that
        // Sonnet 5 needed here is gone. 500 would truncate an 8+: 9 seats x
        // ~50 tokens (uuid + name + one-sentence rationale) + cox + balance
        // notes + a 2-3 sentence overall_rationale is ~600 tokens.
        max_tokens: 900,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      console.error("Anthropic error:", await resp.text());
      await recordApiError(supabase, "suggest-boat-lineup");
      return jsonError(corsHeaders, 503, "AI service unavailable");
    }
    await recordApiSuccess(supabase, "suggest-boat-lineup");

    const result = await resp.json();
    const usage = result?.usage ?? {};
    const text = result?.content?.[0]?.text ?? "{}";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const suggestion = JSON.parse(text.slice(start, end + 1));

    const tokens = tokensFrom(usage);
    await setCached(supabase, cacheKey, suggestion, TTL.HOUR, MODEL, tokens.input_tokens, tokens.output_tokens);
    await logUsage(supabase, { user_id: null, function_name: "suggest-boat-lineup", model: MODEL, ...tokens, cache_hit: false });
    return new Response(JSON.stringify(suggestion), { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
