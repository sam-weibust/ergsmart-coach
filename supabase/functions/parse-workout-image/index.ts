import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, tokensFrom, TTL, hashKey } from "../_shared/cache.ts";
import { preflight, recordApiError, recordApiSuccess, recordUsage, jsonError } from "../_shared/aiGuard.ts";
import { extractJsonArray } from "../_shared/extractJson.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-5";
const FN = "parse-workout-image";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

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

    // Extract media type and raw base64 from data URL
    // image_base64 may be "data:image/jpeg;base64,/9j/..." or raw base64
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

    const systemPrompt = `CrewSync AI — read rowing / athletic training plan images.

Extract the workout schedule and return a JSON array of weeks in EXACTLY this format:
[
  {
    "week": 1,
    "phase": "Base",
    "days": [
      {
        "day": "Monday",
        "ergWorkout": {
          "zone": "UT2",
          "description": "20 min steady state",
          "duration": "20 min",
          "warmup": "5 min easy",
          "cooldown": "5 min easy",
          "notes": ""
        }
      },
      {
        "day": "Tuesday",
        "strengthWorkout": {
          "focus": "Upper Body",
          "exercises": [
            { "name": "Pull-ups", "sets": 3, "reps": 8 }
          ],
          "notes": ""
        }
      },
      {
        "day": "Wednesday",
        "yogaSession": {
          "duration": "30 min",
          "focus": "Hip flexibility"
        }
      }
    ]
  }
]

Rules:
- zone must be one of: UT2, UT1, TR, AT (or omit if not applicable)
- Use ergWorkout for rowing/cardio sessions
- Use strengthWorkout for lifting/cross-training
- Use yogaSession for rest/recovery days
- If a day has only a text description, use: { "day": "Monday", "workout": "the description text" }
- Return ONLY the JSON array with no explanation, no markdown code fences`;

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
          // thinking + text together, so the full budget must go to the plan.
          thinking: { type: "disabled" },
          // Keep 4096. Output is a whole multi-week plan lifted off the image:
          // an uploaded 8-12 week chart is 56-84 day objects at ~50 tokens each
          // (~3-4k). 500 would cut it off inside week 1 and the regex parse
          // would find no closing bracket, yielding an empty plan.
          max_tokens: 4096,
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
                  text: "Extract the workout plan from this image and return it as a JSON array only.",
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
    const textContent: string = result.content?.[0]?.text ?? "";
    const usage = result?.usage ?? {};

    // Balanced-bracket scan, not /\[[\s\S]*\]/ — the greedy span runs to the
    // LAST "]" in the response, so any trailing prose containing a bracket
    // makes the slice unparseable and silently yields an empty plan.
    let plan: any[] = [];
    try {
      plan = extractJsonArray(textContent);
    } catch (e) {
      console.error("[parse-workout-image] JSON extraction failed:", e, "raw:", textContent.slice(0, 1000));
    }

    const response = { plan };
    const tokens = tokensFrom(usage);
    await setCached(supabase, cacheKey, response, TTL.DAY, MODEL, tokens.input_tokens, tokens.output_tokens);
    await logUsage(supabase, { user_id, function_name: FN, model: MODEL, ...tokens, cache_hit: false });
    await recordUsage(supabase, user_id, tokens.input_tokens + tokens.output_tokens);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (e) {
    console.error("parse-workout-image error:", e);
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
