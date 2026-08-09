import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, tokensFrom, TTL, hashKey } from "../_shared/cache.ts";
import { preflight, recordApiError, recordApiSuccess, jsonError } from "../_shared/aiGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-5";
const FN = "scan-barcode";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, mimeType = "image/jpeg" } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

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

    // Step 1: Ask Claude to extract barcode number or nutrition data from the image
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        // Disable adaptive thinking (Sonnet 5 default) — max_tokens caps
        // thinking + text together, so with it on the whole budget goes to
        // thinking and text is empty.
        thinking: { type: "disabled" },
        // One small single-object result in every branch (~60 output tokens).
        max_tokens: 500,
        system: `Food barcode and nutrition label scanner. Return ONLY JSON, no commentary.

Prefer a barcode (UPC/EAN/QR) if one is visible; else read the Nutrition Facts panel; else identify the product by name/brand on the packaging.

Barcode found:
{"type":"barcode","barcode":"012345678901"}

Nutrition label found (no barcode, or barcode unreadable):
{"type":"nutrition","name":"Product name","serving_size":"1 cup (240g)","calories":150,"protein":5,"carbs":25,"fat":3}

Nothing useful found:
{"type":"error","message":"Could not extract barcode or nutrition data from image"}`,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType, data: imageBase64 },
            },
            { type: "text", text: "Extract the barcode number or nutrition information from this image." },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic error:", response.status, err);
      await recordApiError(supabase, FN);
      return jsonError(corsHeaders, 503, "AI service unavailable");
    }
    await recordApiSuccess(supabase, FN);

    const claudeData = await response.json();
    const tokens = tokensFrom(claudeData?.usage);
    await logUsage(supabase, { user_id: null, function_name: FN, model: MODEL, ...tokens, cache_hit: false });
    const text = claudeData.content?.[0]?.text?.trim();
    if (!text) throw new Error("No response from Claude");

    // Strip markdown code fences if present
    const jsonStr = text.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
    const result = JSON.parse(jsonStr);

    // Step 2: If barcode found, look it up on Open Food Facts
    if (result.type === "barcode" && result.barcode) {
      const barcode = result.barcode.replace(/\D/g, "");
      const offUrl = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`;
      const offRes = await fetch(offUrl);
      const offData = await offRes.json();

      if (offData.status === 1 && offData.product) {
        const p = offData.product;
        const n = p.nutriments ?? {};
        const food = {
          type: "food",
          name: p.product_name || `Product ${barcode}`,
          brand: p.brands || null,
          serving_size: p.serving_quantity || 100,
          serving_unit: "g",
          calories: Math.round(n["energy-kcal_serving"] ?? n["energy-kcal_100g"] ?? 0),
          protein: Math.round((n.proteins_serving ?? n.proteins_100g ?? 0) * 10) / 10,
          carbs: Math.round((n.carbohydrates_serving ?? n.carbohydrates_100g ?? 0) * 10) / 10,
          fat: Math.round((n.fat_serving ?? n.fat_100g ?? 0) * 10) / 10,
          barcode,
        };
        await setCached(supabase, cacheKey, food, TTL.DAY, MODEL, tokens.input_tokens, tokens.output_tokens);
        return new Response(JSON.stringify(food), { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" } });
      }

      // Barcode not in Open Food Facts — return what we have
      return new Response(JSON.stringify({
        type: "error",
        message: `Barcode ${barcode} not found in food database. Try searching by name.`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Step 3: Nutrition label was extracted directly
    if (result.type === "nutrition") {
      const food = {
        type: "food",
        name: result.name || "Scanned Food",
        brand: null,
        serving_size: result.serving_size || "1 serving",
        serving_unit: "serving",
        calories: result.calories || 0,
        protein: result.protein || 0,
        carbs: result.carbs || 0,
        fat: result.fat || 0,
        barcode: null,
      };
      await setCached(supabase, cacheKey, food, TTL.DAY, MODEL, tokens.input_tokens, tokens.output_tokens);
      return new Response(JSON.stringify(food), { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" } });
    }

    // Error case
    return new Response(JSON.stringify({ type: "error", message: result.message || "Could not scan image" }), {
      status: 422,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("scan-barcode error:", err);
    return new Response(JSON.stringify({
      type: "error",
      message: err instanceof Error ? err.message : "Scan failed",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
