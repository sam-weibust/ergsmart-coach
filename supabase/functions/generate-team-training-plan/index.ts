import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, tokensFrom, TTL } from "../_shared/cache.ts";
import { preflight, recordApiError, recordApiSuccess, jsonError } from "../_shared/aiGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "claude-sonnet-5";

const FALLBACK_PHILOSOPHY = `You are generating training plans following a competitive high school rowing program methodology.

ZONE SYSTEM (paces relative to athlete 2k time per 500m):
UT2: 2k+20-25s, rate 16-20. Pure aerobic base.
UT1: 2k+15-20s, rate 18-24. Moderate aerobic, rate ladders.
AT: 2k+4-9s, rate 26-28. Anaerobic threshold.
TR1: 2k+0-4s, rate 26-32. Threshold, hard pieces.
TR2: below 2k pace, rate 32+. Race specific, peak phase only within 6 weeks of race.

WEEKLY STRUCTURE (erg season Jan-Mar): Mon UT1+lift, Tue lift only, Wed UT2/UT1 high volume, Thu lift only, Fri AT/TR1 quality, Sat lift/rest, Sun off.
WEEKLY STRUCTURE (summer Jun-Aug): Mon lift, Tue TR1 required, Wed lift, Thu lift/UT1, Fri TR1/TR2, Sat lift, Sun off.

3-WEEK LOADING CYCLE: Week 1 easy, Week 2 medium, Week 3 hard, Week 4 recovery (50% volume).

Always specify piece duration/distance, rest interval, stroke rate, warmup, cooldown. Express paces as 2k +/- seconds, never absolute splits.`;

