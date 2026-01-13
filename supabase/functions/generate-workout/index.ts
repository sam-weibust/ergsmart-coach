import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WeekPlan {
  week: number;
  phase: string;
  days: DayPlan[];
}

interface DayPlan {
  day: number;
  ergWorkout?: any;
  strengthWorkout?: any;
  yogaSession?: any;
  mealPlan?: any;
}

async function generateWeekBatch(
  startWeek: number,
  endWeek: number,
  totalWeeks: number,
  context: {
    weight: number;
    height: number;
    experience: string;
    goals: string;
    current2k?: string;
    age?: number;
    healthIssues?: string[];
    splitGuidance: string;
    healthGuidance: string;
  },
  apiKey: string
): Promise<WeekPlan[]> {
  const { weight, height, experience, goals, current2k, age, healthIssues, splitGuidance, healthGuidance } = context;

  const getPhase = (week: number) => {
    const progress = week / totalWeeks;
    if (progress < 0.3) return "Base";
    if (progress < 0.6) return "Build";
    if (progress < 0.85) return "Peak";
    return "Taper";
  };

  const systemPrompt = `You are a rowing coach. Generate training plans in English.
Zones: UT2 (18-20spm), UT1 (20-24spm), TR (24-28spm), AT (28-32spm).
${splitGuidance}
${healthGuidance}
Days 1-6: ergWorkout + strengthWorkout + mealPlan. Day 7: REST with yogaSession + mealPlan only.`;

  const userPrompt = `Generate weeks ${startWeek}-${endWeek} of ${totalWeeks}-week plan.
Athlete: ${weight}kg, ${height}cm, ${experience}. Goals: ${goals}
${current2k ? `2K: ${current2k}` : ""}${age ? `, Age: ${age}` : ""}
${healthIssues?.length ? `Health: ${healthIssues.join(", ")}` : ""}
Phases: ${Array.from({ length: endWeek - startWeek + 1 }, (_, i) => `Week ${startWeek + i}: ${getPhase(startWeek + i)}`).join(", ")}`;

  // Try models in order - using gemini-3-flash-preview as primary per docs
  const models = [
    "google/gemini-3-flash-preview",
    "openai/gpt-5-mini", 
    "google/gemini-2.5-flash-lite"
  ];

  for (const model of models) {
    console.log(`Trying ${model} for weeks ${startWeek}-${endWeek}`);
    
    try {
      console.log(`Making request to Lovable AI with model ${model}`);
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          tools: [{
            type: "function",
            function: {
              name: "create_weeks",
              description: "Create training weeks",
              parameters: {
                type: "object",
                properties: {
                  weeks: {
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
                                  warmup: { type: "string" },
                                  cooldown: { type: "string" },
                                  restPeriods: { type: "string" }
                                }
                              },
                              strengthWorkout: {
                                type: "object",
                                properties: {
                                  warmupNotes: { type: "string" },
                                  cooldownNotes: { type: "string" },
                                  focus: { type: "string" },
                                  exercises: {
                                    type: "array",
                                    items: {
                                      type: "object",
                                      properties: {
                                        exercise: { type: "string" },
                                        sets: { type: "number" },
                                        reps: { type: "number" },
                                        weight: { type: "string" },
                                        restBetweenSets: { type: "string" }
                                      }
                                    }
                                  }
                                }
                              },
                              yogaSession: {
                                type: "object",
                                properties: {
                                  duration: { type: "string" },
                                  focus: { type: "string" },
                                  poses: { type: "string" }
                                }
                              },
                              mealPlan: {
                                type: "object",
                                properties: {
                                  breakfast: { type: "string" },
                                  lunch: { type: "string" },
                                  dinner: { type: "string" },
                                  snacks: { type: "string" }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                },
                required: ["weeks"]
              }
            }
          }],
          tool_choice: { type: "function", function: { name: "create_weeks" } }
        }),
      });

      const responseText = await response.text();
      console.log(`${model} response status: ${response.status}, body length: ${responseText.length}`);
      
      if (!response.ok) {
        console.error(`${model} HTTP error: ${response.status} - ${responseText}`);
        // Check for rate limiting or payment required - these should be propagated
        if (response.status === 429) {
          throw new Error("Rate limit exceeded. Please try again in a few moments.");
        }
        if (response.status === 402) {
          throw new Error("AI usage limit reached. Please add credits to continue.");
        }
        continue; // Try next model for other errors
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error(`${model} JSON parse error:`, e);
        continue;
      }

      // Check for provider errors in the response body
      if (data.error) {
        console.error(`${model} returned error:`, data.error);
        continue; // Try next model
      }

      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) {
        console.error(`${model} no tool call found in response`);
        continue; // Try next model
      }

      const parsed = JSON.parse(toolCall.function.arguments);
      console.log(`${model} succeeded for weeks ${startWeek}-${endWeek}`);
      return parsed.weeks as WeekPlan[];
      
    } catch (error) {
      console.error(`${model} exception:`, error);
      continue; // Try next model
    }
  }

  throw new Error(`All models failed for weeks ${startWeek}-${endWeek}. Please try again.`);
}

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

    console.log("User:", user.id);

    const { months, weight, height, experience, goals, current2k, age, healthIssues } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    let healthGuidance = "";
    if (age && age >= 40) {
      healthGuidance += age >= 50 ? "Age 50+: extra warmup, more recovery. " : "Age 40+: adequate warmup/cooldown. ";
    }
    if (healthIssues?.length && healthIssues[0] !== "none") {
      healthGuidance += `Conditions: ${healthIssues.join(", ")}. Provide safe alternatives.`;
    }

    const totalWeeks = months * 4;
    
    let splitGuidance = "";
    if (current2k) {
      const parts = current2k.toString().replace(/^00:/, "").split(":").map(Number);
      let totalSeconds = parts.length === 2 ? parts[0] * 60 + parts[1] : 0;
      
      if (totalSeconds > 0) {
        const pace = totalSeconds / 4;
        const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}/500m`;
        splitGuidance = `2K: ${current2k}. Splits: UT2 ${fmt(pace + 22)}, UT1 ${fmt(pace + 16)}, TR ${fmt(pace + 10)}, AT ${fmt(pace + 4)}. Progress 0.5s/week faster.`;
      }
    }

    // Generate in batches of 2 weeks for reliability
    const batchSize = 2;
    const allWeeks: WeekPlan[] = [];
    
    for (let startWeek = 1; startWeek <= totalWeeks; startWeek += batchSize) {
      const endWeek = Math.min(startWeek + batchSize - 1, totalWeeks);
      console.log(`Generating weeks ${startWeek}-${endWeek}/${totalWeeks}`);
      
      const batchWeeks = await generateWeekBatch(
        startWeek, endWeek, totalWeeks,
        { weight, height, experience, goals, current2k, age, healthIssues, splitGuidance, healthGuidance },
        LOVABLE_API_KEY
      );
      
      allWeeks.push(...batchWeeks);
    }
    
    console.log(`Generated ${allWeeks.length} weeks successfully`);
    
    return new Response(
      JSON.stringify({ plan: allWeeks }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "An error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
