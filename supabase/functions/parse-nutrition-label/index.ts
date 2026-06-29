import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, TTL, hashKey } from "../_shared/cache.ts";
import { preflight, recordApiError, recordApiSuccess, jsonError } from "../_shared/aiGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-4-6";
const FN = "parse-nutrition-label";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, mimeType } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ⭐ USE ANTHROPIC KEY
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("Parsing nutrition label");

    // Failsafe 2: cache before the API call (image input is deterministic).
    const cacheKey = `${FN}_${hashKey({ image: imageBase64 })}`;
    const cached = await getCached(supabase, cacheKey);
    if (cached) {
      await logUsage(supabase, { user_id: null, function_name: FN, model: MODEL, input_tokens: 0, output_tokens: 0, cache_hit: true });
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    // Failsafe 9: circuit breaker (after cache check).
    const blocked = await preflight(supabase, { userId: null, functionName: FN, corsHeaders });
    if (blocked) return blocked;

    // Anthropic image block format
    const imageBlock = {
      type: "image",
      source: {
        type: "base64",
        media_type: mimeType || "image/jpeg",
        data: imageBase64,
      },
    };

    const systemPrompt = `
You are a nutrition label parser. Extract nutritional information from food packaging photos or nutrition labels.

Return ONLY valid JSON in this exact format:
{
  "name": "Product name if visible, otherwise describe the food",
  "serving_size": "serving size if visible",
  "calories": number,
  "protein": number,
  "carbs": number,
  "fats": number
}

Rules:
- If a value is missing or unreadable, return 0.
- Extract per‑serving values when available.
- Never include commentary — ONLY return JSON.
`;

    const userPrompt = `
Extract the nutritional information from this food/nutrition label image.
Return ONLY the JSON.
`;

    // ⭐ CALL ANTHROPIC
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [imageBlock, { type: "text", text: userPrompt }],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic error:", response.status, errorText);
      await recordApiError(supabase, FN);
      return jsonError(corsHeaders, 503, "AI service unavailable");
    }
    await recordApiSuccess(supabase, FN);

    const data = await response.json();
    const text = data.content?.[0]?.text;
    const usage = data?.usage ?? {};

    if (!text) {
      throw new Error("No response from AI");
    }

    const nutrition = JSON.parse(text);

    await setCached(supabase, cacheKey, nutrition, TTL.DAY, MODEL, usage.input_tokens, usage.output_tokens);
    await logUsage(supabase, { user_id: null, function_name: FN, model: MODEL, input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, cache_hit: false });

    return new Response(JSON.stringify(nutrition), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (error) {
    console.error("Error parsing nutrition label:", error);
    const errorMessage =
      error instanceof Error ? error.message : "An error occurred";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

