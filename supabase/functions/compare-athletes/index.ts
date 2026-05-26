import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, hashKey, TTL } from "../_shared/cache.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-haiku-4-5-20251001";

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
    const { athlete1, athlete2 } = body;

    if (!athlete1 || !athlete2) {
      return new Response(JSON.stringify({ error: "Missing athlete data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cache by sorted athlete data hash (6h TTL)
    const cacheKey = `compare_${hashKey([athlete1, athlete2])}`;
    const cached = await getCached(supabase, cacheKey);
    if (cached) {
      await logUsage(supabase, { function_name: "compare-athletes", model: MODEL, input_tokens: 0, output_tokens: 0, cache_hit: true });
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    const prompt = `Expert rowing coach comparing two athletes for boat placement.

A: ${athlete1.name} | 2k: ${athlete1.best2k||"N/A"} (${athlete1.best2k_watts||"N/A"}W) | 6k: ${athlete1.best6k||"N/A"} | W/kg: ${athlete1.wpk ? Math.round(athlete1.wpk*10)/10 : "N/A"} | Load 7d: ${athlete1.recent_meters||"N/A"}m | Fatigue: ${athlete1.fatigue||"N/A"}/10 | Seat races: ${athlete1.seat_wins||0}/${athlete1.seat_total||0} | Improvement: ${athlete1.improvement||"N/A"}s

B: ${athlete2.name} | 2k: ${athlete2.best2k||"N/A"} (${athlete2.best2k_watts||"N/A"}W) | 6k: ${athlete2.best6k||"N/A"} | W/kg: ${athlete2.wpk ? Math.round(athlete2.wpk*10)/10 : "N/A"} | Load 7d: ${athlete2.recent_meters||"N/A"}m | Fatigue: ${athlete2.fatigue||"N/A"}/10 | Seat races: ${athlete2.seat_wins||0}/${athlete2.seat_total||0} | Improvement: ${athlete2.improvement||"N/A"}s

Write one paragraph comparing erg performance, training consistency, and development trajectory. Then on a new line write "RECOMMENDATION:" followed by a boat recommendation with brief rationale.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{ role: "user", content: prompt }] }),
    });

    const data = await response.json();
    const usage = data?.usage ?? {};
    const text = data.content?.[0]?.text || "";
    const parts = text.split("RECOMMENDATION:");
    const summary = parts[0].trim();
    const recommendation = parts[1]?.trim() || "";

    const result = { summary, recommendation };
    await setCached(supabase, cacheKey, result, TTL.SIX_HOURS, MODEL, usage.input_tokens, usage.output_tokens);
    await logUsage(supabase, { function_name: "compare-athletes", model: MODEL, input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, cache_hit: false });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
