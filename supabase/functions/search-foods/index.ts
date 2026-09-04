import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CACHE_TTL_DAYS = 7;

function getNutrient(nutrients: any[], id: number, ...names: string[]): number {
  const n = nutrients?.find((n: any) =>
    n.nutrientId === id ||
    names.some(name => n.nutrientName?.toLowerCase().includes(name.toLowerCase()))
  );
  return typeof n?.value === "number" ? n.value : 0;
}

function parseFood(food: any) {
  const nutrients = food.foodNutrients ?? [];
  const cals = getNutrient(nutrients, 1008, "Energy", "Calories");
  const protein = getNutrient(nutrients, 1003, "Protein");
  const carbs = getNutrient(nutrients, 1005, "Carbohydrate");
  const fat = getNutrient(nutrients, 1004, "Total lipid");
  const fiber = getNutrient(nutrients, 1079, "Fiber");
  const sugar = getNutrient(nutrients, 2000, "Sugars");

  const servingSize = food.servingSize ?? 100;
  const servingUnit = food.servingSizeUnit ?? "g";
  const f = servingSize / 100;

  return {
    fdcId: String(food.fdcId),
    name: food.description ?? "Unknown food",
    brand: food.brandName || food.brandOwner || null,
    calories_per_100g: Math.round(cals),
    calories_per_serving: Math.round(cals * f),
    serving_size: servingSize,
    serving_unit: servingUnit,
    protein: Math.round(protein * f * 10) / 10,
    carbs: Math.round(carbs * f * 10) / 10,
    fat: Math.round(fat * f * 10) / 10,
    fiber: Math.round(fiber * f * 10) / 10,
    sugar: Math.round(sugar * f * 10) / 10,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query } = await req.json();
    if (!query?.trim()) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedQuery = query.trim().toLowerCase();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check cache
    const { data: cached } = await supabase
      .from("food_cache")
      .select("results, cached_at")
      .eq("query", normalizedQuery)
      .maybeSingle();

    if (cached) {
      const age = (Date.now() - new Date(cached.cached_at).getTime()) / 86400000;
      if (age < CACHE_TTL_DAYS) {
        return new Response(JSON.stringify({ results: cached.results, source: "cache" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Call USDA FoodData Central API
    const apiKey = Deno.env.get("USDA_API_KEY") || "DEMO_KEY";
    const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
    url.searchParams.set("query", query.trim());
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("pageSize", "25");
    // dataType MUST be sent as repeated params, not one comma-joined value.
    // "Survey (FNDDS)" contains parentheses; inside a comma-joined value they
    // produced a URL that the CDN in front of api.nal.usda.gov rejected with a
    // bare nginx "400 Bad Request" before it ever reached the USDA app — so
    // every food search 500'd. Verified live: comma-joined -> 400; the same
    // four values appended individually -> 200 with all four echoed back in
    // foodSearchCriteria.dataType.
    for (const dt of ["Branded", "SR Legacy", "Survey (FNDDS)", "Foundation"]) {
      url.searchParams.append("dataType", dt);
    }

    // api.data.gov's edge intermittently rejects otherwise-valid requests with
    // a bare nginx 400 (observed live: the same URL returned 200, 400, 200 on
    // three consecutive attempts, and roughly 1 in 8 calls failed). This is
    // upstream flakiness, NOT a bad key — USDA_API_KEY is set, and the same
    // requests succeed on retry. A single blip used to surface to the user as
    // a hard 500 with no results, so retry before giving up.
    const MAX_ATTEMPTS = 3;
    let response: Response | null = null;
    let lastDetail = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      response = await fetch(url.toString());
      if (response.ok) break;
      lastDetail = await response.text().catch(() => "");
      console.warn(
        `[search-foods] USDA attempt ${attempt}/${MAX_ATTEMPTS} failed: ${response.status} ${lastDetail.slice(0, 120)}`,
      );
      response = null;
      if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 300 * attempt));
    }

    if (!response) {
      // Degrade to an empty result set rather than a 500: the food search box
      // should come back empty-handed, not break the page around it.
      console.error(`[search-foods] all ${MAX_ATTEMPTS} USDA attempts failed for "${normalizedQuery}"`);
      return new Response(
        JSON.stringify({ results: [], source: "unavailable", warning: "Food database temporarily unavailable" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();
    const results = (data.foods ?? []).map(parseFood);

    // Upsert cache
    await supabase.from("food_cache").upsert(
      { query: normalizedQuery, results, cached_at: new Date().toISOString() },
      { onConflict: "query" }
    );

    return new Response(JSON.stringify({ results, source: "usda" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[search-foods]", err);
    return new Response(JSON.stringify({ error: String(err), results: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
