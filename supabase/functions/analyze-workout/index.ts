import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, tokensFrom, hashKey, TTL } from "../_shared/cache.ts";
import { preflight, recordApiError, recordApiSuccess, recordUsage, jsonError } from "../_shared/aiGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FN = "analyze-workout";
const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 600;

/**
 * Request contract (hard contract with PostWorkoutScreen.buildPayload):
 *
 *   {
 *     workoutType: "erg",
 *     user_id: string,
 *     workout: {
 *       id, workout_id, distance, elapsed_time, avg_split_seconds, avg_watts,
 *       avg_stroke_rate, max_hr, min_hr, peak_force_n, drive_efficiency,
 *       force_curve_10: number[10]
 *     }
 *   }
 *
 * Older clients (strength forms, ErgWorkoutSection, TodaysWorkouts) still post
 * differently-shaped workout objects, so parsing is tolerant: the contract
 * fields are read by name, any other SCALAR field is passed through so legacy
 * strength payloads still produce sensible feedback, and every array/object is
 * dropped except a 10-point force curve. That last rule is the important one --
 * raw per-stroke arrays and full-resolution force curves are tens of thousands
 * of tokens of noise and must never reach Anthropic.
 */

/** Fields named in the contract, in the order they should be presented. */
const CONTRACT_FIELDS = [
  "distance",
  "elapsed_time",
  "avg_split_seconds",
  "avg_watts",
  "avg_stroke_rate",
  "max_hr",
  "min_hr",
  "peak_force_n",
  "drive_efficiency",
] as const;

/** Keys that are known bulk payloads — dropped even if they are scalars. */
const BULK_KEYS = new Set([
  "force_curve",
  "forceCurve",
  "force_curve_raw",
  "avgCurve",
  "avg_curve",
  "curve",
  "strokes",
  "stroke_data",
  "strokeData",
  "samples",
  "raw",
  "raw_data",
  "splits",
  "split_data",
  "intervals",
  "hr_series",
  "heart_rate_series",
  "power_series",
]);

const MAX_STRING_LEN = 200;

function sanitizeWorkout(input: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!input || typeof input !== "object") return out;
  const w = input as Record<string, unknown>;

  const num = (v: unknown): number | null =>
    typeof v === "number" && isFinite(v) ? v : null;

  // 1. Contract metrics, by name.
  for (const k of CONTRACT_FIELDS) {
    const v = num(w[k]);
    if (v !== null) out[k] = v;
  }

  // 2. The 10-point curve — the only array allowed through, hard-capped.
  const curve = w.force_curve_10;
  if (Array.isArray(curve)) {
    const pts = curve
      .slice(0, 10)
      .map((v) => (typeof v === "number" && isFinite(v) ? Math.round(v) : null))
      .filter((v): v is number => v !== null);
    if (pts.length) out.force_curve_10 = pts;
  }

  // 3. Backward compatibility: let unknown SCALARS through (legacy strength
  //    payloads use exercise/sets/reps/weight, legacy erg uses duration/
  //    avg_split), but never an array or a nested object.
  for (const [k, v] of Object.entries(w)) {
    if (k in out) continue;
    if (k === "id" || k === "workout_id" || k === "user_id") continue;
    if (BULK_KEYS.has(k)) continue;
    if (v === null || v === undefined) continue;
    if (typeof v === "number") {
      if (isFinite(v)) out[k] = v;
    } else if (typeof v === "boolean") {
      out[k] = v;
    } else if (typeof v === "string") {
      if (v.length <= MAX_STRING_LEN) out[k] = v;
    }
    // arrays + objects: intentionally dropped
  }

  return out;
}

