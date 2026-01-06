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
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
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
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const { weight, goals, trainingLoad, dietGoal } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Determine calorie adjustment based on diet goal
    let calorieGuidance = "";
    if (dietGoal === "cut") {
      calorieGuidance = "Create a moderate calorie deficit (300-500 cal below maintenance) while keeping protein high to preserve muscle. Focus on lean proteins and vegetables.";
    } else if (dietGoal === "bulk") {
      calorieGuidance = "Create a moderate calorie surplus (300-500 cal above maintenance) with emphasis on protein and carbs for muscle growth and training fuel.";
    } else {
      calorieGuidance = "Maintain calorie balance for current weight while optimizing macros for athletic performance.";
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
      "timing": "Best time to eat relative to training"
    }
  ],
  "dailyTotals": {
    "calories": total,
    "protein": total,
    "carbs": total,
    "fats": total
  },
  "hydrationNote": "Daily hydration guidance"
}`;

    const userPrompt = `Create a full day meal plan for:
- Weight: ${weight}kg
- Goals: ${goals}
- Training Load: ${trainingLoad}
- Diet Goal: ${dietGoal || "maintain"}

${calorieGuidance}

Include breakfast, lunch, dinner, and 2 snacks. Focus on recovery, performance, and practical meals.`;

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
      JSON.stringify({ mealPlan }),
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
