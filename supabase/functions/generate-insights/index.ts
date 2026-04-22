import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Use client-supplied local date to avoid UTC day-boundary issues
    const today = local_date || new Date().toISOString().split("T")[0];
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

    // Aggregate meals by date
    const mealsByDate: Record<string, number> = {};
    for (const m of meals) {
      mealsByDate[m.meal_date] = (mealsByDate[m.meal_date] || 0) + (m.calories || 0);
    }

    // Aggregate water by date
    const waterByDate: Record<string, number> = {};
    for (const w of waterEntries) {
      waterByDate[w.date] = (waterByDate[w.date] || 0) + (w.amount_ml || 0);
    }

    // Weight trend
    const weightTrend = weightEntries.slice(0, 14).map(e => `${e.date}: ${e.weight}${e.unit}`).join(", ");
    const weightChange = weightEntries.length >= 2
      ? (weightEntries[0].weight - weightEntries[weightEntries.length - 1].weight).toFixed(1)
      : null;

    // Sleep stats
    const avgSleep = sleepEntries.length > 0
      ? (sleepEntries.reduce((s, e) => s + e.duration_hours, 0) / sleepEntries.length).toFixed(1)
      : null;
    const avgSleepQuality = sleepEntries.filter(e => e.quality_score).length > 0
      ? (sleepEntries.filter(e => e.quality_score).reduce((s, e) => s + (e.quality_score || 0), 0) / sleepEntries.filter(e => e.quality_score).length).toFixed(1)
      : null;

    // Hydration stats
    const hydrationGoal = profile?.hydration_goal_ml || 2500;
    const waterValues = Object.values(waterByDate);
    const avgWater = waterValues.length > 0 ? Math.round(waterValues.reduce((a, b) => a + b, 0) / waterValues.length) : null;
    const hydrationGoalDays = waterValues.filter(v => v >= hydrationGoal).length;

    // Calorie stats
    const calorieValues = Object.values(mealsByDate);
    const avgCalories = calorieValues.length > 0 ? Math.round(calorieValues.reduce((a, b) => a + b, 0) / calorieValues.length) : null;

    const context = `
ATHLETE: ${profile?.full_name || "Athlete"}
DIET GOAL: ${profile?.diet_goal || "maintain"}
HYDRATION GOAL: ${hydrationGoal}ml/day

LAST 14 DAYS WEIGHT: ${weightTrend || "No data"}
WEIGHT CHANGE (${weightEntries.length} entries): ${weightChange ? `${weightChange > "0" ? "+" : ""}${weightChange} ${weightEntries[0]?.unit || "lbs"}` : "Insufficient data"}

LAST 7 DAYS SLEEP:
${sleepEntries.map(s => `  ${s.date}: ${s.duration_hours}hrs${s.quality_score ? `, quality ${s.quality_score}/10` : ""}`).join("\n") || "  No data"}
Average: ${avgSleep ? `${avgSleep} hrs` : "N/A"}, Average quality: ${avgSleepQuality ? `${avgSleepQuality}/10` : "N/A"}

LAST 7 DAYS HYDRATION:
${Object.entries(waterByDate).map(([d, ml]) => `  ${d}: ${ml}ml (goal: ${hydrationGoal}ml)`).join("\n") || "  No data"}
Average: ${avgWater ? `${avgWater}ml` : "N/A"}, Goal met: ${hydrationGoalDays}/${waterValues.length} days

LAST 7 DAYS CALORIES:
${Object.entries(mealsByDate).map(([d, cal]) => `  ${d}: ${cal} kcal`).join("\n") || "  No data"}
Average: ${avgCalories ? `${avgCalories} kcal` : "N/A"}

LAST 7 DAYS WORKOUTS:
${workouts.map(w => `  ${w.workout_date}: ${w.distance}m, avg split ${w.avg_split || "N/A"}${w.avg_watts ? `, ${w.avg_watts}W` : ""}`).join("\n") || "  No data"}
`.trim();

    const systemPrompt = `You are a high-performance rowing coach and sports scientist. Generate a concise, data-driven, actionable insight summary. Be direct and specific — like a coach, not a chatbot. Use exact numbers from the data. Identify real patterns (sleep/performance correlation, hydration/output, calories/weight trend). Flag sleep debt, hydration gaps, and calorie misalignment relative to the athlete's goal. Keep it to 4-6 sentences max. No fluff, no generic advice. Output plain text only, no markdown.`;

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: "user", content: `Here is the athlete's data:\n\n${context}\n\nGenerate the insight summary.` }],
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

    // Cache in database — one row per user per insight_type per date
    await supabase.from("ai_insights").upsert({
      user_id,
      insight_type,
      date: today,
      content: insight,
      last_updated: new Date().toISOString(),
    }, { onConflict: "user_id,insight_type,date" });

    return new Response(JSON.stringify({ insight, last_updated: new Date().toISOString() }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
