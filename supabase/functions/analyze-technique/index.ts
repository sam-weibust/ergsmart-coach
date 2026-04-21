import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonOk(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonErr(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) return jsonErr("ANTHROPIC_API_KEY not configured", 500);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { return jsonErr("Invalid JSON body"); }

  const { user_id, frames, notes, video_path } = body;

  if (!user_id) return jsonErr("Missing user_id");
  if (!Array.isArray(frames) || frames.length === 0) return jsonErr("Missing frames array");

  // Fetch user profile for context
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user_id).maybeSingle();
  const { data: goals } = await supabase.from("user_goals").select("*").eq("user_id", user_id).maybeSingle();

  const userContext = `
Athlete: ${profile?.full_name || "Unknown"} | Type: ${profile?.user_type || "rower"} | Level: ${profile?.experience_level || "unknown"}
Goals — 2K: ${goals?.current_2k_time || "?"} → ${goals?.goal_2k_time || "?"}
`.trim();

  const systemPrompt = `You are an elite rowing technique coach with 20+ years of experience coaching Olympic and collegiate rowers. Analyze the rowing technique frames provided.

Cover these categories with a rating (1-10) and specific notes:
1. Catch Timing — early/late catch, blade entry angle, posture at catch
2. Body Sequencing — legs-body-arms order on the drive, timing of body opening
3. Drive Phase — leg drive power, back engagement, force application
4. Finish Position — arm draw completion, body angle at finish, blade extraction
5. Recovery — hands away first, body rock forward timing, seat speed
6. Stroke Efficiency — check, rush, balance, ratio, consistency

Return ONLY a valid JSON object with this exact structure:
{
  "overallScore": <number 1-10>,
  "phase": "<most prominent phase visible in frames>",
  "summary": "<2-3 sentence overall assessment>",
  "categories": [
    {"name": "Catch Timing", "rating": <1-10>, "notes": "<specific observation>"},
    {"name": "Body Sequencing", "rating": <1-10>, "notes": "<specific observation>"},
    {"name": "Drive Phase", "rating": <1-10>, "notes": "<specific observation>"},
    {"name": "Finish Position", "rating": <1-10>, "notes": "<specific observation>"},
    {"name": "Recovery", "rating": <1-10>, "notes": "<specific observation>"},
    {"name": "Stroke Efficiency", "rating": <1-10>, "notes": "<specific observation>"}
  ],
  "strengths": ["<strength 1>", "<strength 2>"],
  "issues": [
    {"area": "<area name>", "problem": "<what is wrong>", "fix": "<how to correct it>"}
  ],
  "drills": ["<drill 1>", "<drill 2>", "<drill 3>"],
  "priorityFix": "<the single most important thing to fix first>"
}`;

  // Build image content blocks from base64 frames
  const imageBlocks: any[] = [];
  for (const frame of frames.slice(0, 6)) {
    try {
      const match = (frame as string).match(/^data:([^;]+);base64,(.+)$/);
      if (!match) continue;
      const [, mediaType, data] = match;
      imageBlocks.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data },
      });
    } catch {
      continue;
    }
  }

  if (imageBlocks.length === 0) return jsonErr("No valid image frames provided");

  const userMessage = [
    ...imageBlocks,
    {
      type: "text",
      text: `${userContext}\n\nAthlete notes: ${notes || "None provided"}\n\nAnalyze these ${imageBlocks.length} frames of my rowing technique. Return only the JSON object.`,
    },
  ];

  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!claudeRes.ok) {
    const errText = await claudeRes.text();
    console.error("Claude API error:", claudeRes.status, errText);
    return jsonErr("AI service unavailable", 500);
  }

  const claudeData = await claudeRes.json();
  const rawText = claudeData?.content?.[0]?.text ?? "";

  let critique: any;
  try {
    // Strip any markdown fences if present
    const cleaned = rawText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    critique = JSON.parse(cleaned);
  } catch {
    console.error("Failed to parse Claude response as JSON:", rawText.slice(0, 500));
    return jsonErr("Failed to parse AI response", 500);
  }

  // Store in technique_analyses
  const { error: insertErr } = await supabase.from("technique_analyses").insert({
    user_id,
    video_path: video_path ?? null,
    notes: notes ?? null,
    critique,
  } as any);
  if (insertErr) console.error("Failed to save analysis:", insertErr.message);

  return jsonOk({ critique });
});