serve(async (req) => {
  console.log("generate-team-training-plan: function started");

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    console.log("generate-team-training-plan: ANTHROPIC_API_KEY present:", !!ANTHROPIC_API_KEY);
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const {
      team_id,
      weeks,
      season_phase,
      practice_days_per_week,
      injured_athletes = [],
      start_week = 1,
      end_week,
      previous_context = "",
    } = await req.json();

    const chunkEnd = end_week ?? Math.min(start_week + 3, weeks);
    const weeksToGenerate = chunkEnd - start_week + 1;

    console.log("generate-team-training-plan: team_id:", team_id, "weeks:", weeks, "chunk:", start_week, "-", chunkEnd);

    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `team_plan:${team_id}:${weeks}:${season_phase || "general"}:${start_week}-${chunkEnd}:${today}`;
    const cached = await getCached(supabase, cacheKey);
    if (cached) {
      console.log("generate-team-training-plan: cache hit");
      await logUsage(supabase, { function_name: "generate-team-training-plan", model: MODEL, input_tokens: 0, output_tokens: 0, cache_hit: true });
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    // Failsafe 9: circuit breaker (after cache check).
    const blocked = await preflight(supabase, { userId: null, functionName: "generate-team-training-plan", corsHeaders });
    if (blocked) return blocked;

    const [loadRes, ergRes] = await Promise.all([
      supabase
        .from("weekly_load_logs")
        .select("user_id, fatigue_score, total_meters")
        .eq("team_id", team_id)
        .order("week_start", { ascending: false })
        .limit(30),
      supabase
        .from("erg_scores")
        .select("user_id, watts, test_type")
        .eq("team_id", team_id)
        .order("recorded_at", { ascending: false })
        .limit(50),
    ]);

    const loadData = loadRes.data;
    const ergScores = ergRes.data;

    let philosophyPrompt = "";
    try {
      const [customPhilRes, defaultPhilRes] = await Promise.all([
        supabase
          .from("team_training_philosophy")
          .select("philosophy")
          .eq("team_id", team_id)
          .maybeSingle(),
        supabase
          .from("default_training_philosophy")
          .select("system_prompt")
          .eq("is_default", true)
          .maybeSingle(),
      ]);

      const customPhil = customPhilRes.data?.philosophy as { system_prompt?: string } | null;
      if (customPhil?.system_prompt) {
        philosophyPrompt = customPhil.system_prompt;
      } else if (defaultPhilRes.data?.system_prompt) {
        philosophyPrompt = defaultPhilRes.data.system_prompt;
      }
    } catch (philErr) {
      console.error("generate-team-training-plan: philosophy fetch threw:", philErr);
    }

    if (philosophyPrompt.length > 1500) {
      philosophyPrompt = philosophyPrompt.slice(0, 1500) + "\n[see full methodology — follow all rules]";
    }
    if (!philosophyPrompt) {
      philosophyPrompt = FALLBACK_PHILOSOPHY;
    }

    const twokScores = ergScores?.filter(e => e.test_type === "2k") || [];
    const avgWatts2k = twokScores.length
      ? twokScores.reduce((acc, e) => acc + (e.watts || 0), 0) / twokScores.length
      : 0;

    // NOTE: this system prompt is NOT prompt-cacheable and deliberately carries
    // no cache_control. It is ~450-550 tokens (philosophy is truncated to 1500
    // chars), well under claude-sonnet-5's 1024-token minimum cacheable prefix,
    // so a breakpoint here is a silent no-op. It is also per-team, since
    // philosophyPrompt comes from team_training_philosophy.
    const systemPrompt = `${philosophyPrompt}

Apply the methodology above to every session in the plan.

- Return the plan as a JSON object; no field may be empty string or null.
- Rest day: type "Rest", warmup "none", workout "Rest day — light stretching only", rest "none", breakup "none", rates "none", cooldown "none".
- All pace targets are 2k +/- seconds per 500m. Never absolute splits.
- Generate every requested week and all 7 days. Do not stop early or truncate.`;

    console.log("generate-team-training-plan: system prompt built, chars:", systemPrompt.length);

    const contextSection = previous_context
      ? `\nContext from previously generated weeks:\n${previous_context}\n`
      : "";

    const prompt = `Generate weeks ${start_week} through ${chunkEnd} of a ${weeks}-week team rowing training plan.
${contextSection}
Season phase: ${season_phase || "general preparation"}
Practice days per week: ${practice_days_per_week || 5}
Injured/restricted athletes: ${JSON.stringify(injured_athletes)}
Team average 2k watts: ${avgWatts2k?.toFixed(0) || "unknown"}
High fatigue athletes: ${JSON.stringify(loadData?.filter(l => (l.fatigue_score || 0) >= 7).map(l => l.user_id) || [])}

Generate EXACTLY ${weeksToGenerate} weeks (week_number ${start_week} through ${chunkEnd}), all 7 days each (practice + rest days).

Session fields:
- type: UT1, UT2, AT, TR1, TR2, or Rest
- warmup: duration and description
- workout: specific piece (e.g. "4x10 minutes at 2k+18s/500m")
- rest: rest interval between pieces
- breakup: stroke rate pattern (e.g. "2/2/2/2/2")
- rates: stroke rates per segment (e.g. "18/20/22/20/18")
- cooldown: duration and description

Varsity gets ~20% more volume than novice. Fatigued athletes get reduced load.

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "weeks": [
    {
      "week_number": ${start_week},
      "phase": "Base",
      "days": [
        {
          "day": "Monday",
          "required": {
            "type": "UT1",
            "warmup": "10 minutes easy rowing",
            "workout": "4x10 minutes at 2k+18s/500m",
            "rest": "3 minutes rest between pieces",
            "breakup": "2/2/2/2/2",
            "rates": "18/20/22/20/18",
            "cooldown": "8 minutes easy"
          },
          "optional": {
            "type": "UT2",
            "warmup": "8 minutes easy",
            "workout": "4x12 minutes at 2k+22s/500m",
            "rest": "1.5 minutes",
            "breakup": "2/2/2/2/2/2",
            "rates": "16/18/16/18/16/18",
            "cooldown": "5 minutes easy"
          }
        }
      ]
    }
  ]
}`;

    console.log("generate-team-training-plan: calling Anthropic API for chunk", start_week, "-", chunkEnd);

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        // Keep 16000. A 4-week chunk x 7 days x (required + optional session,
        // 7 populated fields each) is ~10-14k output tokens; 4000 already
        // truncated it and 500 would return nothing usable.
        // thinking stays disabled so the whole budget goes to the JSON.
        max_tokens: 16000,
        thinking: { type: "disabled" },
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    console.log("generate-team-training-plan: Anthropic response status:", resp.status);

    if (!resp.ok) {
      console.error("generate-team-training-plan: Anthropic error body:", await resp.text());
      await recordApiError(supabase, "generate-team-training-plan");
      return jsonError(corsHeaders, 503, "AI service unavailable");
    }
    await recordApiSuccess(supabase, "generate-team-training-plan");

    const result = await resp.json();
    const text = result?.content?.[0]?.text ?? "";

    console.log("generate-team-training-plan: response text length:", text.length);

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
      console.error("generate-team-training-plan: no valid JSON in response:", text.slice(0, 300));
      throw new Error("AI response did not contain valid JSON");
    }

    let chunk;
    try {
      chunk = JSON.parse(text.slice(start, end + 1));
    } catch (parseErr) {
      console.error("generate-team-training-plan: JSON.parse failed:", parseErr);
      throw new Error("AI returned malformed JSON");
    }

    const tokens = tokensFrom(result?.usage);
    console.log("generate-team-training-plan: success, weeks in chunk:", chunk?.weeks?.length);
    await setCached(supabase, cacheKey, chunk, TTL.DAY, MODEL, tokens.input_tokens, tokens.output_tokens);
    await logUsage(supabase, { function_name: "generate-team-training-plan", model: MODEL, ...tokens, cache_hit: false });

    return new Response(JSON.stringify(chunk), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (e) {
    console.error("generate-team-training-plan: unhandled error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
