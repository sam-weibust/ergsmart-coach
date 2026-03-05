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
    const { frames, notes } = await req.json();

    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return new Response(JSON.stringify({ error: "No video frames provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`Analyzing ${frames.length} frames for rowing form critique`);

    const imageContent = frames.map((frame: string) => ({
      type: "image_url" as const,
      image_url: { url: frame },
    }));

    const userContent: any[] = [
      ...imageContent,
      {
        type: "text",
        text: `Analyze these frames extracted from a rowing video. ${notes ? `The rower notes: "${notes}"` : ""}

Please provide a detailed rowing form critique.`,
      },
    ];

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
            role: "system",
            content: `You are an expert rowing coach specializing in technique analysis. You're analyzing still frames extracted from a rowing video. Analyze the rower's form and provide detailed, actionable feedback.

Structure your response as JSON with this format:
{
  "overallScore": <number 1-10>,
  "phase": "catch" | "drive" | "finish" | "recovery" | "multiple",
  "summary": "1-2 sentence overall assessment",
  "strengths": ["good thing 1", "good thing 2"],
  "issues": [
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
