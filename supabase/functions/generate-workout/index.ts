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
    const { weeks, weight, height, experience, goals } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const systemPrompt = `You are an expert rowing coach and strength & conditioning specialist. 
You create periodized training programs that balance erg workouts and strength training.
Generate a ${weeks}-week training plan with 7 days per week, where each day has exactly 1 erg workout and 1 strength workout.

Return in JSON format:
{
  "plan": [
    {
      "week": 1,
      "days": [
        {
          "day": 1,
          "ergWorkout": {
            "type": "Steady State/Intervals/Sprint/Recovery",
            "duration": "30min",
            "distance": 6000,
            "targetSplit": "2:05/500m",
            "notes": "Focus on technique"
          },
          "strengthWorkout": {
            "exercise": "Deadlift",
            "sets": 4,
            "reps": 6,
            "weight": "80kg",
            "notes": "Focus on posterior chain"
          }
        }
      ]
    }
  ]
}`;

    const userPrompt = `Create a ${weeks}-week rowing training plan for:
- Weight: ${weight}kg, Height: ${height}cm
- Experience: ${experience}
- Goals: ${goals}

Each week should have 7 days. Each day must include:
1. One erg workout (vary between steady state, intervals, sprints, and recovery)
2. One strength exercise (rotate through major movements: deadlift, squat, bench press, rows, overhead press, pull-ups, etc.)

Ensure progressive overload and periodization. Include rest/recovery days with lighter workouts.`;

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
    const plan = JSON.parse(data.choices[0].message.content);

    return new Response(
      JSON.stringify({ plan: plan.plan }),
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
