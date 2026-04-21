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

Deno.serve(async (req) => {
  console.log("analyze-technique: received request", req.method);

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) return jsonErr("ANTHROPIC_API_KEY not configured", 500);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { return jsonErr("Invalid JSON body"); }

  const { user_id, frames, notes, frames_path } = body;

  if (!user_id) return jsonErr("Missing user_id");
  if (!Array.isArray(frames) || frames.length === 0) return jsonErr("Missing frames array");

  console.log(`analyze-technique: processing ${frames.length} frames for user ${user_id}`);

  // Fetch user profile for context
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user_id).maybeSingle();
  const { data: goals } = await supabase.from("user_goals").select("*").eq("user_id", user_id).maybeSingle();

  const userContext = [
    `Athlete: ${profile?.full_name || "Unknown"}`,
    `Experience: ${profile?.experience_level || "unknown"}`,
    goals?.current_2k_time ? `Current 2K: ${goals.current_2k_time}` : null,
    goals?.goal_2k_time ? `Goal 2K: ${goals.goal_2k_time}` : null,
  ].filter(Boolean).join(" | ");

  const systemPrompt = `You are an elite rowing technique coach with 20+ years experience coaching Olympic and collegiate rowers. You are analyzing a sequence of ${frames.length} frames extracted from a rowing video at evenly-spaced intervals (10%, 25%, 40%, 55%, 70%, 85% through the stroke cycle).

Analyze the complete stroke sequence across all frames. Cover these six categories with a rating (1-10) and specific observation:
1. Catch Timing — blade entry angle, body compression at catch, timing vs seat
2. Body Sequencing — legs-body-arms order on drive, body opening sequence
3. Drive Phase — leg drive power application, back engagement, force curve shape
4. Finish Position — arm draw completion, body layback angle, blade extraction
5. Recovery — hands-away sequence, body rock forward, controlled seat speed
6. Stroke Efficiency — ratio, rush/check, balance, stroke-to-stroke consistency

Return ONLY a valid JSON object, no markdown:
{
  "overallScore": <1-10>,
  "phase": "<most visible phase in frames>",
  "summary": "<2-3 sentence overall assessment>",
  "categories": [
    {"name": "Catch Timing", "rating": <1-10>, "notes": "<specific observation>"},
    {"name": "Body Sequencing", "rating": <1-10>, "notes": "<specific observation>"},
    {"name": "Drive Phase", "rating": <1-10>, "notes": "<specific observation>"},
    {"name": "Finish Position", "rating": <1-10>, "notes": "<specific observation>"},
    {"name": "Recovery", "rating": <1-10>, "notes": "<specific observation>"},
    {"name": "Stroke Efficiency", "rating": <1-10>, "notes": "<specific observation>"}
  ],
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "issues": [
    {"area": "<area>", "problem": "<what is wrong>", "fix": "<specific correction>"}
  ],
  "drills": ["<drill 1>", "<drill 2>", "<drill 3>"],
  "priorityFix": "<single most important thing to fix first>"
}`;

  // Build image blocks from base64 frames
  const imageBlocks: any[] = [];
  for (const frame of frames.slice(0, 8)) {
    const match = (frame as string).match(/^data:([^;]+);base64,(.+)$/);
    if (!match) continue;
    const [, mediaType, data] = match;
    imageBlocks.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
  }

  if (imageBlocks.length === 0) return jsonErr("No valid image frames could be parsed");

  console.log(`analyze-technique: sending ${imageBlocks.length} image blocks to Claude`);

  // Call Claude with 45-second timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  let claudeData: any;
  try {
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
        messages: [{
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: `${userContext}\nAthlete notes: ${notes || "None"}\n\nAnalyze these ${imageBlocks.length} frames (extracted at 10%, 25%, 40%, 55%, 70%, 85% through the stroke). Return only the JSON object.`,
            },
          ],
        }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error("Claude API error:", claudeRes.status, errText.slice(0, 500));
      return jsonErr(`AI service error: ${claudeRes.status}`, 500);
    }

    claudeData = await claudeRes.json();
  } catch (e: any) {
    clearTimeout(timeout);
    const msg = e?.name === "AbortError" ? "AI request timed out" : (e?.message ?? "AI request failed");
    console.error("Claude fetch error:", msg);
    return jsonErr(msg, 500);
  }

  const rawText = claudeData?.content?.[0]?.text ?? "";
  console.log("analyze-technique: got Claude response, length:", rawText.length);

  let critique: any;
  try {
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    critique = JSON.parse(cleaned);
  } catch {
    console.error("JSON parse failed, raw:", rawText.slice(0, 300));
    return jsonErr("Failed to parse AI response as JSON", 500);
  }

  // Store analysis
  const { error: insertErr } = await supabase.from("technique_analyses").insert({
    user_id,
    video_path: frames_path ?? null,
    notes: notes ?? null,
    critique,
  } as any);
  if (insertErr) console.error("Failed to save analysis:", insertErr.message);

  console.log("analyze-technique: complete, score:", critique.overallScore);
  return jsonOk({ critique });
});
