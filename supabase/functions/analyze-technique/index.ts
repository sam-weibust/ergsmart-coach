import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonOk(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonErr(msg: string, status = 400, detail?: string) {
  console.error(`analyze-technique ERROR (${status}): ${msg}${detail ? " | " + detail : ""}`);
  return new Response(JSON.stringify({ error: msg, detail: detail ?? null }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  console.log("analyze-technique: request received", req.method, new Date().toISOString());

  // ── CORS preflight ───────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ── Env checks ───────────────────────────────────────────────────────────
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) return jsonErr("ANTHROPIC_API_KEY not configured on server", 500);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonErr("Supabase environment variables not configured", 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── Parse body ───────────────────────────────────────────────────────────
  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch (e: any) {
    return jsonErr("Request body is not valid JSON", 400, e?.message);
  }

  const { user_id, frames, notes, frames_path } = body;

  if (!user_id) return jsonErr("Missing required field: user_id");
  if (!Array.isArray(frames) || frames.length === 0) {
    return jsonErr("Missing required field: frames (must be non-empty array)");
  }

  const totalPayloadKB = Math.round(frames.reduce((a: number, f: string) => a + (f?.length ?? 0), 0) / 1024);
  console.log(`analyze-technique: user=${user_id} | frames received=${frames.length} | payload=${totalPayloadKB}KB`);

  // ── Build image blocks ───────────────────────────────────────────────────
  // Strip data URI prefix — Anthropic expects raw base64 + media_type separately
  const imageBlocks: any[] = [];
  for (let i = 0; i < Math.min(frames.length, 8); i++) {
    const frame = frames[i] as string;
    if (!frame || typeof frame !== "string") {
      console.warn(`analyze-technique: frame ${i + 1} is null/undefined — skipping`);
      continue;
    }

    let mediaType = "image/jpeg";
    let data = frame;

    const match = frame.match(/^data:([^;]+);base64,(.+)$/s);
    if (match) {
      mediaType = match[1];
      data = match[2];
    } else if (!frame.startsWith("data:")) {
      // Already raw base64
      data = frame;
    } else {
      console.warn(`analyze-technique: frame ${i + 1} has unexpected format — skipping`);
      continue;
    }

    if (data.length < 100) {
      console.warn(`analyze-technique: frame ${i + 1} base64 too short (${data.length}) — skipping (blank frame?)`);
      continue;
    }

    console.log(`analyze-technique: frame ${i + 1} | mediaType=${mediaType} | base64 length=${data.length}`);
    imageBlocks.push({
      type: "image",
      source: { type: "base64", media_type: mediaType, data },
    });
  }

  if (imageBlocks.length === 0) {
    return jsonErr(
      "No valid image frames could be parsed from the request. All frames were blank or malformed.",
      400,
      `Received ${frames.length} frames but none had parseable base64 data.`,
    );
  }

  console.log(`analyze-technique: sending ${imageBlocks.length} image blocks to Claude`);

  // ── Fetch user context ───────────────────────────────────────────────────
  const [{ data: profile }, { data: goals }] = await Promise.all([
    supabase.from("profiles").select("full_name, experience_level").eq("id", user_id).maybeSingle(),
    supabase.from("user_goals").select("current_2k_time, goal_2k_time").eq("user_id", user_id).maybeSingle(),
  ]);

  const userContext = [
    profile?.full_name ? `Athlete: ${profile.full_name}` : null,
    profile?.experience_level ? `Experience: ${profile.experience_level}` : null,
    goals?.current_2k_time ? `Current 2K: ${goals.current_2k_time}` : null,
    goals?.goal_2k_time ? `Goal 2K: ${goals.goal_2k_time}` : null,
  ].filter(Boolean).join(" | ");

  // ── System prompt ────────────────────────────────────────────────────────
  const systemPrompt = `You are an elite rowing technique coach with 20+ years experience coaching Olympic and collegiate rowers. You are analyzing a sequence of ${imageBlocks.length} frames extracted from a rowing video at evenly-spaced intervals (10%, 25%, 40%, 55%, 70%, 85% through the stroke cycle).

Analyze the complete stroke sequence across all frames. Cover these six categories with a rating (1-10) and specific observation:
1. Catch Timing — blade entry angle, body compression at catch, timing vs seat
2. Body Sequencing — legs-body-arms order on drive, body opening sequence
3. Drive Phase — leg drive power application, back engagement, force curve shape
4. Finish Position — arm draw completion, body layback angle, blade extraction
5. Recovery — hands-away sequence, body rock forward, controlled seat speed
6. Stroke Efficiency — ratio, rush/check, balance, stroke-to-stroke consistency

Return ONLY a valid JSON object, no markdown, no explanation outside the JSON:
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

  // ── Call Claude ──────────────────────────────────────────────────────────
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);

  const claudeRequestBody = {
    model: "claude-opus-4-5-20250514",
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{
      role: "user",
      content: [
        ...imageBlocks,
        {
          type: "text",
          text: `${userContext ? userContext + "\n" : ""}Athlete notes: ${notes || "None"}\n\nAnalyze these ${imageBlocks.length} frames extracted at evenly-spaced intervals through the stroke. Return only the JSON object described in the system prompt.`,
        },
      ],
    }],
  };

  console.log(`analyze-technique: calling Anthropic API | model=${claudeRequestBody.model} | images=${imageBlocks.length} | max_tokens=${claudeRequestBody.max_tokens}`);

  let claudeData: any;
  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(claudeRequestBody),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const claudeRawText = await claudeRes.text();
    console.log(`analyze-technique: Anthropic HTTP ${claudeRes.status} | response length=${claudeRawText.length}`);
    console.log("analyze-technique: Anthropic raw response (first 500 chars):", claudeRawText.slice(0, 500));

    if (!claudeRes.ok) {
      return jsonErr(
        `Anthropic API error: ${claudeRes.status}`,
        502,
        claudeRawText.slice(0, 1000),
      );
    }

    try {
      claudeData = JSON.parse(claudeRawText);
    } catch (e: any) {
      return jsonErr("Failed to parse Anthropic API response as JSON", 502, claudeRawText.slice(0, 500));
    }
  } catch (e: any) {
    clearTimeout(timeout);
    if (e?.name === "AbortError") {
      return jsonErr("AI analysis timed out after 55 seconds. Try with a shorter video clip.", 504);
    }
    return jsonErr(`Network error calling Anthropic API: ${e?.message}`, 502);
  }

  // ── Parse critique JSON from Claude response ──────────────────────────────
  const rawText = claudeData?.content?.[0]?.text ?? "";
  console.log(`analyze-technique: Claude response text length=${rawText.length}`);
  console.log("analyze-technique: Claude text (first 300 chars):", rawText.slice(0, 300));

  if (!rawText) {
    return jsonErr(
      "Claude returned an empty response",
      502,
      `Stop reason: ${claudeData?.stop_reason ?? "unknown"} | Content array length: ${claudeData?.content?.length ?? 0}`,
    );
  }

  let critique: any;
  try {
    // Strip any accidental markdown fences
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/im, "")
      .replace(/\s*```\s*$/im, "")
      .trim();
    critique = JSON.parse(cleaned);
  } catch (e: any) {
    console.error("analyze-technique: JSON parse failed. Raw text:", rawText.slice(0, 600));
    return jsonErr(
      "AI response could not be parsed as JSON. The model returned unstructured text.",
      502,
      rawText.slice(0, 400),
    );
  }

  // Basic validation
  if (typeof critique.overallScore !== "number") {
    return jsonErr("AI response JSON missing required field: overallScore", 502, JSON.stringify(critique).slice(0, 300));
  }

  // ── Store analysis ────────────────────────────────────────────────────────
  const { error: insertErr } = await supabase.from("technique_analyses").insert({
    user_id,
    video_path: frames_path ?? null,
    notes: notes ?? null,
    critique,
  } as any);
  if (insertErr) console.error("analyze-technique: failed to save analysis:", insertErr.message);

  console.log(`analyze-technique: complete | score=${critique.overallScore} | user=${user_id}`);
  return jsonOk({ critique });
});
