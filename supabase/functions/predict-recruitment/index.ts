import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { profile, goals, gpa, gender } = await req.json();

    // Anthropic key
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY)
      throw new Error("ANTHROPIC_API_KEY is not configured");

    const genderCategory = gender === "womens" ? "Women's" : "Men's";

    // Convert metric → imperial
    const weightLbs = profile.weight
      ? Math.round(profile.weight * 2.20462)
      : null;
    const heightInches = profile.height
      ? Math.round(profile.height / 2.54)
      : null;
    const heightFeetStr = heightInches
      ? `${Math.floor(heightInches / 12)}'${heightInches % 12}"`
      : "Unknown";

    // SYSTEM PROMPT
    const systemPrompt = `
You are a college rowing recruitment expert with deep knowledge of NCAA D1, D2, D3, NAIA, and club rowing programs.

All responses must be in English only.

You must return ONLY valid JSON matching the schema below — no commentary, no markdown.

SCHEMA:
{
  "overall_assessment": "string",
  "predicted_tier": "D1 Top | D1 Mid | D1 Lower | D2 | D3 Top | D3 Mid | D3 Lower | NAIA | Club | Insufficient Data",
  "weight_class": "Heavyweight | Lightweight | Unknown",
  "tier_breakdown": [
    {
      "tier": "string",
      "likelihood": "strong | possible | unlikely | not_competitive",
      "explanation": "string",
      "time_needed_2k": "string or null"
    }
  ],
  "school_predictions": [
    {
      "school": "string",
      "division": "string",
      "chance": "high | medium | low | reach",
      "type": "recruited | walk-on | club",
      "notes": "string"
    }
  ],
  "improvement_tips": ["string", "string", "string"],
  "missing_data_notes": ["string", ...]
}

RECRUITING REALISM RULES:
- Be honest and specific.
- Use real competitive standards.
- If times are not competitive for a tier, say so clearly.
- GPA matters heavily for academic schools.
- Height and weight matter for heavyweight vs lightweight.
- If data is missing, note that accuracy is limited.

MEN'S ROWING GUIDELINES:
- D1 heavyweight: sub‑6:20 competitive; top programs want sub‑6:10
- D1 lightweight (<160 lbs): sub‑6:30 for top programs
- D3 men: 6:30–7:00 typical
- Ideal D1 heavyweight: 6'2"+, 185+ lbs

WOMEN'S ROWING GUIDELINES:
- D1 women: sub‑7:10 top tier; sub‑7:30 mid‑tier
- D1 lightweight (<130 lbs): sub‑7:20 top tier
- D3 women: 7:30–8:00 typical
- Ideal D1 women: 5'10"+, 150+ lbs

PROGRAM COMPETITIVENESS:
TOP D1: Harvard, Yale, Princeton, Cal, Washington, Wisconsin, Brown, Cornell, Dartmouth, Penn, Columbia, Stanford
MID D1: Georgetown, Northeastern, Syracuse, BU, Michigan, Ohio State, Notre Dame, Clemson, Virginia, Navy
${gender === "mens"
        ? "D1 LIGHTWEIGHT: Cornell, Harvard, Princeton, Georgetown, MIT, Columbia, Penn, Dartmouth"
        : ""}
D2: Mercyhurst, Florida Tech, Barry, Drury, Central Oklahoma
D3: Williams, Bates, WPI, Trinity, Tufts, MIT (heavyweight), Colby, Hamilton, Wesleyan, Ithaca, RIT
NAIA: Oklahoma City, Lindsey Wilson
CLUB: Michigan, Florida, Texas, USC, UCLA, NC State
`;

    // USER PROMPT
    const userPrompt = `
Analyze this ${genderCategory} rower's recruitment potential.

ATHLETE PROFILE:
- Gender/Category: ${genderCategory}
- Age: ${profile.age || "Unknown"}
- Height: ${heightFeetStr} (${heightInches || "Unknown"} inches)
- Weight: ${weightLbs ? weightLbs + " lbs" : "Unknown"}
- Experience Level: ${profile.experience_level || "Unknown"}
- Goals: ${profile.goals || "Not specified"}
- GPA: ${gpa || "Not provided"}

ERG TIMES:
- 2K: ${goals?.current_2k_time || "Not recorded"}
- 5K: ${goals?.current_5k_time || "Not recorded"}
- 6K: ${goals?.current_6k_time || "Not recorded"}

GOAL TIMES:
- 2K Goal: ${goals?.goal_2k_time || "Not set"}
- 5K Goal: ${goals?.goal_5k_time || "Not set"}
- 6K Goal: ${goals?.goal_6k_time || "Not set"}

Return ONLY valid JSON following the schema. No markdown, no commentary.
`;

    // CALL ANTHROPIC
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
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

    if (!response.ok) {
      const t = await response.text();
      console.error("Anthropic error:", response.status, t);
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;

    if (!text) throw new Error("No response from AI");

    // PARSE JSON
    let prediction;
    try {
      const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
      prediction = JSON.parse(clean);
    } catch (err) {
      console.error("Failed to parse AI JSON:", text);
      throw new Error("Invalid JSON returned by AI");
    }

    return new Response(JSON.stringify(prediction), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("predict-recruitment error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
// -----------------------------
    const systemPrompt = `
You are a college rowing recruitment expert with deep knowledge of NCAA D1, D2, D3, NAIA, and club rowing programs.

All responses must be in English only.

You must return ONLY valid JSON matching the schema below — no commentary, no markdown.

SCHEMA:
{
  "overall_assessment": "string",
  "predicted_tier": "D1 Top | D1 Mid | D1 Lower | D2 | D3 Top | D3 Mid | D3 Lower | NAIA | Club | Insufficient Data",
  "weight_class": "Heavyweight | Lightweight | Unknown",
  "tier_breakdown": [
    {
      "tier": "string",
      "likelihood": "strong | possible | unlikely | not_competitive",
      "explanation": "string",
      "time_needed_2k": "string or null"
    }
  ],
  "school_predictions": [
    {
      "school": "string",
      "division": "string",
      "chance": "high | medium | low | reach",
      "type": "recruited | walk-on | club",
      "notes": "string"
    }
  ],
  "improvement_tips": ["string", "string", "string"],
  "missing_data_notes": ["string", ...]  // optional
}

RECRUITING REALISM RULES:
- Be honest and specific.
- Use real competitive standards.
- If times are not competitive for a tier, say so clearly.
- GPA matters heavily for academic schools.
- Height and weight matter for heavyweight vs lightweight.
- If data is missing, note that accuracy is limited.

MEN'S ROWING GUIDELINES:
- D1 heavyweight: sub‑6:20 competitive; top programs want sub‑6:10
- D1 lightweight (<160 lbs): sub‑6:30 for top programs
- D3 men: 6:30–7:00 typical
- Ideal D1 heavyweight: 6'2"+, 185+ lbs

WOMEN'S ROWING GUIDELINES:
- D1 women: sub‑7:10 top tier; sub‑7:30 mid‑tier
- D1 lightweight (<130 lbs): sub‑7:20 top tier
- D3 women: 7:30–8:00 typical
- Ideal D1 women: 5'10"+, 150+ lbs

PROGRAM COMPETITIVENESS:
TOP D1: Harvard, Yale, Princeton, Cal, Washington, Wisconsin, Brown, Cornell, Dartmouth, Penn, Columbia, Stanford
MID D1: Georgetown, Northeastern, Syracuse, BU, Michigan, Ohio State, Notre Dame, Clemson, Virginia, Navy
${gender === "mens"
        ? "D1 LIGHTWEIGHT: Cornell, Harvard, Princeton, Georgetown, MIT, Columbia, Penn, Dartmouth"
        : ""}
D2: Mercyhurst, Florida Tech, Barry, Drury, Central Oklahoma
D3: Williams, Bates, WPI, Trinity, Tufts, MIT (heavyweight), Colby, Hamilton, Wesleyan, Ithaca, RIT
NAIA: Oklahoma City, Lindsey Wilson
CLUB: Michigan, Florida, Texas, USC, UCLA, NC State
`;

    // -----------------------------
    // USER PROMPT
    // -----------------------------
    const userPrompt = `
Analyze this ${genderCategory} rower's recruitment potential.

ATHLETE PROFILE:
- Gender/Category: ${genderCategory}
- Age: ${profile.age || "Unknown"}
- Height: ${heightFeetStr} (${heightInches || "Unknown"} inches)
- Weight: ${weightLbs ? weightLbs + " lbs" : "Unknown"}
- Experience Level: ${profile.experience_level || "Unknown"}
- Goals: ${profile.goals || "Not specified"}
- GPA: ${gpa || "Not provided"}

ERG TIMES:
- 2K: ${goals?.current_2k_time || "Not recorded"}
- 5K: ${goals?.current_5k_time || "Not recorded"}
- 6K: ${goals?.current_6k_time || "Not recorded"}

GOAL TIMES:
- 2K Goal: ${goals?.goal_2k_time || "Not set"}
- 5K Goal: ${goals?.goal_5k_time || "Not set"}
- 6K Goal: ${goals?.goal_6k_time || "Not set"}

Return ONLY valid JSON following the schema. No markdown, no commentary.
`;

    // -----------------------------
    // CALL ANTHROPIC
    // -----------------------------
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
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

    if (!response.ok) {
      const t = await response.text();
      console.error("Anthropic error:", response.status, t);
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;

    if (!text) throw new Error("No response from AI");

    // -----------------------------
    // PARSE JSON
    // -----------------------------
    let prediction;
    try {
      const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
      prediction = JSON.parse(clean);
    } catch (err) {
      console.error("Failed to parse AI JSON:", text);
      throw new Error("Invalid JSON returned by AI");
    }

    return new Response(JSON.stringify(prediction), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("predict-recruitment error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
    const heightInches = profile.height ? Math.round(profile.height / 2.54) : null;
    const heightFeetStr = heightInches ? `${Math.floor(heightInches / 12)}'${heightInches % 12}"` : "Unknown";

    const userPrompt = `Analyze this ${genderCategory} rower's recruitment potential:

ATHLETE PROFILE:
- Gender/Category: ${genderCategory}
- Age: ${profile.age || "Unknown"}
- Height: ${heightInches ? `${heightFeetStr} (${heightInches} inches)` : "Unknown"}
- Weight: ${weightLbs ? weightLbs + " lbs" : "Unknown"}
- Experience Level: ${profile.experience_level || "Unknown"}
- Goals: ${profile.goals || "Not specified"}
- GPA: ${gpa || "Not provided"}

ERG TIMES:
- 2K Time: ${goals?.current_2k_time || "Not recorded"}
- 5K Time: ${goals?.current_5k_time || "Not recorded"}
- 6K Time: ${goals?.current_6k_time || "Not recorded"}

GOAL TIMES:
- 2K Goal: ${goals?.goal_2k_time || "Not set"}
- 5K Goal: ${goals?.goal_5k_time || "Not set"}
- 6K Goal: ${goals?.goal_6k_time || "Not set"}

Provide a comprehensive, HONEST recruitment prediction for ${genderCategory} rowing programs. If data is missing, note that it limits accuracy. If times aren't competitive for higher divisions, be direct about it.${gpa ? ` Factor the ${gpa} GPA into academic eligibility and school-specific predictions.` : " Note that GPA was not provided, which limits prediction accuracy for academic schools."}`;

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
