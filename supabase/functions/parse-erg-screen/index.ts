import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, tokensFrom, TTL, hashKey } from "../_shared/cache.ts";
import { preflight, recordApiError, recordApiSuccess, recordUsage, jsonError } from "../_shared/aiGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-5";
const FN = "parse-erg-screen";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    // Use service role key (fixes all RLS/401 issues)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Frontend must send: { user_id, image_base64 }
    const { user_id, image_base64 } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!image_base64) {
      return new Response(JSON.stringify({ error: "Missing image_base64" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // image_base64 may be a data URL ("data:image/png;base64,...") or raw base64
    let mediaType = "image/jpeg";
    let base64Data = image_base64;
    const dataUrlMatch = image_base64.match(/^data:([^;]+);base64,(.+)$/s);
    if (dataUrlMatch) {
      mediaType = dataUrlMatch[1];
      base64Data = dataUrlMatch[2];
    }

    // Failsafe 2: cache before the API call (image input is deterministic).
    const cacheKey = `${FN}_${hashKey({ image: image_base64 })}`;
    const cached = await getCached(supabase, cacheKey);
    if (cached) {
      await logUsage(supabase, { user_id, function_name: FN, model: MODEL, input_tokens: 0, output_tokens: 0, cache_hit: true });
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    // Failsafe 9 + 1: circuit breaker + per-user daily limits (after cache check).
    const blocked = await preflight(supabase, { userId: user_id, functionName: FN, corsHeaders });
    if (blocked) return blocked;

    const systemPrompt = `CrewSync AI — read Concept2 PM5 ergometer screens.

- Extract distance, time, split, stroke rate, pace and every interval row.
- Return clean JSON only.
- Do NOT hallucinate values. If the image is unclear, say so.
- Use rowing terminology.`;

    // Anthropic Vision request
    const anthropicResponse = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          // Disable adaptive thinking (Sonnet 5 default) — max_tokens caps
          // thinking + text together, so with it on the budget is spent
          // thinking and the parse returns nothing.
          thinking: { type: "disabled" },
          // Not 500: a PM5 interval/memory screen has an unbounded split table
          // and each row costs ~30 output tokens, so 500 only covers ~8 rows.
          // 1024 covers a full 30-split screen with headroom.
          max_tokens: 1024,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: mediaType,
                    data: base64Data,
                  },
                },
                {
                  type: "text",
                  text: "Extract all workout data from this PM5 screen and return JSON only.",
                },
              ],
            },
          ],
        }),
      }
    );

    if (!anthropicResponse.ok) {
      const t = await anthropicResponse.text();
      console.error("Anthropic error:", anthropicResponse.status, t);
      await recordApiError(supabase, FN);
      return jsonError(corsHeaders, 503, "AI service unavailable");
    }
    await recordApiSuccess(supabase, FN);

    const result = await anthropicResponse.json();
    const usage = result?.usage ?? {};

    // Optionally store parsed data in DB
    await supabase.from("erg_workouts").insert({
      user_id,
      raw_image: image_base64,
      parsed_data: result,
      created_at: new Date().toISOString(),
    });

    const tokens = tokensFrom(usage);
    await setCached(supabase, cacheKey, result, TTL.DAY, MODEL, tokens.input_tokens, tokens.output_tokens);
    await logUsage(supabase, { user_id, function_name: FN, model: MODEL, ...tokens, cache_hit: false });
    await recordUsage(supabase, user_id, tokens.input_tokens + tokens.output_tokens);

    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-Cache": "MISS",
      },
    });
  } catch (e) {
    console.error("parse-erg-screen error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
