import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Parsing erg monitor screen photo");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
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
                text: `You are analyzing a photo of a Concept2 erg monitor screen (PM5/PM3) showing workout results from the erg's memory. Extract ALL visible workout data.

Return ONLY valid JSON with this structure:
{
  "workout_type": "steady_state" | "intervals" | "sprint" | "test",
  "distance": <number in meters or null>,
  "duration": "<HH:MM:SS or MM:SS format or null>",
  "avg_split": "<M:SS.s per 500m format or null>",
  "avg_heart_rate": <number or null>,
  "calories": <number or null>,
  "notes": "<any other visible info like stroke rate, date, etc.>"
}

Rules:
- distance should be in meters (e.g. 6000 not 6,000)
- duration in HH:MM:SS or MM:SS format
- avg_split in M:SS.s format (e.g. "1:55.0")
- If the screen shows a 2K, 5K, 6K, or 10K test piece, set workout_type to "test"
- If it shows intervals, set workout_type to "intervals" and note interval details
- Include stroke rate (s/m or SPM) in notes if visible
- If you can't read a value, set it to null
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
