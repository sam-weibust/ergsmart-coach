import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
  anthropicKey: string
): Promise<WeekPlan[]> {
  const {
    weight,
    height,
    experience,
    goals,
    current2k,
    age,
    healthIssues,
    splitGuidance,
    healthGuidance,
  } = context;

  const getPhase = (week: number) => {
    const progress = week / totalWeeks;
    if (progress < 0.3) return "Base";
    if (progress < 0.6) return "Build";
    if (progress < 0.85) return "Peak";
    return "Taper";
  };

  const systemPrompt = `You are an elite rowing coach. Generate training plans in English.
Zones: UT2 (18-20spm, 60-70% HR), UT1 (20-24spm, 70-80% HR), TR (24-28spm, 80-85% HR), AT (28-32spm, 85-95% HR).
${splitGuidance}
${healthGuidance}

CRITICAL STRUCTURE:
- Days 1-6: ergWorkout + strengthWorkout + mealPlan (active training days)
- Day 7: REST DAY - yogaSession + mealPlan ONLY (NO ergWorkout, NO strengthWorkout)

The yogaSession on Day 7 must include:
- duration: "45-60 minutes"
- focus: e.g., "Recovery and Flexibility", "Restorative", "Active Recovery"
- poses: List of specific yoga poses appropriate for rowers (e.g., "Child's Pose, Cat-Cow, Downward Dog, Pigeon Pose, Seated Forward Fold, Supine Spinal Twist, Savasana")`;

  const userPrompt = `Generate weeks ${startWeek}-${endWeek} of a ${totalWeeks}-week periodized rowing plan.
Athlete: ${weight}kg, ${height}cm, ${experience} level. Goals: ${goals}
${current2k ? `Current 2K: ${current2k}` : ""}${age ? `, Age: ${age}` : ""}
${healthIssues?.length ? `Health considerations: ${healthIssues.join(", ")}` : ""}
Phases: ${Array.from(
    { length: endWeek - startWeek + 1 },
    (_, i) => `Week ${startWeek + i}: ${getPhase(startWeek + i)}`
  ).join(", ")}

Remember: Day 7 of each week is REST with yoga only!

Return ONLY valid JSON with this structure:

{
  "weeks": [
    {
      "week": number,
      "phase": "Base" | "Build" | "Peak" | "Taper",
      "days": [
        {
          "day": 1-7,
          "ergWorkout": object or null (MUST be null for day 7),
          "strengthWorkout": object or null (MUST be null for day 7),
          "yogaSession": object or null (MUST be present for day 7),
          "mealPlan": object (always present)
        }
      ]
    }
  ]
}`;

  console.log(`Calling Anthropic for weeks ${startWeek}-${endWeek}`);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  const responseText = await response.text();
  console.log(
    `Anthropic status for weeks ${startWeek}-${endWeek}: ${response.status}, length: ${responseText.length}`
  );

  if (!response.ok) {
    console.error(
      `Anthropic error ${response.status}: ${responseText.substring(0, 500)}`
    );
    if (response.status === 429) {
      throw new Error("Rate limit exceeded. Please try again in a few moments.");
    }
    throw new Error(
      `Anthropic API error for weeks ${startWeek}-${endWeek}: ${response.status}`
    );
  }

  const data = JSON.parse(responseText);
  const content = data.content?.[0]?.text;
  if (!content) {
    console.error("Anthropic returned no content");
    throw new Error("No content from AI");
  }

  const parsed = JSON.parse(content);
  const weeks = parsed.weeks || parsed;

  if (!Array.isArray(weeks) || weeks.length === 0) {
    console.error("Invalid weeks structure from AI");
    throw new Error("Invalid weeks structure from AI");
  }

  console.log(`Anthropic succeeded: ${weeks.length} weeks`);
  return weeks as WeekPlan[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("User:", user.id);

    const {
      months,
      weight,
      height,
      experience,
      goals,
      current2k,
      goal2k,
      age,
      healthIssues,
    } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

    let healthGuidance = "";
    if (age && age >= 40) {
      healthGuidance +=
        age >= 50
          ? "Age 50+: extra warmup, more recovery. "
          : "Age 40+: adequate warmup/cooldown. ";
    }
    if (healthIssues?.length && healthIssues[0] !== "none") {
      healthGuidance += `Conditions: ${healthIssues.join(
        ", "
      )}. Provide safe alternatives.`;
    }

    const totalWeeks = months * 4;

    let splitGuidance = "";
    if (current2k) {
      const parseTime = (t: string) => {
        const p = t.toString().replace(/^00:/, "").split(":").map(Number);
        return p.length === 2 ? p[0] * 60 + p[1] : 0;
      };

      const currentSeconds = parseTime(current2k);
      const goalSeconds = goal2k ? parseTime(goal2k) : 0;

      if (currentSeconds > 0) {
        const currentPace = currentSeconds / 4;
        const goalPace = goalSeconds > 0 ? goalSeconds / 4 : currentPace - 8;
        const fmt = (s: number) =>
          `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(
            2,
            "0"
          )}/500m`;

        const paceImprovement = (currentPace - goalPace) / totalWeeks;

        splitGuidance = `CRITICAL PROGRESSIVE SPLIT INSTRUCTIONS:
Current 2K: ${current2k} (500m pace: ${fmt(
          currentPace
        )}). Goal 2K: ${goal2k || "not set"} (500m pace: ${fmt(goalPace)}).
Total improvement needed: ${(currentPace - goalPace).toFixed(
          1
        )}s per 500m over ${totalWeeks} weeks = ~${paceImprovement.toFixed(
          2
        )}s/week faster.

WEEK 1 starting splits: UT2 ${fmt(
          currentPace + 22
        )}, UT1 ${fmt(currentPace + 16)}, TR ${fmt(
          currentPace + 10
        )}, AT ${fmt(currentPace + 4)}.
FINAL WEEK target splits: UT2 ${fmt(goalPace + 20)}, UT1 ${fmt(
          goalPace + 14
        )}, TR ${fmt(goalPace + 8)}, AT ${fmt(goalPace + 2)}.

EVERY WEEK the splits MUST get faster. Each week should improve approximately ${paceImprovement.toFixed(
          1
        )}s/500m across all zones.
Do NOT keep splits the same across weeks. The athlete's pace must progressively decrease (get faster) from week 1 to the final week.
Example: If Week 1 AT split is ${fmt(
          currentPace + 4
        )}, Week 2 should be ~${fmt(
          currentPace + 4 - paceImprovement
        )}, Week 3 ~${fmt(
          currentPace + 4 - paceImprovement * 2
        )}, etc.`;
      }
    }

    const batchSize = 4;
    const batchPromises: Promise<WeekPlan[]>[] = [];

    for (let startWeek = 1; startWeek <= totalWeeks; startWeek += batchSize) {
      const endWeek = Math.min(startWeek + batchSize - 1, totalWeeks);
      console.log(`Queuing weeks ${startWeek}-${endWeek}/${totalWeeks}`);

      batchPromises.push(
        generateWeekBatch(
          startWeek,
          endWeek,
          totalWeeks,
          {
            weight,
            height,
            experience,
            goals,
            current2k,
            age,
            healthIssues,
            splitGuidance,
            healthGuidance,
          },
          ANTHROPIC_API_KEY
        )
      );
    }

    const batchResults = await Promise.all(batchPromises);
    const allWeeks: WeekPlan[] = batchResults.flat();

    console.log(`Generated ${allWeeks.length} weeks successfully`);

    return new Response(JSON.stringify({ plan: allWeeks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in generate-workout:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "An error occurred",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
    splitGuidance: string;
    healthGuidance: string;
  },
  anthropicKey: string
): Promise<WeekPlan[]> {
  const {
    weight,
    height,
    experience,
    goals,
    current2k,
    age,
    healthIssues,
    splitGuidance,
    healthGuidance,
  } = context;

  const getPhase = (week: number) => {
    const progress = week / totalWeeks;
    if (progress < 0.3) return "Base";
    if (progress < 0.6) return "Build";
    if (progress < 0.85) return "Peak";
    return "Taper";
  };

  const systemPrompt = `You are an elite rowing coach. Generate training plans in English.
Zones: UT2 (18-20spm, 60-70% HR), UT1 (20-24spm, 70-80% HR), TR (24-28spm, 80-85% HR), AT (28-32spm, 85-95% HR).
${splitGuidance}
${healthGuidance}

CRITICAL STRUCTURE:
- Days 1-6: ergWorkout + strengthWorkout + mealPlan (active training days)
- Day 7: REST DAY - yogaSession + mealPlan ONLY (NO ergWorkout, NO strengthWorkout)

The yogaSession on Day 7 must include:
- duration: "45-60 minutes"
- focus: e.g., "Recovery and Flexibility", "Restorative", "Active Recovery"
- poses: List of specific yoga poses appropriate for rowers (e.g., "Child's Pose, Cat-Cow, Downward Dog, Pigeon Pose, Seated Forward Fold, Supine Spinal Twist, Savasana")`;

  const userPrompt = `Generate weeks ${startWeek}-${endWeek} of a ${totalWeeks}-week periodized rowing plan.
Athlete: ${weight}kg, ${height}cm, ${experience} level. Goals: ${goals}
${current2k ? `Current 2K: ${current2k}` : ""}${age ? `, Age: ${age}` : ""}
${healthIssues?.length ? `Health considerations: ${healthIssues.join(", ")}` : ""}
Phases: ${Array.from(
    { length: endWeek - startWeek + 1 },
    (_, i) => `Week ${startWeek + i}: ${getPhase(startWeek + i)}`
  ).join(", ")}

Remember: Day 7 of each week is REST with yoga only!

Return ONLY valid JSON with this structure:

{
  "weeks": [
    {
      "week": number,
      "phase": "Base" | "Build" | "Peak" | "Taper",
      "days": [
        {
          "day": 1-7,
          "ergWorkout": object or null (MUST be null for day 7),
          "strengthWorkout": object or null (MUST be null for day 7),
          "yogaSession": object or null (MUST be present for day 7),
          "mealPlan": object (always present)
        }
      ]
    }
  ]
}

Each day object structure:
- day: number 1-7
- ergWorkout: { zone, description, duration, targetSplit, rate, warmup, cooldown, restPeriods } or null
- strengthWorkout: { warmupNotes, cooldownNotes, focus, exercises: [{exercise, sets, reps, weight, restBetweenSets}] } or null
- yogaSession: { duration, focus, poses } or null
- mealPlan: { breakfast, lunch, dinner, snacks }

Respond ONLY with valid JSON, no markdown, no extra text.`;

  console.log(`Calling Anthropic for weeks ${startWeek}-${endWeek}`);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  const responseText = await response.text();
  console.log(
    `Anthropic status for weeks ${startWeek}-${endWeek}: ${response.status}, length: ${responseText.length}`
  );

  if (!response.ok) {
    console.error(
      `Anthropic error ${response.status}: ${responseText.substring(0, 500)}`
    );
    if (response.status === 429) {
      throw new Error("Rate limit exceeded. Please try again in a few moments.");
    }
    throw new Error(
      `Anthropic API error for weeks ${startWeek}-${endWeek}: ${response.status}`
    );
  }

  const data = JSON.parse(responseText);
  const content = data.content?.[0]?.text;
  if (!content) {
    console.error("Anthropic returned no content");
    throw new Error("No content from AI");
  }

  const parsed = JSON.parse(content);
  const weeks = parsed.weeks || parsed;

  if (!Array.isArray(weeks) || weeks.length === 0) {
    console.error("Invalid weeks structure from AI");
    throw new Error("Invalid weeks structure from AI");
  }

  console.log(`Anthropic succeeded: ${weeks.length} weeks`);
  return weeks as WeekPlan[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("User:", user.id);

    const {
      months,
      weight,
      height,
      experience,
      goals,
      current2k,
      goal2k,
      age,
      healthIssues,
    } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

    let healthGuidance = "";
    if (age && age >= 40) {
      healthGuidance +=
        age >= 50
          ? "Age 50+: extra warmup, more recovery. "
          : "Age 40+: adequate warmup/cooldown. ";
    }
    if (healthIssues?.length && healthIssues[0] !== "none") {
      healthGuidance += `Conditions: ${healthIssues.join(
        ", "
      )}. Provide safe alternatives.`;
    }

    const totalWeeks = months * 4;

    let splitGuidance = "";
    if (current2k) {
      const parseTime = (t: string) => {
        const p = t.toString().replace(/^00:/, "").split(":").map(Number);
        return p.length === 2 ? p[0] * 60 + p[1] : 0;
      };

      const currentSeconds = parseTime(current2k);
      const goalSeconds = goal2k ? parseTime(goal2k) : 0;

      if (currentSeconds > 0) {
        const currentPace = currentSeconds / 4;
        const goalPace = goalSeconds > 0 ? goalSeconds / 4 : currentPace - 8;
        const fmt = (s: number) =>
          `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(
            2,
            "0"
          )}/500m`;

        const paceImprovement = (currentPace - goalPace) / totalWeeks;

        splitGuidance = `CRITICAL PROGRESSIVE SPLIT INSTRUCTIONS:
Current 2K: ${current2k} (500m pace: ${fmt(
          currentPace
        )}). Goal 2K: ${goal2k || "not set"} (500m pace: ${fmt(goalPace)}).
Total improvement needed: ${(currentPace - goalPace).toFixed(
          1
        )}s per 500m over ${totalWeeks} weeks = ~${paceImprovement.toFixed(
          2
        )}s/week faster.

WEEK 1 starting splits: UT2 ${fmt(
          currentPace + 22
        )}, UT1 ${fmt(currentPace + 16)}, TR ${fmt(
          currentPace + 10
        )}, AT ${fmt(currentPace + 4)}.
FINAL WEEK target splits: UT2 ${fmt(goalPace + 20)}, UT1 ${fmt(
          goalPace + 14
        )}, TR ${fmt(goalPace + 8)}, AT ${fmt(goalPace + 2)}.

EVERY WEEK the splits MUST get faster. Each week should improve approximately ${paceImprovement.toFixed(
          1
        )}s/500m across all zones.
Do NOT keep splits the same across weeks. The athlete's pace must progressively decrease (get faster) from week 1 to the final week.
Example: If Week 1 AT split is ${fmt(
          currentPace + 4
        )}, Week 2 should be ~${fmt(
          currentPace + 4 - paceImprovement
        )}, Week 3 ~${fmt(
          currentPace + 4 - paceImprovement * 2
        )}, etc.`;
      }
    }

    const batchSize = 4;
    const batchPromises: Promise<WeekPlan[]>[] = [];

    for (let startWeek = 1; startWeek <= totalWeeks; startWeek += batchSize) {
      const endWeek = Math.min(startWeek + batchSize - 1, totalWeeks);
      console.log(`Queuing weeks ${startWeek}-${endWeek}/${totalWeeks}`);

      batchPromises.push(
        generateWeekBatch(
          startWeek,
          endWeek,
          totalWeeks,
          {
            weight,
            height,
            experience,
            goals,
            current2k,
            age,
            healthIssues,
            splitGuidance,
            healthGuidance,
          },
          ANTHROPIC_API_KEY
        )
      );
    }

    const batchResults = await Promise.all(batchPromises);
    const allWeeks: WeekPlan[] = batchResults.flat();

    console.log(`Generated ${allWeeks.length} weeks successfully`);

    return new Response(JSON.stringify({ plan: allWeeks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in generate-workout:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "An error occurred",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
  const userPrompt = `Generate weeks ${startWeek}-${endWeek} of ${totalWeeks}-week periodized rowing plan.
Athlete: ${weight}kg, ${height}cm, ${experience} level. Goals: ${goals}
${current2k ? `Current 2K: ${current2k}` : ""}${age ? `, Age: ${age}` : ""}
${healthIssues?.length ? `Health considerations: ${healthIssues.join(", ")}` : ""}
Phases: ${Array.from({ length: endWeek - startWeek + 1 }, (_, i) => `Week ${startWeek + i}: ${getPhase(startWeek + i)}`).join(", ")}

Remember: Day 7 of each week is REST with yoga only!`;

  // Use stable model with JSON response format instead of tool calls
  const models = [
    "google/gemini-2.5-flash",
    "openai/gpt-5-mini"
  ];

  const jsonSchema = `Return a JSON object with a "weeks" array. Each week has: week (number), phase (string), days (array of 7 day objects).

Each day object structure:
- day: number 1-7
- ergWorkout: object OR null (MUST be null for day 7)
- strengthWorkout: object OR null (MUST be null for day 7)  
- yogaSession: object OR null (MUST be present for day 7)
- mealPlan: object (always present)

ergWorkout fields: { zone, description, duration, targetSplit, rate, warmup, cooldown, restPeriods }
strengthWorkout fields: { warmupNotes, cooldownNotes, focus, exercises: [{exercise, sets, reps, weight, restBetweenSets}] }
yogaSession fields: { duration, focus, poses }
mealPlan fields: { breakfast, lunch, dinner, snacks }`;

  for (const model of models) {
    console.log(`Trying ${model} for weeks ${startWeek}-${endWeek}`);
    
    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: `${systemPrompt}\n\n${jsonSchema}` },
            { role: "user", content: `${userPrompt}\n\nRespond ONLY with valid JSON, no markdown.` }
          ],
          response_format: { type: "json_object" }
        }),
      });

      const responseText = await response.text();
      console.log(`${model} status: ${response.status}, length: ${responseText.length}`);
      
      if (!response.ok) {
        console.error(`${model} error: ${response.status} - ${responseText.substring(0, 500)}`);
        if (response.status === 429) {
          throw new Error("Rate limit exceeded. Please try again in a few moments.");
        }
        if (response.status === 402) {
          throw new Error("AI usage limit reached. Please add credits to continue.");
        }
        continue;
      }

      const data = JSON.parse(responseText);
      if (data.error) {
        console.error(`${model} returned error:`, data.error);
        continue;
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        console.error(`${model} no content in response`);
        continue;
      }

      const parsed = JSON.parse(content);
      const weeks = parsed.weeks || parsed;
      
      if (!Array.isArray(weeks) || weeks.length === 0) {
        console.error(`${model} invalid weeks structure`);
        continue;
      }

      console.log(`${model} succeeded: ${weeks.length} weeks`);
      return weeks as WeekPlan[];
      
    } catch (error) {
      console.error(`${model} exception:`, error);
      if (error instanceof Error && (error.message.includes("Rate limit") || error.message.includes("usage limit"))) {
        throw error;
      }
      continue;
    }
  }

  throw new Error(`Generation failed for weeks ${startWeek}-${endWeek}. Please try again.`);
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

    const { months, weight, height, experience, goals, current2k, goal2k, age, healthIssues } = await req.json();
    
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
      const parseTime = (t: string) => {
        const p = t.toString().replace(/^00:/, "").split(":").map(Number);
        return p.length === 2 ? p[0] * 60 + p[1] : 0;
      };
      
      const currentSeconds = parseTime(current2k);
      const goalSeconds = goal2k ? parseTime(goal2k) : 0;
      
      if (currentSeconds > 0) {
        const currentPace = currentSeconds / 4; // 500m split from 2K
        const goalPace = goalSeconds > 0 ? goalSeconds / 4 : currentPace - 8; // default: ~8s improvement
        const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}/500m`;
        
        // Calculate per-week improvement rate
        const paceImprovement = (currentPace - goalPace) / totalWeeks;
        
        splitGuidance = `CRITICAL PROGRESSIVE SPLIT INSTRUCTIONS:
Current 2K: ${current2k} (500m pace: ${fmt(currentPace)}). Goal 2K: ${goal2k || "not set"} (500m pace: ${fmt(goalPace)}).
Total improvement needed: ${(currentPace - goalPace).toFixed(1)}s per 500m over ${totalWeeks} weeks = ~${paceImprovement.toFixed(2)}s/week faster.

WEEK 1 starting splits: UT2 ${fmt(currentPace + 22)}, UT1 ${fmt(currentPace + 16)}, TR ${fmt(currentPace + 10)}, AT ${fmt(currentPace + 4)}.
FINAL WEEK target splits: UT2 ${fmt(goalPace + 20)}, UT1 ${fmt(goalPace + 14)}, TR ${fmt(goalPace + 8)}, AT ${fmt(goalPace + 2)}.

EVERY WEEK the splits MUST get faster. Each week should improve approximately ${paceImprovement.toFixed(1)}s/500m across all zones.
Do NOT keep splits the same across weeks. The athlete's pace must progressively decrease (get faster) from week 1 to the final week.
Example: If Week 1 AT split is ${fmt(currentPace + 4)}, Week 2 should be ~${fmt(currentPace + 4 - paceImprovement)}, Week 3 ~${fmt(currentPace + 4 - paceImprovement * 2)}, etc.`;
      }
    }

    // Generate all batches in parallel to avoid timeout
    const batchSize = 4;
    const batchPromises: Promise<WeekPlan[]>[] = [];
    
    for (let startWeek = 1; startWeek <= totalWeeks; startWeek += batchSize) {
      const endWeek = Math.min(startWeek + batchSize - 1, totalWeeks);
      console.log(`Queuing weeks ${startWeek}-${endWeek}/${totalWeeks}`);
      
      batchPromises.push(
        generateWeekBatch(
          startWeek, endWeek, totalWeeks,
          { weight, height, experience, goals, current2k, age, healthIssues, splitGuidance, healthGuidance },
          LOVABLE_API_KEY
        )
      );
    }
    
    const batchResults = await Promise.all(batchPromises);
    const allWeeks: WeekPlan[] = batchResults.flat();
    
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
