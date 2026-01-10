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
  ergWorkout?: ErgWorkout;
  strengthWorkout?: StrengthWorkout;
  yogaSession?: YogaSession;
  mealPlan?: MealPlan;
}

interface ErgWorkout {
  zone: string;
  description: string;
  duration: string;
  targetSplit: string;
  rate: string;
  warmup: string;
  cooldown: string;
  restPeriods?: string;
  notes?: string;
}

interface StrengthWorkout {
  warmupNotes: string;
  cooldownNotes: string;
  exercises: Exercise[];
  focus: string;
}

interface Exercise {
  exercise: string;
  sets: number;
  reps: number;
  weight?: string;
  restBetweenSets: string;
  notes?: string;
}

interface YogaSession {
  duration: string;
  focus: string;
  poses: string;
}

interface MealPlan {
  breakfast: string;
  lunch: string;
  dinner: string;
  snacks?: string;
  totalCalories?: number;
  macros?: string;
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
    progressionGuidance: string;
    healthGuidance: string;
  },
  apiKey: string
): Promise<WeekPlan[]> {
  const { weight, height, experience, goals, current2k, age, healthIssues, splitGuidance, progressionGuidance, healthGuidance } = context;

  // Determine phase for this batch
  const getPhase = (week: number) => {
    const progress = week / totalWeeks;
    if (progress < 0.3) return "Base";
    if (progress < 0.6) return "Build";
    if (progress < 0.85) return "Peak";
    return "Taper";
  };

  const systemPrompt = `You are an expert rowing coach. Generate training plans in English only.

Training zones: UT2 (18-20spm), UT1 (20-24spm), TR (24-28spm), AT (28-32spm).
${splitGuidance}
${healthGuidance}

RULES:
- Days 1-6: Include ergWorkout, strengthWorkout, and mealPlan
- Day 7: REST DAY with yogaSession and mealPlan only (NO ergWorkout or strengthWorkout)
- All warmups/cooldowns required
- Splits format: "2:05/500m"`;

  const userPrompt = `Generate weeks ${startWeek} to ${endWeek} of a ${totalWeeks}-week plan.

Athlete: ${weight}kg, ${height}cm, ${experience} level
Goals: ${goals}
${current2k ? `2K time: ${current2k}` : ""}
${age ? `Age: ${age}` : ""}
${healthIssues?.length ? `Health issues: ${healthIssues.join(", ")}` : ""}

Phase guidance:
${Array.from({ length: endWeek - startWeek + 1 }, (_, i) => `- Week ${startWeek + i}: ${getPhase(startWeek + i)}`).join("\n")}

${progressionGuidance}

Generate exactly ${endWeek - startWeek + 1} weeks with 7 days each.`;

  const models = [
    "google/gemini-2.5-flash",
    "openai/gpt-5-mini",
    "google/gemini-2.5-flash-lite"
  ];

  for (const model of models) {
    try {
      console.log(`Trying model ${model} for weeks ${startWeek}-${endWeek}`);
      
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
                                  restPeriods: { type: "string" },
                                  notes: { type: "string" }
                                }
                              },
                              strengthWorkout: {
                                type: "object",
                                properties: {
                                  warmupNotes: { type: "string" },
                                  cooldownNotes: { type: "string" },
                                  exercises: {
                                    type: "array",
                                    items: {
                                      type: "object",
                                      properties: {
                                        exercise: { type: "string" },
                                        sets: { type: "number" },
                                        reps: { type: "number" },
                                        weight: { type: "string" },
                                        restBetweenSets: { type: "string" },
                                        notes: { type: "string" }
                                      }
                                    }
                                  },
                                  focus: { type: "string" }
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
                                  snacks: { type: "string" },
                                  totalCalories: { type: "number" },
                                  macros: { type: "string" }
                                }
                              }
                            },
                            required: ["day"]
                          }
                        }
                      },
                      required: ["week", "phase", "days"]
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

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Model ${model} error:`, response.status, errorText);
        continue;
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      
      if (!toolCall) {
        console.error(`Model ${model}: No tool call in response`);
        continue;
      }

      const parsed = JSON.parse(toolCall.function.arguments);
      console.log(`Model ${model} succeeded for weeks ${startWeek}-${endWeek}`);
      return parsed.weeks as WeekPlan[];
    } catch (error) {
      console.error(`Model ${model} failed:`, error);
      continue;
    }
  }

  throw new Error(`All models failed for weeks ${startWeek}-${endWeek}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const { months, weight, height, experience, goals, current2k, age, healthIssues } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Build health/age guidance
    let healthGuidance = "";
    if (age) {
      if (age >= 50) {
        healthGuidance += "Age 50+: longer warmups, more recovery, reduced high-impact. ";
      } else if (age >= 40) {
        healthGuidance += "Age 40+: adequate warmup/cooldown, focus on mobility. ";
      }
    }
    if (healthIssues && healthIssues.length > 0) {
      healthGuidance += `Health conditions: ${healthIssues.join(", ")}. Provide safe alternatives. `;
    }

    const totalWeeks = months * 4;
    
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
        
        splitGuidance = `Starting splits: UT2: ${formatSplit(ut2Split)}, UT1: ${formatSplit(ut1Split)}, TR: ${formatSplit(trSplit)}, AT: ${formatSplit(atSplit)}`;
        progressionGuidance = `Progressive training: decrease splits 0.5-1s/week. Deload every 4th week.`;
      }
    }

    // Generate in batches of 4 weeks max
    const batchSize = 4;
    const allWeeks: WeekPlan[] = [];
    
    for (let startWeek = 1; startWeek <= totalWeeks; startWeek += batchSize) {
      const endWeek = Math.min(startWeek + batchSize - 1, totalWeeks);
      console.log(`Generating weeks ${startWeek}-${endWeek} of ${totalWeeks}`);
      
      const batchWeeks = await generateWeekBatch(
        startWeek,
        endWeek,
        totalWeeks,
        { weight, height, experience, goals, current2k, age, healthIssues, splitGuidance, progressionGuidance, healthGuidance },
        LOVABLE_API_KEY
      );
      
      allWeeks.push(...batchWeeks);
    }
    
    console.log(`Successfully generated ${allWeeks.length} weeks`);
    
    return new Response(
      JSON.stringify({ plan: allWeeks }),
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
