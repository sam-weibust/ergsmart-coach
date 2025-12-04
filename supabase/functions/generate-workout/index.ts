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
    const { months, weight, height, experience, goals } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const systemPrompt = `You are an expert rowing coach creating periodized training programs.
Training zones for rowing:
- UT2 (Utilization Training 2): Low intensity, long duration. Split: +20-25 seconds above race pace. Rate: 18-20 spm. Duration: 60-90 min.
- UT1 (Utilization Training 1): Moderate intensity. Split: +15-18 seconds above race pace. Rate: 20-24 spm. Duration: 40-60 min.
- TR (Transportable): Threshold work. Split: +8-12 seconds above race pace. Rate: 24-28 spm. Duration: 20-30 min.
- AT (Anaerobic Threshold): High intensity intervals. Split: +3-6 seconds above race pace. Rate: 28-32 spm.

Generate a ${months}-month training plan with weekly schedules. Each week has 6 training days and 1 rest day.

Return in JSON format:
{
  "plan": [
    {
      "week": 1,
      "phase": "Base Building",
      "days": [
        {
          "day": 1,
          "ergWorkout": {
            "zone": "UT2",
            "description": "Steady state endurance",
            "duration": "60min",
            "distance": 12000,
            "targetSplit": "2:10/500m",
            "rate": "18-20 spm",
            "notes": "Focus on technique"
          },
          "strengthWorkout": {
            "exercise": "Deadlift",
            "sets": 4,
            "reps": 6,
            "weight": "moderate",
            "notes": "Focus on form"
          }
        }
      ]
    }
  ]
}`;

    const userPrompt = `Create a ${months}-month rowing training plan for:
- Weight: ${weight}kg, Height: ${height}cm
- Experience: ${experience}
- Goals: ${goals}

Structure the plan in phases:
- Months 1-2: Base Building (mostly UT2, some UT1)
- Months 3-4: Aerobic Development (mix of UT1, UT2, some TR)
- Months 5+: Race Preparation (more TR, AT work while maintaining base)

Each week should have 6 training days with:
1. One erg workout using proper training zones (UT2, UT1, TR, AT) with specific splits, rates, distance OR time
2. One strength exercise (rotate through: deadlift, squat, bench press, rows, pull-ups, leg press, etc.)

Include progressive overload. Vary workout types throughout each week. Include recovery weeks every 3-4 weeks.`;

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