/** Compact "key: value" lines — cheaper than pretty-printed JSON. */
function formatMetrics(w: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(w)) {
    lines.push(`- ${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
  }
  return lines.length ? lines.join("\n") : "- (no metrics supplied)";
}

const SYSTEM_PROMPT = `You are CrewSync AI, a rowing and strength training analyst.

Return ONLY a valid JSON object. No markdown, no code fences, no text outside the JSON.

Schema:
{
  "overallRating": "excellent" | "good" | "average" | "needs_improvement",
  "summary": "1-2 sentences on how the piece went",
  "strengths": ["max 2 short items"],
  "improvements": ["max 2 short items"],
  "recommendation": "1 sentence, one specific thing for the next session",
  "motivationalMessage": "1 short encouraging sentence",
  "progressNote": "optional 1 sentence on trend vs recent work; omit the key entirely if there is no trend data"
}

Rules:
- Total prose across all fields: 3-4 sentences. Be specific and concrete, never generic.
- Reference the actual numbers given.
- avg_split_seconds is seconds per 500m. force_curve_10 is a 10-point normalised drive force curve (catch to finish); a smooth single-peaked curve is good, a late or double peak means the drive sequence needs work.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError(corsHeaders, 400, "Invalid JSON body");
    }

    const {
      workoutType,
      workout,
      profile: bodyProfile,
      recentWorkouts = [],
    } = body as Record<string, any>;
    const user_id = body.user_id || bodyProfile?.id || null;

    if (!workout || typeof workout !== "object") {
      return new Response(JSON.stringify({ error: "Missing workout data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const metrics = sanitizeWorkout(workout);

    // Cache per workout — once generated, never regenerate.
    const workoutId =
      workout.id || workout.workout_id || hashKey({ metrics, workoutType });
    const cacheKey = `workout_feedback:${workoutId}`;

    const cached = await getCached(supabase, cacheKey);
    if (cached) {
      await logUsage(supabase, {
        user_id,
        function_name: FN,
        model: MODEL,
        cache_hit: true,
      });
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    // Failsafe 9 + 1: circuit breaker + per-user daily limits (after cache check).
    const blocked = await preflight(supabase, {
      userId: user_id,
      functionName: FN,
      corsHeaders,
    });
    if (blocked) return blocked;

    // Athlete context is optional and cheap; only fetched when not supplied.
    let profile = bodyProfile;
    if (!profile && user_id) {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, experience_level, age, weight")
        .eq("id", user_id)
        .maybeSingle();
      profile = data;
    }

    const contextLines: string[] = [];
    if (profile?.experience_level) contextLines.push(`- experience: ${profile.experience_level}`);
    if (profile?.age) contextLines.push(`- age: ${profile.age}`);
    if (profile?.weight) contextLines.push(`- weight_kg: ${profile.weight}`);

    // Only a compact digest of recent work, and only scalars.
    const recentLines = Array.isArray(recentWorkouts)
      ? recentWorkouts
          .slice(0, 5)
          .map((w: any) =>
            w && typeof w === "object"
              ? `- ${w.workout_date ?? "?"}: ${w.distance ?? "?"}m ${w.duration ?? ""}`.trim()
              : null,
          )
          .filter(Boolean)
      : [];

    const userMessage = [
      `Workout type: ${typeof workoutType === "string" ? workoutType : "general"}`,
      "",
      "METRICS:",
      formatMetrics(metrics),
      contextLines.length ? `\nATHLETE:\n${contextLines.join("\n")}` : "",
      recentLines.length ? `\nRECENT WORKOUTS:\n${recentLines.join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        stream: false,
        // No cache_control: this system prompt is ~250 tokens, far below the
        // 4096-token minimum cacheable prefix for claude-haiku-4-5, so a
        // breakpoint here would be a silent no-op.
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!anthropicResponse.ok) {
      console.error(
        "Anthropic error:",
        anthropicResponse.status,
        await anthropicResponse.text(),
      );
      await recordApiError(supabase, FN);
      return jsonError(corsHeaders, 503, "AI service unavailable");
    }
    await recordApiSuccess(supabase, FN);

    const result = await anthropicResponse.json();
    const usage = tokensFrom(result?.usage);
    const text = result?.content?.[0]?.text ?? "{}";

    let feedback: any;
    try {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start === -1 || end === -1) throw new Error("No JSON found");
      feedback = JSON.parse(text.slice(start, end + 1));
    } catch {
      // Fallback structure if Claude didn't return valid JSON.
      feedback = {
        overallRating: "good",
        summary: String(text).slice(0, 300) || "Workout logged successfully.",
        strengths: ["Completed the workout"],
        improvements: ["Continue tracking your metrics"],
        recommendation: "Keep up the consistent training.",
        motivationalMessage: "Great work — every session counts!",
      };
    }

    await setCached(
      supabase,
      cacheKey,
      { feedback },
      TTL.PERMANENT,
      MODEL,
      usage.input_tokens,
      usage.output_tokens,
    );
    await logUsage(supabase, {
      user_id,
      function_name: FN,
      model: MODEL,
      ...usage,
      cache_hit: false,
    });
    await recordUsage(supabase, user_id, usage.input_tokens + usage.output_tokens);

    return new Response(JSON.stringify({ feedback }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (e) {
    console.error("analyze-workout error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
