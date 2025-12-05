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

    // Generate only 4 weeks at a time to avoid JSON truncation
    const weeksToGenerate = Math.min(4, months * 4);
    
    const systemPrompt = `You are an expert rowing coach. Create a training plan in valid JSON only - no markdown, no extra text.

Training zones: UT2 (easy, 18-20spm), UT1 (moderate, 20-24spm), TR (threshold, 24-28spm), AT (high intensity, 28-32spm).

Return ONLY this JSON structure (no markdown):
{"plan":[{"week":1,"phase":"Base","days":[{"day":1,"ergWorkout":{"zone":"UT2","description":"Steady state","duration":"60min","targetSplit":"2:10","rate":"18-20","notes":"Easy pace"},"strengthWorkout":{"exercise":"Deadlift","sets":4,"reps":6,"weight":"moderate","notes":"Form focus"}}]}]}`;

    const userPrompt = `Create ${weeksToGenerate} weeks of rowing training for someone ${weight}kg, ${height}cm, ${experience} level. Goal: ${goals}.

Generate exactly ${weeksToGenerate} weeks with 6 days each (day 7 is rest). Each day needs 1 erg workout and 1 strength exercise. Vary the zones and exercises. Return ONLY valid JSON.`;

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
    const rawContent = data.choices[0].message.content;
    
    // Clean up the JSON response - sometimes the model adds extra text or formatting
    let jsonContent = rawContent;
    
    // Remove markdown code blocks if present
    if (jsonContent.includes("```json")) {
      jsonContent = jsonContent.replace(/```json\s*/g, "").replace(/```\s*/g, "");
    } else if (jsonContent.includes("```")) {
      jsonContent = jsonContent.replace(/```\s*/g, "");
    }
    
    // Trim whitespace
    jsonContent = jsonContent.trim();
    
    let plan;
    try {
      plan = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      console.error("Raw content (first 500 chars):", rawContent.substring(0, 500));
      console.error("Cleaned content (first 500 chars):", jsonContent.substring(0, 500));
      
      // Try to extract JSON from the response
      const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          plan = JSON.parse(jsonMatch[0]);
        } catch (e) {
          throw new Error("Failed to parse AI response as JSON. Please try again.");
        }
      } else {
        throw new Error("AI response did not contain valid JSON. Please try again.");
      }
    }

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
