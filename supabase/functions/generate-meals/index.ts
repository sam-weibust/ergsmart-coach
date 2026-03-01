import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const { weight, height, age, goals, trainingLoad, dietGoal, allergies, foodPreferences, favoriteMeals, recentMealDescriptions } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Build allergy/restriction guidance
    let allergyGuidance = "";
    if (allergies && allergies.length > 0) {
      allergyGuidance = `CRITICAL DIETARY RESTRICTIONS: The user has these allergies/restrictions: ${allergies.join(", ")}. 
You MUST NOT include ANY foods containing these allergens. Use safe substitutes instead. For example:
- Dairy allergy → use oat milk, coconut yogurt, dairy-free cheese, nutritional yeast
- Gluten allergy → use rice, quinoa, gluten-free oats, corn tortillas
- Nut allergy → use seeds (sunflower, pumpkin), seed butters
Always clearly state the substitute used.`;
    }

    // Food preferences
    let preferenceGuidance = "";
    if (foodPreferences && foodPreferences.length > 0) {
      preferenceGuidance = `FOOD PREFERENCES: The user enjoys these foods/cuisines: ${foodPreferences.join(", ")}. Incorporate these preferences into the meal plan where possible while maintaining nutritional balance.`;
    }

    // Favorite meals context for similar suggestions
    let favoriteGuidance = "";
    if (favoriteMeals && favoriteMeals.length > 0) {
      favoriteGuidance = `FAVORITE MEALS: The user has favorited these meals: ${favoriteMeals.join("; ")}. Create meals that are similar in style, flavor profile, or ingredients to these favorites while offering variety.`;
    }

    // Variety: avoid recent meals
    let varietyGuidance = "";
    if (recentMealDescriptions && recentMealDescriptions.length > 0) {
      varietyGuidance = `VARIETY REQUIREMENT: The user has recently had these meals: ${recentMealDescriptions.slice(0, 15).join("; ")}. 
DO NOT repeat any of these meals. Create completely different meals with different proteins, cuisines, and cooking methods to ensure day-to-day variety.`;
    }

    // Calorie calculation based on weight, height, age using Mifflin-St Jeor
    let calorieTarget = 2500;
    if (weight) {
      const w = Number(weight); // kg
      const h = height ? Number(height) : 175; // cm, default
      const a = age ? Number(age) : 25; // default
      // Mifflin-St Jeor (male approx, adjusted for athletic activity)
      const bmr = 10 * w + 6.25 * h - 5 * a + 5;
      const tdee = Math.round(bmr * 1.7); // active multiplier for athletes
      if (dietGoal === "cut") calorieTarget = tdee - 400;
      else if (dietGoal === "bulk") calorieTarget = tdee + 400;
      else calorieTarget = tdee;
    }

    let calorieGuidance = `Target daily calories: approximately ${calorieTarget} kcal.`;
    if (dietGoal === "cut") {
      calorieGuidance += " This is a cutting phase — keep protein high to preserve muscle, focus on lean proteins and vegetables.";
    } else if (dietGoal === "bulk") {
      calorieGuidance += " This is a bulking phase — emphasize protein and carbs for muscle growth and training fuel.";
    } else {
      calorieGuidance += " Maintain calorie balance while optimizing macros for athletic performance.";
    }

    const systemPrompt = `You are a sports nutrition expert specializing in endurance athletes and rowers.

Generate a full day meal plan in JSON format:
{
  "meals": [
    {
      "meal_type": "Breakfast/Lunch/Dinner/Snack",
      "description": "Detailed meal description with portions",
      "calories": estimated_calories,
      "protein": grams,
      "carbs": grams,
      "fats": grams,
      "timing": "Best time to eat relative to training",
      "recipe": {
        "ingredients": ["ingredient 1 with amount", "ingredient 2 with amount"],
        "instructions": ["Step 1", "Step 2", "Step 3"],
        "prep_time": "10 min",
        "cook_time": "15 min"
      }
    }
  ],
  "dailyTotals": {
    "calories": total,
    "protein": total,
    "carbs": total,
    "fats": total
  },
  "hydrationNote": "Daily hydration guidance"
}

IMPORTANT RULES:
- Every meal MUST include a "recipe" object with ingredients (with amounts), step-by-step instructions, prep_time, and cook_time.
- Macros must be accurate and sum correctly to daily totals.
- Each meal plan must be UNIQUE — different proteins, cuisines, and cooking methods from day to day.
- Respect ALL dietary restrictions absolutely — never include allergens, always substitute.`;

    const userPrompt = `Create a full day meal plan for:
- Weight: ${weight}kg
- Height: ${height ? height + "cm" : "not specified"}
- Age: ${age || "not specified"}
- Goals: ${goals}
- Training Load: ${trainingLoad}
- Diet Goal: ${dietGoal || "maintain"}

${calorieGuidance}
${allergyGuidance}
${preferenceGuidance}
${favoriteGuidance}
${varietyGuidance}

Include breakfast, lunch, dinner, and 2 snacks. Focus on recovery, performance, and practical meals. Include detailed recipes with ingredients and instructions for EVERY meal.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage quota exceeded. Please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const mealPlan = JSON.parse(data.choices[0].message.content);

    return new Response(
      JSON.stringify({ mealPlan, calorieTarget }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in generate-meals:", error);
    const errorMessage = error instanceof Error ? error.message : "An error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
