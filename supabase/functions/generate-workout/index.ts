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
    const { experience, goals, lastWorkouts, weight, height } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const systemPrompt = `You are an expert rowing coach with decades of experience training athletes at all levels. 
You specialize in creating personalized, science-based training plans that optimize performance while preventing injury.
Your plans consider the athlete's experience level, goals, previous workouts, and physical characteristics.

Generate a detailed rowing workout plan in JSON format with the following structure:
{
  "title": "Week Training Plan",
  "description": "Brief overview of the plan",
  "workouts": [
    {
      "day": "Monday",
      "type": "Endurance/Intervals/Strength",
      "duration": "45-60 min",
      "intensity": "Low/Medium/High",
      "details": "Detailed workout description with stroke rate, split times, rest intervals",
      "focus": "What this workout targets"
    }
  ],
  "tips": ["Training tip 1", "Training tip 2"],
  "nutritionAdvice": "Brief nutrition guidance for this plan",
  "recoveryNotes": "Recovery and injury prevention advice"
}`;

    const userPrompt = `Create a personalized rowing training plan for:
- Experience Level: ${experience}
- Goals: ${goals}
- Recent Workouts: ${lastWorkouts || "No recent workout data"}
- Weight: ${weight}kg, Height: ${height}cm

Focus on progressive overload, variety, and proper recovery. Include specific metrics like stroke rate, split times, and distance.`;

    console.log("Calling Lovable AI for workout generation...");
    
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
    const workoutPlan = JSON.parse(data.choices[0].message.content);
    
    console.log("Workout plan generated successfully");

    // Save to database if user is authenticated
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: authHeader } }
      });

      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        await supabase.from("workout_plans").insert({
          user_id: user.id,
          title: workoutPlan.title,
          description: workoutPlan.description,
          workout_data: workoutPlan
        });
        console.log("Workout plan saved to database");
      }
    }

    return new Response(
      JSON.stringify({ workoutPlan }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in generate-workout:", error);
    const errorMessage = error instanceof Error ? error.message : "An error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});