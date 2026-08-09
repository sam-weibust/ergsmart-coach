import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, tokensFrom, TTL, hashKey } from "../_shared/cache.ts";
import { preflight, recordApiError, recordApiSuccess, jsonError } from "../_shared/aiGuard.ts";
import { extractJson } from "../_shared/extractJson.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-5";
const FN = "analyze-seat-race";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { pieces, boat_class, athletes } = await req.json();
    if (!pieces || pieces.length === 0) {
      return new Response(JSON.stringify({ error: "No seat race pieces provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Failsafe 2: cache before the API call.
    const cacheKey = `${FN}_${hashKey({ pieces, boat_class, athletes })}`;
    const cached = await getCached(supabase, cacheKey);
    if (cached) {
      await logUsage(supabase, { user_id: null, function_name: FN, model: MODEL, input_tokens: 0, output_tokens: 0, cache_hit: true });
      return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" } });
    }

    // Failsafe 9 + 1: circuit breaker + per-user daily limits (after cache check).
    const blocked = await preflight(supabase, { userId: null, functionName: FN, corsHeaders });
    if (blocked) return blocked;

    const prompt = `Expert rowing coach analyzing seat racing results.

Boat class: ${boat_class}
Athletes: ${JSON.stringify(athletes)}

Seat race pieces (each piece swaps athletes between lineups A and B):
${JSON.stringify(pieces)}

Analyze the cumulative data across:
- Time margins between lineup A and B per piece
- Which athletes were in which lineup
- Statistical significance of the margins
- Inconsistencies or noise in the results

Respond with ONLY valid JSON matching this shape — no markdown fence, no text outside the JSON:
{
  "rankings": [{"rank": 1, "user_id": "uuid", "name": "Athlete Name", "score": 0.95, "rationale": "one sentence"}],
  "overall_confidence": 0.7,
  "confidence_notes": "one sentence",
  "more_racing_needed": true,
  "suggested_pairs": [["uuid", "uuid"]],
  "method_notes": "one sentence"
}

Rules:
- One "rankings" entry per athlete listed above, ordered by rank starting at 1.
- Every rationale and notes field must be ONE sentence of at most 20 words. Do not elaborate.
- "score" and "overall_confidence" are numbers between 0 and 1.
- "more_racing_needed" is a boolean. "suggested_pairs" may be an empty array.`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        // 2000, not 1200: `rankings` is one entry per athlete (a seat race is
        // typically 8-16 athletes) each with a rationale, plus suggested_pairs
        // and two notes fields. 1200 truncated the JSON mid-string on a plain
        // 4-athlete run (stop_reason "max_tokens" -> JSON.parse threw -> 500),
        // because the model narrated each swap at length. The prompt now caps
        // rationale length too, so this ceiling is headroom rather than a target.
        max_tokens: 2000,
        // Disable adaptive thinking (Sonnet 5 default) — otherwise it consumed the
        // token budget and returned an empty {} analysis.
        thinking: { type: "disabled" },
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      console.error("Anthropic error:", await resp.text());
      await recordApiError(supabase, FN);
      return jsonError(corsHeaders, 503, "AI service unavailable");
    }
    await recordApiSuccess(supabase, FN);

    const result = await resp.json();
    const text = result?.content?.[0]?.text ?? "{}";
    const usage = tokensFrom(result?.usage);
    const analysis = extractJson(text);

    await setCached(supabase, cacheKey, analysis, TTL.HOUR, MODEL, usage.input_tokens, usage.output_tokens);
    await logUsage(supabase, { user_id: null, function_name: FN, model: MODEL, ...usage, cache_hit: false });

    return new Response(JSON.stringify(analysis), { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
