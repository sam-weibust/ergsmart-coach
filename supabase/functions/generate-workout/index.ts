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

    const weeksToGenerate = Math.min(4, months * 4);
    
    const systemPrompt = `You are an expert rowing coach creating training plans. Training zones: UT2 (easy endurance, 18-20spm), UT1 (moderate, 20-24spm), TR (threshold, 24-28spm), AT (high intensity intervals, 28-32spm).`;

    const userPrompt = `Create a ${weeksToGenerate}-week rowing training plan for someone weighing ${weight}kg, ${height}cm tall, with ${experience} experience level. Their goals: ${goals}. Each week should have 6 training days with 1 erg workout and 1 strength exercise per day.`;

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
        tools: [{
          type: "function",
          function: {
            name: "create_training_plan",
            description: "Create a structured rowing training plan",
            parameters: {
              type: "object",
              properties: {
                plan: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      week: { type: "number" },
                      phase: { type: "string" },
                      days: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            day: { type: "number" },
                            ergWorkout: {
                              type: "object",
                              properties: {
                                zone: { type: "string" },
                                description: { type: "string" },
                                duration: { type: "string" },
                                targetSplit: { type: "string" },
                                rate: { type: "string" },
                                notes: { type: "string" }
                              },
                              required: ["zone", "description", "duration", "rate"]
                            },
                            strengthWorkout: {
                              type: "object",
                              properties: {
                                exercise: { type: "string" },
                                sets: { type: "number" },
                                reps: { type: "number" },
                                weight: { type: "string" },
                                notes: { type: "string" }
                              },
                              required: ["exercise", "sets", "reps"]
                            }
                          },
                          required: ["day", "ergWorkout", "strengthWorkout"]
                        }
                      }
                    },
                    required: ["week", "phase", "days"]
                  }
                }
              },
              required: ["plan"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "create_training_plan" } }
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
    console.log("AI response structure:", JSON.stringify(data).substring(0, 500));
    
    // Extract from tool call response
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error("No tool call in response:", JSON.stringify(data));
      throw new Error("AI did not return expected format. Please try again.");
    }
    
    const planData = JSON.parse(toolCall.function.arguments);
    
    return new Response(
      JSON.stringify({ plan: planData.plan }),
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
