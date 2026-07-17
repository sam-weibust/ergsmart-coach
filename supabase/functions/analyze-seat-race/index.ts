import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, TTL, hashKey } from "../_shared/cache.ts";
import { preflight, recordApiError, recordApiSuccess, jsonError } from "../_shared/aiGuard.ts";

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

    const prompt = `You are an expert rowing coach analyzing seat racing results.

Boat class: ${boat_class}
Athletes: ${JSON.stringify(athletes)}

Seat race pieces (each piece swaps athletes between lineups A and B):
${JSON.stringify(pieces, null, 2)}

Analyze the cumulative seat racing data. Consider:
- Time margins between lineup A and B in each piece
- Which athletes were in which lineup
- Statistical significance of margins
- Any inconsistencies or noise in results

Respond with ONLY valid JSON:
{
  "rankings": [
    {"rank": 1, "user_id": "...", "name": "...", "score": 0.95, "rationale": "brief explanation"},
    ...
  ],
  "overall_confidence": 0.0-1.0,
  "confidence_notes": "explanation of confidence level",
  "more_racing_needed": true/false,
  "suggested_pairs": [["athlete1_id", "athlete2_id"], ...],
  "method_notes": "statistical method used"
}`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
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
    const usage = result?.usage ?? {};
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const analysis = JSON.parse(text.slice(start, end + 1));

    await setCached(supabase, cacheKey, analysis, TTL.HOUR, MODEL, usage.input_tokens, usage.output_tokens);
    await logUsage(supabase, { user_id: null, function_name: FN, model: MODEL, input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, cache_hit: false });

    return new Response(JSON.stringify(analysis), { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
