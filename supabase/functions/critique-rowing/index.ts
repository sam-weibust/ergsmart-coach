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
    const { frames, notes } = await req.json();

    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return new Response(JSON.stringify({ error: "No video frames provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ⭐ USE YOUR ANTHROPIC KEY
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    console.log(`Analyzing ${frames.length} frames for rowing form critique`);

    // Anthropic expects image blocks like:
    // { type: "image", source: { type: "url", url: "..." } }
    const imageBlocks = frames.map((url: string) => ({
      type: "image",
      source: { type: "url", url },
    }));

    const userPrompt = `
Analyze these rowing frames. ${notes ? `The rower notes: "${notes}".` : ""}

Provide a JSON critique with this structure:
{
  "overallScore": <number 1-10>,
  "phase": "catch" | "drive" | "finish" | "recovery" | "multiple",
  "summary": "1-2 sentence overall assessment",
  "strengths": ["good thing 1", "good thing 2"],
  "issues": [
    { "area": "body part/phase", "problem": "what's wrong", "fix": "how to fix it" }
  ],
  "drills": ["drill 1", "drill 2"],
  "priorityFix": "The single most important thing to work on first"
}
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
        max_tokens: 4096,
        messages: [
          {
            role: "system",
            content:
              "You are an expert rowing coach specializing in technique analysis. Provide precise, actionable feedback.",
          },
          {
            role: "user",
            content: [...imageBlocks, { type: "text", text: userPrompt }],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error(`Anthropic error: ${response.status}`);
    }

    const data = await response.json();

    // Anthropic returns content blocks
    const text = data.content?.[0]?.text;
    if (!text) throw new Error("No response from AI");

    const critique = JSON.parse(text);

    console.log("Successfully analyzed rowing form");

    return new Response(JSON.stringify({ critique }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error analyzing rowing form:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
    { "area": "body part/phase", "problem": "what's wrong", "fix": "how to fix it" }
  ],
  "drills": ["drill 1 to improve form", "drill 2"],
  "priorityFix": "The single most important thing to work on first"
}

Be specific and constructive. Reference the phases of the rowing stroke (catch, drive, finish, recovery). If you can't see enough detail, say so honestly rather than guessing.`
          },
          {
            role: "user",
            content: userContent,
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

    console.log("Successfully analyzed rowing form");

    const critique = JSON.parse(content);

    return new Response(JSON.stringify({ critique }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error analyzing rowing form:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
