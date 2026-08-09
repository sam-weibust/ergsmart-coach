import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, tokensFrom, hashKey, TTL } from "../_shared/cache.ts";
import { preflight, recordApiError, recordApiSuccess, jsonError } from "../_shared/aiGuard.ts";
import { extractJson } from "../_shared/extractJson.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "claude-sonnet-5";

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

    // Cache per athlete SET + boat class + locked seats + factor weights.
    // athlete_ids is the pool of candidates to place, not a seat order, so its
    // ordering is not semantically meaningful — hashKey preserves array order,
    // so sort explicitly to keep one entry per roster. locked_seats IS ordered
    // (each entry pins a seat) and is deliberately left alone.
    const cacheKey = `lineup:${team_id}:${boat_class}:${hashKey({ athlete_ids: [...(athlete_ids ?? [])].sort(), locked_seats, factor_weights })}`;
    const cached = await getCached(supabase, cacheKey);
    if (cached) {
      await logUsage(supabase, { function_name: "optimize-race-lineup", model: MODEL, input_tokens: 0, output_tokens: 0, cache_hit: true });
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    // Failsafe 9: circuit breaker (team — no per-user limit).
    const blocked = await preflight(supabase, { userId: null, functionName: "optimize-race-lineup", corsHeaders });
    if (blocked) return blocked;

    // Fetch all relevant data
    const [ergRes, seatRaceRes, loadRes] = await Promise.all([
      supabase.from("erg_scores").select("*").in("user_id", athlete_ids).order("recorded_at", { ascending: false }),
      supabase.from("seat_races").select("*").eq("team_id", team_id).order("race_date", { ascending: false }).limit(10),
      supabase.from("weekly_load_logs").select("*").in("user_id", athlete_ids).order("week_start", { ascending: false }).limit(athlete_ids.length * 4),
    ]);

    const prompt = `Elite rowing coach building a race lineup. Balance all factors by the given weights and flag fatigue concerns. Keep every rationale to one short sentence.

Race: ${race_name || "Regatta"} on ${race_date || "upcoming"}
Boat class: ${boat_class}
Factor weights: ${JSON.stringify(factor_weights || { erg: 0.4, onwater: 0.3, seat_race: 0.3 })}
Locked seats (cannot change): ${JSON.stringify(locked_seats)}

Erg scores (latest per athlete): ${JSON.stringify(ergRes.data?.slice(0, 50) || [])}
Recent seat race sessions: ${JSON.stringify(seatRaceRes.data || [])}
Recent load/fatigue: ${JSON.stringify(loadRes.data || [])}
Athlete IDs to place: ${JSON.stringify(athlete_ids)}

Respond with ONLY valid JSON matching this shape — no markdown fence, no text outside the JSON:
{
  "seats": [{"seat_number": 1, "user_id": "uuid", "rationale": "one sentence", "confidence": 0.8}],
  "cox": {"user_id": "uuid", "rationale": "one sentence"},
  "overall_rationale": "one sentence",
  "fatigue_flags": [{"user_id": "uuid", "concern": "one sentence"}],
  "overall_confidence": 0.7
}

Rules:
- One "seats" entry per athlete you place, plus "cox" only if this boat class carries a coxswain (otherwise "cox": null).
- Every rationale and concern must be ONE sentence of at most 15 words. Do not elaborate.
- "confidence" and "overall_confidence" are numbers between 0 and 1.
- "fatigue_flags" may be an empty array.`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        // thinking MUST stay disabled: adaptive thinking is Sonnet 5's default
        // and max_tokens caps thinking + text together, so with it on the whole
        // budget went to thinking and the lineup came back as {}.
        //
        // 800 was too small and truncated the JSON mid-string on every 8+ call
        // (stop_reason "max_tokens" -> JSON.parse threw -> HTTP 500). A 9-seat
        // 8+ needs the larger budget; smaller classes cap out well under 1500.
        max_tokens: boat_class === "8+" ? 2500 : 1500,
        thinking: { type: "disabled" },
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      console.error("Anthropic error:", await resp.text());
      await recordApiError(supabase, "optimize-race-lineup");
      return jsonError(corsHeaders, 503, "AI service unavailable");
    }
    await recordApiSuccess(supabase, "optimize-race-lineup");
    const result = await resp.json();
    const text = result?.content?.[0]?.text ?? "{}";
    const lineup = extractJson(text);

    const tokens = tokensFrom(result?.usage);
    await setCached(supabase, cacheKey, lineup, TTL.SIX_HOURS, MODEL, tokens.input_tokens, tokens.output_tokens);
    await logUsage(supabase, { function_name: "optimize-race-lineup", model: MODEL, ...tokens, cache_hit: false });
    return new Response(JSON.stringify(lineup), { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
