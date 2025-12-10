import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
      console.log("No auth header provided");
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
      console.log("Auth error:", authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    console.log("Authenticated user:", user.id);

    const { months, weight, height, experience, goals, current2k } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const weeksToGenerate = months * 4;
    
    let splitGuidance = "";
    let progressionGuidance = "";
    if (current2k) {
      const parts = current2k.toString().split(":").map(Number);
      let totalSeconds = 0;
      if (parts.length === 3) {
        totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2) {
        totalSeconds = parts[0] * 60 + parts[1];
      }
      
      if (totalSeconds > 0) {
        const pace500m = totalSeconds / 4;
        const ut2Split = pace500m + 22;
        const ut1Split = pace500m + 16;
        const trSplit = pace500m + 10;
        const atSplit = pace500m + 4;
        
        const formatSplit = (secs: number) => {
          const mins = Math.floor(secs / 60);
          const remainingSecs = Math.round(secs % 60);
          return `${mins}:${remainingSecs.toString().padStart(2, "0")}/500m`;
        };
        
        splitGuidance = `
Based on current 2K time of ${current2k}, use these STARTING target splits (Week 1):
- UT2: ${formatSplit(ut2Split)}
- UT1: ${formatSplit(ut1Split)}
- TR: ${formatSplit(trSplit)}
- AT: ${formatSplit(atSplit)}`;

        progressionGuidance = `
CRITICAL PROGRESSIVE SPEED TRAINING:
- Each week, target splits should get FASTER to build speed and endurance for a faster 2K.
- Week-over-week progression: decrease target splits by 0.5-1 second per week for AT and TR zones.
- UT2 and UT1 can remain more stable but should still see slight improvements every 2-3 weeks.
- By the final week, AT splits should be ${formatSplit(atSplit - (weeksToGenerate * 0.5))} to ${formatSplit(atSplit - (weeksToGenerate * 0.8))}.
- Include recovery/deload weeks every 4th week where intensity reduces before building again.`;
      }
    }
    
    const systemPrompt = `You are an expert rowing coach creating periodized training plans. You MUST respond ONLY in English.

Training zones: UT2 (easy endurance, 18-20spm), UT1 (moderate, 20-24spm), TR (threshold, 24-28spm), AT (high intensity intervals, 28-32spm).
${splitGuidance}
${progressionGuidance}

Split format: "2:05/500m" style.

IMPORTANT: Splits must get progressively FASTER each week to build speed for 2K improvement.

Strength exercises: Include FULL strength workouts with 4-6 exercises per day using common English names.

Meal plans: Include a full day's nutrition for each training day with breakfast, lunch, dinner, and snacks.`;

    const userPrompt = `Create a ${weeksToGenerate}-week rowing training plan for:
- Weight: ${weight}kg, Height: ${height}cm
- Experience: ${experience}
- Goals: ${goals}
${current2k ? `- Current 2K time: ${current2k}` : ""}

CRITICAL REQUIREMENTS:
1. ALL text MUST be in English. Format splits as "2:05/500m".
2. PROGRESSIVE SPLITS: Each week's erg workout splits must be FASTER than the previous week.
3. FULL STRENGTH WORKOUTS: Each day needs 4-6 exercises.
4. MEAL PLANS: Include breakfast, lunch, dinner, and snacks.
5. PERIODIZATION: Include base, build, peak, and taper phases.
6. EVERY WEEK MUST HAVE EXACTLY 6 TRAINING DAYS (day 1 through day 6). This is mandatory.

STRUCTURE: Each week MUST contain an array of 6 day objects (day: 1, day: 2, day: 3, day: 4, day: 5, day: 6).

Each of the 6 training days per week needs:
- 1 erg workout (with progressively faster splits)
- 1 FULL strength workout (4-6 exercises)
- 1 complete meal plan

Generate ALL 6 days for EVERY week. Do not skip any days.`;

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
            description: "Create a structured rowing training plan with progressive speed training",
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
                              required: ["zone", "description", "duration", "rate", "targetSplit"]
                            },
                            strengthWorkout: {
                              type: "object",
                              properties: {
                                exercises: {
                                  type: "array",
                                  items: {
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
                                focus: { type: "string" }
                              },
                              required: ["exercises", "focus"]
                            },
                            mealPlan: {
                              type: "object",
                              properties: {
                                breakfast: { type: "string" },
                                lunch: { type: "string" },
                                dinner: { type: "string" },
                                snacks: { type: "string" },
                                totalCalories: { type: "number" },
                                macros: { type: "string" }
                              },
                              required: ["breakfast", "lunch", "dinner"]
                            }
                          },
                          required: ["day", "ergWorkout", "strengthWorkout", "mealPlan"]
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
    console.log("AI response received successfully");
    
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
