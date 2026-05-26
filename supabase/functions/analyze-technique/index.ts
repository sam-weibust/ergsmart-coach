import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, hashKey, TTL } from "../_shared/cache.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "claude-sonnet-4-20250514";

function jsonOk(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonErr(msg: string, status = 400, detail?: string) {
  console.error(`analyze-technique ERROR (${status}): ${msg}${detail ? " | " + detail : ""}`);
  return new Response(JSON.stringify({ error: msg, detail: detail ?? null }), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) return jsonErr("ANTHROPIC_API_KEY not configured on server", 500);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return jsonErr("Supabase environment variables not configured", 500);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch (e: any) { return jsonErr("Request body is not valid JSON", 400, e?.message); }

  const { user_id, frames, notes, frames_path } = body;

  if (!user_id) return jsonErr("Missing required field: user_id");
  if (!Array.isArray(frames) || frames.length === 0) return jsonErr("Missing required field: frames (must be non-empty array)");

  // Cache by hash of first frame data (same video = same frames = same analysis)
  const framesHash = hashKey(frames.slice(0, 2).map((f: string) => f?.slice(0, 100)));
  const cacheKey = `technique_${framesHash}`;
  const cached = await getCached(supabase, cacheKey);
  if (cached) {
    await logUsage(supabase, { user_id, function_name: "analyze-technique", model: MODEL, input_tokens: 0, output_tokens: 0, cache_hit: true });
    return jsonOk(cached);
  }

  const imageBlocks: any[] = [];
  for (let i = 0; i < Math.min(frames.length, 8); i++) {
    const frame = frames[i] as string;
    if (!frame || typeof frame !== "string") continue;

    let mediaType = "image/jpeg";
    let data = frame;

    const match = frame.match(/^data:([^;]+);base64,(.+)$/s);
    if (match) { mediaType = match[1]; data = match[2]; }
    else if (!frame.startsWith("data:")) { data = frame; }
    else continue;

    if (data.length < 100) continue;
    imageBlocks.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
  }

  if (imageBlocks.length === 0) {
    return jsonErr("No valid image frames could be parsed from the request.", 400, `Received ${frames.length} frames but none had parseable base64 data.`);
  }

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

  const systemPrompt = `Elite rowing technique coach analyzing ${imageBlocks.length} frames at evenly-spaced intervals through the stroke cycle.

Rate each category 1-10 with specific observation:
1. Catch Timing — blade entry, compression, timing
2. Body Sequencing — legs-body-arms order
3. Drive Phase — leg drive, back engagement
4. Finish Position — arm draw, layback, extraction
5. Recovery — hands-away, rock forward, seat speed
6. Stroke Efficiency — ratio, rush/check, balance

Return ONLY valid JSON:
{"overallScore":8,"phase":"drive","summary":"...","categories":[{"name":"Catch Timing","rating":7,"notes":"..."}],"strengths":["..."],"issues":[{"area":"...","problem":"...","fix":"..."}],"drills":["..."],"priorityFix":"..."}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);

  const claudeRequestBody = {
    model: MODEL,
    max_tokens: 800,
    system: systemPrompt,
    messages: [{
      role: "user",
      content: [
        ...imageBlocks,
        { type: "text", text: `${userContext ? userContext + "\n" : ""}Notes: ${notes || "None"}\n\nAnalyze these ${imageBlocks.length} frames. Return only the JSON.` },
      ],
    }],
  };

  let claudeData: any;
  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify(claudeRequestBody),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const claudeRawText = await claudeRes.text();
    if (!claudeRes.ok) return jsonErr(`Anthropic API error: ${claudeRes.status}`, 502, claudeRawText.slice(0, 1000));
    try { claudeData = JSON.parse(claudeRawText); } catch (e: any) {
      return jsonErr("Failed to parse Anthropic API response as JSON", 502, claudeRawText.slice(0, 500));
    }
  } catch (e: any) {
    clearTimeout(timeout);
    if (e?.name === "AbortError") return jsonErr("AI analysis timed out after 55 seconds.", 504);
    return jsonErr(`Network error calling Anthropic API: ${e?.message}`, 502);
  }

  const usage = claudeData?.usage ?? {};
  const rawText = claudeData?.content?.[0]?.text ?? "";
  if (!rawText) return jsonErr("Claude returned an empty response", 502);

  let critique: any;
  try {
    const cleaned = rawText.replace(/^```(?:json)?\s*/im, "").replace(/\s*```\s*$/im, "").trim();
    critique = JSON.parse(cleaned);
  } catch (e: any) {
    return jsonErr("AI response could not be parsed as JSON.", 502, rawText.slice(0, 400));
  }

  if (typeof critique.overallScore !== "number") {
    return jsonErr("AI response JSON missing required field: overallScore", 502);
  }

  // Store analysis in DB
  const { error: insertErr } = await supabase.from("technique_analyses").insert({
    user_id, video_path: frames_path ?? null, notes: notes ?? null, critique,
  } as any);
  if (insertErr) console.error("analyze-technique: failed to save analysis:", insertErr.message);

  const result = { critique };
  // Cache permanently — same video always gets same analysis
  await setCached(supabase, cacheKey, result, TTL.PERMANENT, MODEL, usage.input_tokens, usage.output_tokens);
  await logUsage(supabase, { user_id, function_name: "analyze-technique", model: MODEL, input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, cache_hit: false });

  return jsonOk(result);
});
