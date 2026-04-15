import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    // Frontend must send: { user_id, dietary_preferences, goals }
    const body = await req.json();
    const {
      user_id,
      dietary_preferences,
      goals_override,
      dietGoal,
      allergies,
      foodPreferences,
      favoriteMeals,
      trainingLoad,
    } = body;

    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user profile + goals
    const [profileRes, goalsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user_id).maybeSingle(),
      supabase
        .from("user_goals")
        .select("*")
        .eq("user_id", user_id)
        .maybeSingle(),
    ]);

    const profile = profileRes.data;
    const goals = goals_override || goalsRes.data;

    const userContext = `
USER PROFILE:
- Name: ${profile?.full_name || "Unknown"}
- Age: ${profile?.age || "Unknown"}
- Weight: ${profile?.weight || "Unknown"}kg
- Height: ${profile?.height || "Unknown"}cm
- Experience: ${profile?.experience_level || "Unknown"}

USER GOALS:
- Current 2K: ${goals?.current_2k_time || "Not set"} → Goal: ${goals?.goal_2k_time || "Not set"}
- Current 5K: ${goals?.current_5k_time || "Not set"} → Goal: ${goals?.goal_5k_time || "Not set"}
- Current 6K: ${goals?.current_6k_time || "Not set"} → Goal: ${goals?.goal_6k_time || "Not set"}

NUTRITION PREFERENCES:
- Diet goal: ${dietGoal || "maintain"}
- Training load: ${trainingLoad || "moderate"}
- Allergies: ${allergies?.join(", ") || "None"}
- Food preferences: ${foodPreferences?.join(", ") || dietary_preferences?.join(", ") || "None"}
- Favourite meals: ${favoriteMeals?.join(", ") || "Not specified"}
`.trim();

    const systemPrompt = `You are CrewSync AI, an expert sports nutrition assistant for rowers.

User context:
${userContext}

Output ONLY a valid JSON object — no markdown, no commentary:
{
  "mealPlan": {
    "meals": [
      {
        "meal_type": "Breakfast",
        "timing": "7:00 AM",
        "description": "Meal description",
        "calories": 600,
        "protein": 35,
        "carbs": 70,
        "fats": 18,
        "recipe": {
          "ingredients": ["item 1", "item 2"],
          "instructions": ["step 1", "step 2"],
          "prep_time": "10 min",
          "cook_time": "15 min"
        }
      }
    ],
    "dailyTotals": {
      "calories": 2500,
      "protein": 160,
      "carbs": 300,
      "fats": 80
    },
    "hydrationNote": "Drink 3-4L of water throughout the day"
  }
}

Rules:
- Include Breakfast, Morning Snack, Lunch, Pre-Workout, Dinner, and Evening Snack
- All macro values are numbers (grams)
- Calories is a number
- Respect allergies and food preferences exactly
- No text outside the JSON`.trim();

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
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          stream: false,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: "Generate today's meal plan.",
            },
          ],
        }),
      }
    );

    if (!anthropicResponse.ok) {
      const t = await anthropicResponse.text();
      console.error("Anthropic error:", anthropicResponse.status, t);
      return new Response(JSON.stringify({ error: "AI service unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await anthropicResponse.json();
    const rawText = aiResult?.content?.[0]?.text ?? "";
    const start = rawText.indexOf("{");
    const end = rawText.lastIndexOf("}");
    let parsed: any = { mealPlan: { meals: [], dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0 }, hydrationNote: "" } };
    if (start !== -1 && end > start) {
      try { parsed = JSON.parse(rawText.slice(start, end + 1)); } catch { /* fallback */ }
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-meals error:", e);
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
