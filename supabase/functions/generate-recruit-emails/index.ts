import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const {
      school,
      division,
      profile,
      goals,
      gpa,
      gender,
      prediction,
    } = await req.json();

    // Anthropic key
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY)
      throw new Error("ANTHROPIC_API_KEY is not configured");

    const genderCategory = gender === "womens" ? "Women's" : "Men's";
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
You are a college rowing recruitment expert who helps athletes craft professional outreach emails to coaches.

You must return ONLY valid JSON matching this structure:

{
  "coaches": [
    {
      "name": "string",
      "title": "string",
      "email": "string",
      "confidence": "verified | likely | pattern-based",
      "notes": "string"
    }
  ],
  "general_email": "string or null",
  "email_campaign": [
    {
      "sequence_number": number,
      "email_type": "string",
      "timing": "string",
      "subject": "string",
      "body": "string",
      "tips": "string"
    }
  ],
  "campaign_tips": ["string", "string", "string"]
}

RULES:
- Coach emails MUST be realistic and follow institutional .edu patterns.
- NEVER fabricate personal emails.
- Provide 2–4 coaches.
- Provide a 4‑email recruitment sequence.
- Keep emails concise, professional, and realistic.
`;

    // USER PROMPT
    const userPrompt = `
Generate coach contact information and a full recruitment email campaign for:

SCHOOL: ${school} (${division}) - ${genderCategory} Rowing

ATHLETE PROFILE:
- Gender/Category: ${genderCategory}
- Age: ${profile.age || "Unknown"}
- Height: ${heightFeetStr}
- Weight: ${weightLbs ? weightLbs + " lbs" : "Unknown"}
- Experience: ${profile.experience_level || "Unknown"}
- GPA: ${gpa || "Not provided"}
- 2K Time: ${goals?.current_2k_time || "Not recorded"}
- 5K Time: ${goals?.current_5k_time || "Not recorded"}
- 6K Time: ${goals?.current_6k_time || "Not recorded"}
${prediction ? `- Predicted Tier: ${prediction.predicted_tier}` : ""}
${prediction ? `- Chance at this school: ${prediction.chance}` : ""}

Return ONLY valid JSON following the schema.
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
        max_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("Anthropic error:", response.status, t);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            error: "Rate limit exceeded. Please try again later.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      throw new Error("Anthropic API error");
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;

    if (!text) throw new Error("No response from AI");

    const result = JSON.parse(text);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-recruit-emails error:", e);
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
    const heightFeetStr = heightInches
      ? `${Math.floor(heightInches / 12)}'${heightInches % 12}"`
      : "Unknown";

    // -------------------------
    // SYSTEM PROMPT
    // -------------------------
    const systemPrompt = `
You are a college rowing recruitment expert who helps athletes craft professional outreach emails to coaches.

You must return ONLY valid JSON matching this structure:

{
  "coaches": [
    {
      "name": "string",
      "title": "string",
      "email": "string",
      "confidence": "verified | likely | pattern-based",
      "notes": "string"
    }
  ],
  "general_email": "string or null",
  "email_campaign": [
    {
      "sequence_number": number,
      "email_type": "string",
      "timing": "string",
      "subject": "string",
      "body": "string",
      "tips": "string"
    }
  ],
  "campaign_tips": ["string", "string", "string"]
}

IMPORTANT RULES:
- Coach emails MUST be realistic and follow institutional .edu patterns.
- NEVER fabricate personal emails.
- Mark emails as "verified" ONLY if they follow known public university patterns.
- Provide 2–4 coaches.
- Provide a 4‑email recruitment sequence.
- Keep emails concise, professional, and realistic.
`;

    // -------------------------
    // USER PROMPT
    // -------------------------
    const userPrompt = `
Generate coach contact information and a full recruitment email campaign for:

SCHOOL: ${school} (${division}) - ${genderCategory} Rowing

ATHLETE PROFILE:
- Gender/Category: ${genderCategory}
- Age: ${profile.age || "Unknown"}
- Height: ${heightFeetStr}
- Weight: ${weightLbs ? weightLbs + " lbs" : "Unknown"}
- Experience: ${profile.experience_level || "Unknown"}
- GPA: ${gpa || "Not provided"}
- 2K Time: ${goals?.current_2k_time || "Not recorded"}
- 5K Time: ${goals?.current_5k_time || "Not recorded"}
- 6K Time: ${goals?.current_6k_time || "Not recorded"}
${prediction ? `- Predicted Tier: ${prediction.predicted_tier}` : ""}
${prediction ? `- Chance at this school: ${prediction.chance}` : ""}

Return ONLY valid JSON following the schema.
`;

    // -------------------------
    // CALL ANTHROPIC
    // -------------------------
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
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("Anthropic error:", response.status, t);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            error: "Rate limit exceeded. Please try again later.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      throw new Error("Anthropic API error");
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;

    if (!text) throw new Error("No response from AI");

    // Parse JSON returned by Anthropic
    const result = JSON.parse(text);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-recruit-emails error:", e);
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
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "recruitment_emails",
              description: "Return coach contacts and a recruitment email campaign",
              parameters: {
                type: "object",
                properties: {
                  coaches: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Coach's full name" },
                        title: { type: "string", description: "e.g. Head Coach, Assistant Coach, Recruiting Coordinator" },
                        email: { type: "string", description: "Institutional .edu email address" },
                        confidence: { type: "string", enum: ["verified", "likely", "pattern-based"], description: "How confident we are in this email" },
                        notes: { type: "string", description: "Any relevant notes about this coach" }
                      },
                      required: ["name", "title", "email", "confidence"],
                      additionalProperties: false
                    },
                    description: "2-4 coaching staff contacts with institutional emails"
                  },
                  general_email: {
                    type: "string",
                    description: "General team/recruiting email like rowing@university.edu"
                  },
                  email_campaign: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        sequence_number: { type: "number", description: "1-4 sequence order" },
                        email_type: { type: "string", description: "e.g. Initial Introduction, Athletic Resume Follow-up, Campus Visit Request, Season Update" },
                        timing: { type: "string", description: "When to send relative to first email, e.g. 'Day 1', '1 week later', '3 weeks later', '6 weeks later'" },
                        subject: { type: "string", description: "Email subject line" },
                        body: { type: "string", description: "Full email body text. Use [Your Name] as placeholder for athlete name." },
                        tips: { type: "string", description: "Tips for this specific email" }
                      },
                      required: ["sequence_number", "email_type", "timing", "subject", "body", "tips"],
                      additionalProperties: false
                    },
                    description: "4-email recruitment campaign sequence"
                  },
                  campaign_tips: {
                    type: "array",
                    items: { type: "string" },
                    description: "3-5 general tips for the recruitment email campaign"
                  }
                },
                required: ["coaches", "email_campaign", "campaign_tips"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "recruitment_emails" } },
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

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-recruit-emails error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
