import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Step 1: Ask Claude to extract barcode number or nutrition data from the image
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: `You are a food barcode and nutrition label scanner.

Given an image, do one of the following:
1. If you can see a barcode (UPC, EAN, QR, etc.), extract the barcode number.
2. If you can see a nutrition label (Nutrition Facts), extract the nutrition data directly.
3. If you can identify the food product by name/brand from the packaging, provide the product name.

Return ONLY valid JSON in one of these formats:

If barcode found:
{"type":"barcode","barcode":"012345678901"}

If nutrition label found (no barcode or barcode unreadable):
{"type":"nutrition","name":"Product name","serving_size":"1 cup (240g)","calories":150,"protein":5,"carbs":25,"fat":3}

If nothing useful found:
{"type":"error","message":"Could not extract barcode or nutrition data from image"}

Return only JSON, no commentary.`,
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
      throw new Error(`Claude API error: ${response.status} ${err}`);
    }

    const claudeData = await response.json();
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
        return new Response(JSON.stringify({
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
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Barcode not in Open Food Facts — return what we have
      return new Response(JSON.stringify({
        type: "error",
        message: `Barcode ${barcode} not found in food database. Try searching by name.`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Step 3: Nutrition label was extracted directly
    if (result.type === "nutrition") {
      return new Response(JSON.stringify({
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
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
