import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, TTL } from "../_shared/cache.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "claude-haiku-4-5-20251001";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const { user_id, local_date, insight_type = "daily" } = body;
    if (!user_id) return new Response(JSON.stringify({ error: "Missing user_id" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

    const today = local_date || new Date().toISOString().split("T")[0];

    // Cache check
    const cacheKey = `insights_${user_id}_${today}`;
    const cached = await getCached(supabase, cacheKey);
    if (cached) {
      await logUsage(supabase, { user_id, function_name: "generate-insights", model: MODEL, input_tokens: 0, output_tokens: 0, cache_hit: true });
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" }
      });
    }

    const todayMs = new Date(today + "T00:00:00Z").getTime();
    const thirtyDaysAgo = new Date(todayMs - 30 * 86400000).toISOString().split("T")[0];
    const sevenDaysAgo = new Date(todayMs - 7 * 86400000).toISOString().split("T")[0];

    const [profileRes, weightRes, waterRes, sleepRes, mealsRes, workoutsRes] = await Promise.all([
      supabase.from("profiles").select("full_name,weight,height,age,diet_goal,hydration_goal_ml,weight_unit").eq("id", user_id).maybeSingle(),
      supabase.from("weight_entries").select("date,weight,unit").eq("user_id", user_id).gte("date", thirtyDaysAgo).order("date", { ascending: false }),
      supabase.from("water_entries").select("date,amount_ml").eq("user_id", user_id).gte("date", sevenDaysAgo).order("date", { ascending: false }),
      supabase.from("sleep_entries").select("date,duration_hours,quality_score").eq("user_id", user_id).gte("date", sevenDaysAgo).order("date", { ascending: false }),
      supabase.from("meal_plans").select("meal_date,calories,protein,carbs,fats").eq("user_id", user_id).gte("meal_date", sevenDaysAgo).order("meal_date", { ascending: false }),
      supabase.from("erg_workouts").select("workout_date,distance,avg_split,avg_watts").eq("user_id", user_id).gte("workout_date", sevenDaysAgo).order("workout_date", { ascending: false }),
    ]);

    const profile = profileRes.data;
    const weightEntries = weightRes.data || [];
    const waterEntries = waterRes.data || [];
    const sleepEntries = sleepRes.data || [];
    const meals = mealsRes.data || [];
    const workouts = workoutsRes.data || [];

    const mealsByDate: Record<string, number> = {};
    for (const m of meals) mealsByDate[m.meal_date] = (mealsByDate[m.meal_date] || 0) + (m.calories || 0);

    const waterByDate: Record<string, number> = {};
    for (const w of waterEntries) waterByDate[w.date] = (waterByDate[w.date] || 0) + (w.amount_ml || 0);

    const weightTrend = weightEntries.slice(0, 14).map(e => `${e.date}: ${e.weight}${e.unit}`).join(", ");
    const weightChange = weightEntries.length >= 2
      ? (weightEntries[0].weight - weightEntries[weightEntries.length - 1].weight).toFixed(1)
      : null;

    const avgSleep = sleepEntries.length > 0
      ? (sleepEntries.reduce((s, e) => s + e.duration_hours, 0) / sleepEntries.length).toFixed(1)
      : null;

    const hydrationGoal = profile?.hydration_goal_ml || 2500;
    const waterValues = Object.values(waterByDate);
    const avgWater = waterValues.length > 0 ? Math.round(waterValues.reduce((a, b) => a + b, 0) / waterValues.length) : null;
    const calorieValues = Object.values(mealsByDate);
    const avgCalories = calorieValues.length > 0 ? Math.round(calorieValues.reduce((a, b) => a + b, 0) / calorieValues.length) : null;

    const context = [
      `Athlete: ${profile?.full_name || "Athlete"} | Goal: ${profile?.diet_goal || "maintain"} | Hydration goal: ${hydrationGoal}ml`,
      weightTrend ? `Weight (14d): ${weightTrend}` : null,
      weightChange != null ? `Change: ${Number(weightChange) > 0 ? "+" : ""}${weightChange}${weightEntries[0]?.unit || "lbs"}` : null,
      avgSleep ? `Avg sleep 7d: ${avgSleep}hrs` : null,
      avgWater ? `Avg hydration: ${avgWater}ml` : null,
      avgCalories ? `Avg calories: ${avgCalories}kcal` : null,
      workouts.length ? `Workouts 7d: ${workouts.map(w => `${w.workout_date} ${w.distance}m ${w.avg_split || ""}`).join("; ")}` : null,
    ].filter(Boolean).join("\n");

    const systemPrompt = `Expert rowing coach. Generate a 4-6 sentence data-driven insight summary. Direct and specific, like a coach. Reference exact numbers. Flag sleep debt, hydration gaps, calorie misalignment. Plain text only, no markdown.`;

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: "user", content: `Athlete data:\n${context}\n\nGenerate insight summary.` }],
      }),
    });

    if (!anthropicResponse.ok) {
      const t = await anthropicResponse.text();
      console.error("Anthropic error:", t);
      return new Response(JSON.stringify({ error: "AI service unavailable" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const aiResult = await anthropicResponse.json();
    const insight = aiResult?.content?.[0]?.text ?? "";
    const usage = aiResult?.usage ?? {};

    const result = { insight, last_updated: new Date().toISOString() };
    await setCached(supabase, cacheKey, result, TTL.HALF_DAY, MODEL, usage.input_tokens, usage.output_tokens);
    await logUsage(supabase, { user_id, function_name: "generate-insights", model: MODEL, input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, cache_hit: false });

    // Also store in ai_insights table
    await supabase.from("ai_insights").upsert({
      user_id, insight_type, date: today, content: insight, last_updated: new Date().toISOString(),
    }, { onConflict: "user_id,insight_type,date" });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (e) {
    console.error("generate-insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
