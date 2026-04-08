import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    // -----------------------------
    // AUTHENTICATION
    // -----------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Authenticated user:", claimsData.claims.sub);

    // -----------------------------
    // INPUT VALIDATION
    // -----------------------------
    const { imageBase64, fileType } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "No image data provided" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!imageBase64.startsWith("data:")) {
      return new Response(
        JSON.stringify({ error: "Invalid image format - must be data URL" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (imageBase64.length > 10 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ error: "Image too large (max 10MB)" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // -----------------------------
    // ANTHROPIC SETUP
    // -----------------------------
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    // Extract base64 data from data URL
    const base64Data = imageBase64.split(",")[1];
    const mime = imageBase64.match(/^data:(.*?);base64/)?.[1] || "image/png";

    const imageBlock = {
      type: "image",
      source: {
        type: "base64",
        media_type: mime,
        data: base64Data,
      },
    };

    const systemPrompt = `
You are a workout plan parser. Analyze images of workout/training plans and extract structured data.

Return ONLY valid JSON in this exact format:
{
  "weeks": [
    {
      "week": 1,
      "phase": "Phase name or difficulty",
      "days": [
        {
          "day": 1,
          "ergWorkout": {
            "zone": "UT2 | UT1 | TR | AT | Training",
            "description": "Full workout description including warmup, main workout, rest intervals, rates, cooldown",
            "duration": "Total duration if visible",
            "notes": "Any additional notes"
          },
          "strengthWorkout": {
            "focus": "Muscle group or workout focus",
            "exercises": [{"name": "Exercise name", "sets": 3, "reps": 10}],
            "notes": "Any notes"
          }
        }
      ]
    }
  ]
}

Rules:
- Extract ALL weeks and days visible
- Identify rowing zones (UT2, UT1, TR, AT)
- Include warmup, main workout, rest periods, stroke rates, cooldown
- If a day is strength-only, put it in strengthWorkout
- If nothing is readable, return {"weeks": []}
- Respond ONLY with JSON, no commentary.
`;

    const userPrompt = `Extract the structured workout plan from this ${fileType || "image"}. Return ONLY JSON.`;


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
          { role: "user", content: [imageBlock, { type: "text", text: userPrompt }] },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic error:", err);
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;

    if (!text) {
      throw new Error("No response from AI");
    }

    // -----------------------------
    // PARSE JSON
    // -----------------------------
    let parsedPlan;
    try {
      const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
      parsedPlan = JSON.parse(clean);
    } catch (e) {
      console.error("Failed to parse AI response:", text);
      throw new Error("Failed to parse workout plan from image");
    }

    return new Response(
      JSON.stringify({ plan: parsedPlan.weeks || [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error parsing workout image:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

if (imageBase64.length > maxSize) {
      return new Response(
        JSON.stringify({ error: "Image too large (max 10MB)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You are a workout plan parser. Analyze this ${fileType || 'image'} of a workout/training plan and extract the structured data.

Return ONLY valid JSON in this exact format (no markdown, no code blocks, just the JSON):
{
  "weeks": [
    {
      "week": 1,
      "phase": "Phase name or difficulty",
      "days": [
        {
          "day": 1,
          "ergWorkout": {
            "zone": "UT2 or UT1 or TR or AT or Training",
            "description": "Full workout description including warmup, main workout, rest intervals, rates, cooldown",
            "duration": "Total duration if visible",
            "notes": "Any additional notes"
          },
          "strengthWorkout": {
            "focus": "Muscle group or workout focus",
            "exercises": [{"name": "Exercise name", "sets": 3, "reps": 10}],
            "notes": "Any notes"
          }
        }
      ]
    }
  ]
}

Rules:
- Extract ALL weeks and days visible in the plan
- For rowing workouts, identify the zone (UT2=easy base, UT1=aerobic, TR=threshold, AT=high intensity)
- Include warmup, main workout, rest periods, stroke rates, and cooldown in the description
- If a day is a lifting/strength day, put it in strengthWorkout instead of ergWorkout
- Parse any visible dates, phases, or difficulty levels
- If you can't parse anything meaningful, return {"weeks": []}`,
              },
              {
                type: "image_url",
                image_url: {
                  url: imageBase64.startsWith("data:") ? imageBase64 : `data:image/${fileType === 'pdf' ? 'png' : fileType};base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from AI");
    }

    // Parse the JSON response
    let parsedPlan;
    try {
      // Remove any markdown code blocks if present
      const cleanContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsedPlan = JSON.parse(cleanContent);
    } catch (e) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse workout plan from image");
    }

    return new Response(JSON.stringify({ plan: parsedPlan.weeks || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error parsing workout image:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
