import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ⭐ USE ANTHROPIC KEY
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    console.log("Parsing erg monitor screen photo");

    // Anthropic requires base64 images in this format:
    // { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "..." } }
    // We assume the frontend sends raw base64 WITHOUT data URL prefix.
    const imageBlock = {
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: imageBase64,
      },
    };

    const userPrompt = `
You are analyzing a photo of a Concept2 erg monitor screen (PM5/PM3) showing workout results.

Extract ALL visible workout data.

Return ONLY valid JSON with this structure:
{
  "workout_type": "steady_state" | "intervals" | "sprint" | "test",
  "distance": <number in meters or null>,
  "duration": "<HH:MM:SS or MM:SS or null>",
  "avg_split": "<M:SS.s per 500m or null>",
  "avg_heart_rate": <number or null>,
  "calories": <number or null>,
  "notes": "<any other visible info>"
}

Rules:
- distance must be in meters
- duration must be HH:MM:SS or MM:SS
- avg_split must be M:SS.s
- If the screen shows a 2K, 5K, 6K, or 10K test piece → workout_type = "test"
- If intervals → workout_type = "intervals"
- Include stroke rate in notes if visible
- If unreadable → null
- Respond ONLY with JSON, no commentary.
`;

    // ⭐ CALL ANTHROPIC
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-latest",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: [
              imageBlock,
              { type: "text", text: userPrompt },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Anthropic error: ${response.status} - ${errorText}`);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;

    if (!text) {
      throw new Error("No response from AI");
    }

    console.log("Successfully parsed erg screen");

    const parsed = JSON.parse(text);

    return new Response(JSON.stringify({ workout: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error parsing erg screen:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

- Only return values you can clearly see on the screen`
              },
              {
                type: "image_url",
                image_url: { url: imageBase64 },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AI API error: ${response.status} - ${errorText}`);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from AI");
    }

    console.log("Successfully parsed erg screen");
    const parsed = JSON.parse(content);

    return new Response(JSON.stringify({ workout: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error parsing erg screen:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
