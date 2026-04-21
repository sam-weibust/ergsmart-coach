import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch {}

  const { user_id, frames, notes, video_path } = body;

  if (!user_id) {
    return new Response(JSON.stringify({ error: "Missing user_id" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const [profileRes, goalsRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user_id).maybeSingle(),
    supabase.from("user_goals").select("*").eq("user_id", user_id).maybeSingle(),
  ]);
  const profile = profileRes.data;
  const goals = goalsRes.data;

  const userContext = `
Athlete: ${profile?.full_name || "Unknown"} | Level: ${profile?.experience_level || "unknown"}
2K: ${goals?.current_2k_time || "?"} → ${goals?.goal_2k_time || "?"}
`.trim();

  const systemPrompt = `You are an elite rowing technique coach. Analyze the rowing technique frames.

Cover these 6 categories with a rating (1-10) each:
1. Catch Timing, 2. Body Sequencing, 3. Drive Phase, 4. Finish Position, 5. Recovery, 6. Stroke Efficiency

Return ONLY valid JSON:
{
  "overallScore": <1-10>,
  "phase": "<phase>",
  "summary": "<2-3 sentences>",
  "categories": [{"name":"...","rating":<1-10>,"notes":"..."},...],
  "strengths": ["..."],
  "issues": [{"area":"...","problem":"...","fix":"..."}],
  "drills": ["..."],
  "priorityFix": "<single most important fix>"
}`;

  // If frames are provided, use vision
  let messageContent: any[];
  if (Array.isArray(frames) && frames.length > 0) {
    const imageBlocks: any[] = [];
    for (const frame of frames.slice(0, 6)) {
      try {
        const match = (frame as string).match(/^data:([^;]+);base64,(.+)$/);
        if (!match) continue;
        imageBlocks.push({ type: "image", source: { type: "base64", media_type: match[1], data: match[2] } });
      } catch {}
    }
    messageContent = [
      ...imageBlocks,
      { type: "text", text: `${userContext}\nNotes: ${notes || "None"}\nAnalyze technique. Return only JSON.` },
    ];
  } else {
    messageContent = [
      { type: "text", text: `${userContext}\nNotes: ${notes || "None"}\nProvide technique analysis. Return only JSON.` },
    ];
  }

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
      messages: [{ role: "user", content: messageContent }],
    }),
  });

  if (!claudeRes.ok) {
    const t = await claudeRes.text();
    console.error("Claude error:", claudeRes.status, t);
    return new Response(JSON.stringify({ error: "AI service unavailable" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const claudeData = await claudeRes.json();
  const rawText = claudeData?.content?.[0]?.text ?? "";

  let critique: any;
  try {
    const cleaned = rawText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    critique = JSON.parse(cleaned);
  } catch {
    return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await supabase.from("technique_analyses").insert({
    user_id,
    video_path: video_path ?? null,
    notes: notes ?? null,
    critique,
  } as any);

  return new Response(JSON.stringify({ critique }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
