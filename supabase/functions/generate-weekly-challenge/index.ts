import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, tokensFrom, hashKey, TTL } from "../_shared/cache.ts";
import { preflight, recordApiError, recordApiSuccess, jsonError } from "../_shared/aiGuard.ts";
import { extractJson } from "../_shared/extractJson.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-haiku-4-5";
const FN = "generate-weekly-challenge";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const { week_start } = body;

    if (!week_start) {
      return new Response(JSON.stringify({ error: "Missing week_start" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if challenge already exists
    const { data: existing } = await supabase
      .from("weekly_challenges")
      .select("*")
      .eq("week_start", week_start)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify(existing), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const month = new Date(week_start).getMonth(); // 0-11
    // Season phases: base = Aug-Oct (7-9), build = Nov-Jan (10-0), race_prep = Feb-Apr (1-3), peak = May-Jul (4-6)
    let season_phase = "base";
    if (month >= 10 || month === 0) season_phase = "build";
    else if (month >= 1 && month <= 3) season_phase = "race_prep";
    else if (month >= 4 && month <= 6) season_phase = "peak";

    const prompt = `Rowing coach setting this week's team challenge.
Season phase: ${season_phase}. Week of: ${week_start}.

Challenge types:
- fastest_2k_improvement: biggest 2k erg time improvement vs last week
- most_meters: most total erg meters this week
- consistent_splits: most consistent splits across a 2k+ piece
- highest_wpk_gain: biggest watts-per-kilogram gain vs last week

Phase emphasis: base = volume/aerobic; build = volume + intensity; race_prep = intensity/speed work; peak = race simulation and speed.

Pick the best type for this phase. Title max 60 chars, description max 150 chars, both motivating.

Respond with ONLY this JSON:
{
  "challenge_type": "<one of the four types above>",
  "title": "<title>",
  "description": "<description>",
  "reasoning": "<one sentence why>"
}`;

    // Cache the MODEL OUTPUT (the parsed challenge), not the HTTP response: the
    // response is the weekly_challenges row, which must be inserted for real.
    // week_start already is the date component — the challenge is per-week by
    // definition, so no separate YYYY-MM-DD field is needed. season_phase is
    // derived from week_start but is in the key because the derivation could
    // change. This layer only fires when the weekly_challenges row is missing
    // (deleted, or a retry after a failed insert) — the row check above is the
    // first-line cache.
    const cacheKey = `generate-weekly-challenge_${hashKey({ week_start, season_phase })}`;
    const cachedChallenge = await getCached(supabase, cacheKey) as any;
    // A contentless entry is treated as a miss, not served.
    let parsed: any = cachedChallenge?.challenge_type && cachedChallenge?.title ? cachedChallenge : null;
    const cacheHit = parsed !== null;

    if (cacheHit) {
      await logUsage(supabase, {
        user_id: null,
        function_name: FN,
        model: MODEL,
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        cache_hit: true,
      });
    } else {
      // Failsafe 9 + 1: circuit breaker (after both cache checks).
      const blocked = await preflight(supabase, { userId: null, functionName: FN, corsHeaders });
      if (blocked) return blocked;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          // 300, not 500: the required output is four short fields with hard
          // caps (60 + 150 chars + one sentence) — roughly 120 tokens.
          max_tokens: 300,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        console.error("Anthropic error:", await response.text());
        await recordApiError(supabase, FN);
        return jsonError(corsHeaders, 503, "AI service unavailable");
      }
      await recordApiSuccess(supabase, FN);

      const aiData = await response.json();
      const text = aiData.content?.[0]?.text || "{}";
      const tok = tokensFrom(aiData?.usage);
      await logUsage(supabase, {
        user_id: null,
        function_name: FN,
        model: MODEL,
        input_tokens: tok.input_tokens,
        output_tokens: tok.output_tokens,
        cache_creation_input_tokens: tok.cache_creation_input_tokens,
        cache_read_input_tokens: tok.cache_read_input_tokens,
        cache_hit: false,
      });

      let didParse = false;
      try {
        // Balanced-brace scan, not /\{[\s\S]*\}/ — the greedy span runs to the
        // LAST "}" in the response, so any closing prose containing a brace
        // makes the slice unparseable and silently drops us to the fallback.
        parsed = extractJson(text);
        didParse = true;
      } catch (e) {
        console.error("[generate-weekly-challenge] JSON extraction failed:", e, "raw:", text.slice(0, 1000));
        parsed = {
          challenge_type: season_phase === "base" ? "most_meters" : "fastest_2k_improvement",
          title: season_phase === "base" ? "Volume King Challenge" : "Speed Improvement Challenge",
          description: season_phase === "base" ? "Log the most meters this week!" : "Improve your 2k the most this week!",
          reasoning: "Defaulted based on season phase.",
        };
      }

      // A week: the entry is scoped to one week_start and is worthless after it.
      // Only cache a real, populated parse — never persist the hardcoded
      // fallback or an empty `{}` from a model reply with no JSON in it.
      if (didParse && parsed?.challenge_type && parsed?.title) {
        await setCached(supabase, cacheKey, parsed, TTL.WEEK, MODEL, tok.input_tokens, tok.output_tokens);
      }
    }

    const { data: newChallenge, error } = await supabase
      .from("weekly_challenges")
      .insert({
        week_start,
        challenge_type: parsed.challenge_type || "most_meters",
        title: parsed.title || "Weekly Challenge",
        description: parsed.description || "Complete your training this week!",
        season_phase,
        ai_reasoning: parsed.reasoning,
      })
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify(newChallenge), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": cacheHit ? "HIT" : "MISS" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
