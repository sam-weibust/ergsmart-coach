import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { profile, goals } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are a college rowing recruitment expert with deep knowledge of NCAA D1, D2, D3, NAIA, and club rowing programs in the United States. You provide REALISTIC recruitment assessments.

CRITICAL RULES FOR REALISM:
- D1 heavyweight men need sub-6:20 2K times minimum, top programs (Harvard, Yale, Cal, Washington) want sub-6:10 or better
- D1 lightweight men need sub-6:30 2K for top programs
- D1 women need sub-7:10 2K for top programs, sub-7:30 for mid-tier D1
- D3 men are typically 6:30-7:00 range, D3 women 7:30-8:00
- Height and weight matter enormously - ideal D1 heavyweight men are 6'2"+ and 185+ lbs
- Age context matters - a high school junior with a 6:40 has more potential than a college senior
- Experience level matters - a novice with good times has high upside
- Be HONEST - if someone's times aren't competitive for D1, say so clearly
- Consider that lightweight categories exist (men <160 lbs, women <130 lbs)

You must respond with a JSON object using this EXACT tool call format.

For each school prediction:
- chance: "high" (>60%), "medium" (30-60%), "low" (10-30%), "reach" (<10%)
- walkOn vs recruited distinction matters
- Be specific about what times they'd need to improve to for each tier

Consider these real programs and their approximate competitiveness:
TOP D1: Harvard, Yale, Princeton, Cal, Washington, Wisconsin, Brown, Cornell, Dartmouth, Penn, Columbia, Stanford
MID D1: Georgetown, Northeastern, Syracuse, Boston University, Michigan, Ohio State, Notre Dame, Clemson, Virginia, Navy
D1 LIGHTWEIGHT: Cornell, Harvard, Princeton, Georgetown, MIT, Columbia, Penn, Dartmouth
D2: Mercyhurst, Florida Tech, Barry, Drury, Central Oklahoma
D3: Williams, Bates, WPI, Trinity, Tufts, MIT (heavyweight), Colby, Hamilton, Wesleyan, Ithaca, RIT
NAIA: Oklahoma City, Lindsey Wilson
CLUB: Strong programs at Michigan, Florida, Texas, USC, UCLA, NC State`;

    // Convert metric units to imperial for the prompt
    const weightLbs = profile.weight ? Math.round(profile.weight * 2.20462) : null;
    const heightInches = profile.height ? Math.round(profile.height / 2.54) : null;
    const heightFeetStr = heightInches ? `${Math.floor(heightInches / 12)}'${heightInches % 12}"` : "Unknown";

    const userPrompt = `Analyze this rower's recruitment potential:

ATHLETE PROFILE:
- Age: ${profile.age || "Unknown"}
- Height: ${heightInches ? `${heightFeetStr} (${heightInches} inches)` : "Unknown"}
- Weight: ${weightLbs ? weightLbs + " lbs" : "Unknown"}
- Experience Level: ${profile.experience_level || "Unknown"}
- Goals: ${profile.goals || "Not specified"}

ERG TIMES:
- 2K Time: ${goals?.current_2k_time || "Not recorded"}
- 5K Time: ${goals?.current_5k_time || "Not recorded"}
- 6K Time: ${goals?.current_6k_time || "Not recorded"}

GOAL TIMES:
- 2K Goal: ${goals?.goal_2k_time || "Not set"}
- 5K Goal: ${goals?.goal_5k_time || "Not set"}
- 6K Goal: ${goals?.goal_6k_time || "Not set"}

Provide a comprehensive, HONEST recruitment prediction. If data is missing, note that it limits accuracy. If times aren't competitive for higher divisions, be direct about it.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "recruitment_prediction",
              description: "Return a structured recruitment prediction for a rower",
              parameters: {
                type: "object",
                properties: {
                  overall_assessment: {
                    type: "string",
                    description: "2-3 sentence honest overall assessment of the athlete's recruitment potential"
                  },
                  predicted_tier: {
                    type: "string",
                    enum: ["D1 Top", "D1 Mid", "D1 Lower", "D2", "D3 Top", "D3 Mid", "D3 Lower", "NAIA", "Club", "Insufficient Data"],
                    description: "The most realistic competitive tier for this athlete"
                  },
                  weight_class: {
                    type: "string",
                    enum: ["Heavyweight", "Lightweight", "Unknown"],
                    description: "Weight class based on their weight"
                  },
                  tier_breakdown: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        tier: { type: "string" },
                        likelihood: { type: "string", enum: ["strong", "possible", "unlikely", "not_competitive"] },
                        explanation: { type: "string" },
                        time_needed_2k: { type: "string", description: "2K time needed to be competitive at this level, or null" }
                      },
                      required: ["tier", "likelihood", "explanation"],
                      additionalProperties: false
                    }
                  },
                  school_predictions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        school: { type: "string" },
                        division: { type: "string" },
                        chance: { type: "string", enum: ["high", "medium", "low", "reach"] },
                        type: { type: "string", enum: ["recruited", "walk-on", "club"] },
                        notes: { type: "string" }
                      },
                      required: ["school", "division", "chance", "type", "notes"],
                      additionalProperties: false
                    },
                    description: "8-15 specific school predictions across multiple tiers"
                  },
                  improvement_tips: {
                    type: "array",
                    items: { type: "string" },
                    description: "3-5 specific actionable tips to improve recruitment prospects"
                  },
                  missing_data_notes: {
                    type: "array",
                    items: { type: "string" },
                    description: "Notes about what data is missing that would improve prediction accuracy"
                  }
                },
                required: ["overall_assessment", "predicted_tier", "weight_class", "tier_breakdown", "school_predictions", "improvement_tips"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "recruitment_prediction" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error("No structured response from AI");
    }

    const prediction = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(prediction), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("predict-recruitment error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
