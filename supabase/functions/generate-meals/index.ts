import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, hashKey, TTL } from "../_shared/cache.ts";
import { preflight, recordApiError, recordApiSuccess, recordUsage, jsonError } from "../_shared/aiGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-5";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const { user_id, dietary_preferences, goals_override, dietGoal, allergies, foodPreferences, favoriteMeals, trainingLoad, calorie_target } = body;

    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = new Date().toISOString().split("T")[0];
    const cacheKey = `meal_plan_${user_id}_${calorie_target || "auto"}_${today}_${hashKey({ dietGoal, allergies })}`;
    const cached = await getCached(supabase, cacheKey);
    if (cached) {
      await logUsage(supabase, { user_id, function_name: "generate-meals", model: MODEL, input_tokens: 0, output_tokens: 0, cache_hit: true });
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    // Failsafe 9 + 1: circuit breaker + per-user daily limits (after cache check).
    const blocked = await preflight(supabase, { userId: user_id, functionName: "generate-meals", corsHeaders });
    if (blocked) return blocked;

    const [profileRes, goalsRes] = await Promise.all([
      supabase.from("profiles").select("full_name,age,weight,height,experience_level").eq("id", user_id).maybeSingle(),
      supabase.from("user_goals").select("current_2k_time,goal_2k_time").eq("user_id", user_id).maybeSingle(),
    ]);

    const profile = profileRes.data;
    const goals = goals_override || goalsRes.data;

    const systemPrompt = `Sports nutrition assistant for rowers. Output ONLY valid JSON:
{"mealPlan":{"meals":[{"meal_type":"Breakfast","timing":"7:00 AM","description":"...","calories":600,"protein":35,"carbs":70,"fats":18,"recipe":{"ingredients":["..."],"instructions":["..."],"prep_time":"10 min","cook_time":"15 min"}}],"dailyTotals":{"calories":2500,"protein":160,"carbs":300,"fats":80},"hydrationNote":"..."}}
Include: Breakfast, Morning Snack, Lunch, Pre-Workout, Dinner, Evening Snack. Respect allergies exactly. No text outside JSON.`;

    const userMsg = `Athlete: ${profile?.full_name||"?"}, ${profile?.age||"?"}yo, ${profile?.weight||"?"}kg, ${profile?.height||"?"}cm. Goal: ${dietGoal||"maintain"}, load: ${trainingLoad||"moderate"}. Allergies: ${allergies?.join(",")||"none"}. Prefs: ${foodPreferences?.join(",")||dietary_preferences?.join(",")||"none"}. Favorites: ${favoriteMeals?.join(",")||"?"}. 2K: ${goals?.current_2k_time||"?"}→${goals?.goal_2k_time||"?"}.${calorie_target ? ` Target calories: ${calorie_target}kcal.` : ""} Generate today's meal plan.`;

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: systemPrompt, messages: [{ role: "user", content: userMsg }] }),
    });

    if (!anthropicResponse.ok) {
      console.error("Anthropic error:", anthropicResponse.status, await anthropicResponse.text());
      await recordApiError(supabase, "generate-meals");
      return jsonError(corsHeaders, 503, "AI service unavailable");
    }
    await recordApiSuccess(supabase, "generate-meals");

    const aiResult = await anthropicResponse.json();
    const usage = aiResult?.usage ?? {};
    const rawText = aiResult?.content?.[0]?.text ?? "";
    const start = rawText.indexOf("{");
    const end = rawText.lastIndexOf("}");
    let parsed: any = { mealPlan: { meals: [], dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0 }, hydrationNote: "" } };
    if (start !== -1 && end > start) {
      try { parsed = JSON.parse(rawText.slice(start, end + 1)); } catch { /* fallback */ }
    }

    await setCached(supabase, cacheKey, parsed, TTL.DAY, MODEL, usage.input_tokens, usage.output_tokens);
    await logUsage(supabase, { user_id, function_name: "generate-meals", model: MODEL, input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, cache_hit: false });
    await recordUsage(supabase, user_id, (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0));

    return new Response(JSON.stringify(parsed), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (e) {
    console.error("generate-meals error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
