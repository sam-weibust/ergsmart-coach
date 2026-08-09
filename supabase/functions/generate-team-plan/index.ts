import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, tokensFrom, hashKey, TTL } from "../_shared/cache.ts";
import { preflight, recordApiError, recordApiSuccess, recordUsage, jsonError } from "../_shared/aiGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-5";
const FN = "generate-team-plan";

const DEFAULT_SYSTEM_PROMPT = `Expert rowing coach. Generate a structured training plan.

ZONES (pace = offset from athlete 2k split, per 500m):
UT2: 2k+20-25s, rate 16-20 — aerobic base
UT1: 2k+15-20s, rate 18-24 — moderate aerobic, rate ladders
AT: 2k+4-9s, rate 26-28 — anaerobic threshold
TR1: 2k+0-4s, rate 26-32 — threshold, hard pieces
TR2: below 2k pace, rate 32+ — race specific, peak phase only, within 6 weeks of race

WEEKLY STRUCTURE — CRITICAL:
- Exactly ONE required session per day.
- Lifting is ALWAYS optional; never a standalone required session Mon-Fri.
- Saturday may have lifting as the required session when erg is the optional.
- Sunday is ALWAYS OFF: no required and no optional session.

3-WEEK LOADING CYCLE: wk1 easy, wk2 medium, wk3 hard, wk4 recovery at 50% volume.

Every session must specify piece duration/distance, rest interval, stroke rate, warmup, cooldown. Express paces as 2k +/- seconds, never absolute splits.

Return ONLY valid JSON. No explanation, no markdown.`;

/**
 * True when the plan actually contains weeks. Mirrors the shapes
 * personalizePlanData accepts. Used as the cache guard on both sides so a
 * degenerate parse (`{}`, or a model reply with no JSON) is never written to
 * the cache and never served from it.
 */
function hasPlanWeeks(p: any): boolean {
  const weeks = Array.isArray(p?.plan) ? p.plan : Array.isArray(p?.weeks) ? p.weeks : Array.isArray(p) ? p : [];
  return weeks.length > 0;
}

function formatPace(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}/500m`;
}

function personalizeSplit(splitStr: string, athlete2kSeconds: number): string {
  if (!splitStr) return splitStr;
  const match = splitStr.match(/2K([+-])(\d+)s?\/500m/i);
  if (!match) return splitStr;
  const sign = match[1];
  const offset = parseInt(match[2]);
  const basePer500 = athlete2kSeconds / 4;
  const finalPace = sign === "+" ? basePer500 + offset : basePer500 - offset;
  return `${formatPace(finalPace)} (2K${sign}${offset}s/500m)`;
}

function personalizePlanData(planData: any, athlete2kSeconds: number): any {
  const cloned = JSON.parse(JSON.stringify(planData));
  const weeks = cloned.plan || cloned.weeks || (Array.isArray(cloned) ? cloned : []);
  for (const week of weeks) {
    for (const day of (week.days || [])) {
      if (day.required && day.required.targetSplit) {
        day.required.targetSplit = personalizeSplit(day.required.targetSplit, athlete2kSeconds);
      }
      if (day.optional && day.optional.targetSplit) {
        day.optional.targetSplit = personalizeSplit(day.optional.targetSplit, athlete2kSeconds);
      }
    }
  }
  return cloned;
}

async function personalizePlanForTeam(
  teamId: string,
  planData: any,
  planTitle: string,
  teamPlanId: string,
  supabase: any,
): Promise<number> {
  const { data: members } = await supabase
    .from("team_members")
    .select("user_id, profile:profiles(id, full_name)")
    .eq("team_id", teamId);

  if (!members || members.length === 0) return 0;

  const FALLBACK_2K = 450;
  let updated = 0;

  for (const member of members) {
    const userId = member.user_id;

    const { data: scores } = await supabase
      .from("erg_scores")
      .select("time_seconds")
      .eq("user_id", userId)
      .eq("test_type", "2k")
      .not("time_seconds", "is", null)
      .order("time_seconds", { ascending: true })
      .limit(1);

    const best2k = scores && scores.length > 0 ? scores[0].time_seconds : FALLBACK_2K;
    const personalized = personalizePlanData(planData, best2k);

    await supabase
      .from("workout_plans")
      .delete()
      .eq("user_id", userId)
      .eq("coach_plan_id", teamPlanId);

    await supabase.from("workout_plans").insert({
      user_id: userId,
      title: planTitle,
      workout_data: personalized,
      coach_plan_id: teamPlanId,
      is_coach_assigned: true,
    });

    updated++;
  }

  return updated;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { team_id, coach_id, weeks, intensity, goal, goal_date, use_custom_philosophy } = body;

    if (!team_id || !coach_id || !weeks || !intensity || !goal) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: team_id, coach_id, weeks, intensity, goal" }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch team name
    const { data: team } = await supabase
      .from("teams")
      .select("name")
      .eq("id", team_id)
      .single();

    const teamName = team?.name || "Team";

    // Determine system prompt
    let systemPrompt = DEFAULT_SYSTEM_PROMPT;
    let source: "generated" | "custom" = "generated";

    if (use_custom_philosophy) {
      const { data: philosophy } = await supabase
        .from("team_training_philosophy")
        .select("philosophy")
        .eq("team_id", team_id)
        .maybeSingle();

      if (philosophy?.philosophy) {
        const philosophyText = typeof philosophy.philosophy === "string"
          ? philosophy.philosophy
          : JSON.stringify(philosophy.philosophy);
        systemPrompt = `You are an expert rowing coach generating a training plan following the coach's custom training philosophy below. Return ONLY valid JSON with no explanation or markdown.\n\nCOACH'S TRAINING PHILOSOPHY:\n${philosophyText}`;
        source = "custom";
      }
    }

    // Build user message
    const goalDateText = goal_date ? ` Target date: ${goal_date}.` : "";
    const userMessage = `Generate a ${weeks}-week rowing training plan for ${teamName}.
Intensity: ${intensity}
Training goal: ${goal}${goalDateText}

Return valid JSON matching this schema exactly:
{
  "total_weeks": number,
  "plan": [
    {
      "week": number,
      "phase": string,
      "days": [
        {
          "day_name": string,
          "required": {
            "session_type": string,
            "zone": string,
            "title": string,
            "description": string,
            "targetSplit": string,
            "rate": string,
            "warmup": string,
            "cooldown": string,
            "restPeriods": string
          } or null,
          "optional": {
            "session_type": string,
            "title": string,
            "description": string
          } or null
        }
      ]
    }
  ]
}

Express all pace targets as 2K±Xs/500m format. Generate all ${weeks} weeks.`;

    // Cache the MODEL OUTPUT (the plan JSON), not the HTTP response.
    // The response carries a freshly-inserted team_plan_id and an athlete count;
    // replaying those would hand back a row that may have been deleted and would
    // skip assigning the plan to athletes who joined since. Key is the exact
    // model input (system + user message), so it is deterministic by construction
    // and picks up team-name and philosophy edits without a separate key field.
    // coach_id is deliberately excluded: it does not shape the plan, so two
    // coaches on the same team share the entry.
    const cacheKey = `generate-team-plan_${hashKey({ system: systemPrompt, user: userMessage })}`;
    const cachedPlan = await getCached(supabase, cacheKey);
    let planData: any = hasPlanWeeks(cachedPlan) ? cachedPlan : null;
    const cacheHit = planData !== null;

    if (cacheHit) {
      await logUsage(supabase, {
        user_id: coach_id ?? null,
        function_name: FN,
        model: MODEL,
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        cache_hit: true,
      });
    } else {
      // Failsafe 9 + 1: circuit breaker + per-user daily limits (after cache check).
      const blocked = await preflight(supabase, { userId: coach_id ?? null, functionName: FN, corsHeaders });
      if (blocked) return blocked;

      const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          // Disable adaptive thinking (Sonnet 5 default) so the full token budget
          // goes to the plan JSON; 8000 with thinking on was truncating it.
          max_tokens: 16000,
          thinking: { type: "disabled" },
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        }),
      });

      if (!claudeResponse.ok) {
        console.error("Anthropic error:", await claudeResponse.text());
        await recordApiError(supabase, FN);
        return jsonError(corsHeaders, 503, "AI service unavailable");
      }
      await recordApiSuccess(supabase, FN);

      const claudeData = await claudeResponse.json();
      const rawText = claudeData.content?.[0]?.text || "";
      const tok = tokensFrom(claudeData?.usage);
      await logUsage(supabase, {
        user_id: coach_id ?? null,
        function_name: FN,
        model: MODEL,
        input_tokens: tok.input_tokens,
        output_tokens: tok.output_tokens,
        cache_creation_input_tokens: tok.cache_creation_input_tokens,
        cache_read_input_tokens: tok.cache_read_input_tokens,
        cache_hit: false,
      });
      await recordUsage(supabase, coach_id, tok.input_tokens + tok.output_tokens);

      try {
        const cleaned = rawText.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
        planData = JSON.parse(cleaned);
      } catch {
        throw new Error("Failed to parse Claude response as JSON");
      }

      // Six hours: long enough to absorb retries and duplicate clicks, short
      // enough that a coach who edits the team philosophy and regenerates the
      // same week is not served a plan built on the old one for long.
      if (hasPlanWeeks(planData)) {
        await setCached(supabase, cacheKey, planData, TTL.SIX_HOURS, MODEL, tok.input_tokens, tok.output_tokens);
      }
    }

    const planTitle = `${weeks}-Week ${goal} Plan (${intensity})`;
    const totalWeeks = planData.total_weeks || (planData.plan || []).length || parseInt(weeks) || 0;

    // Insert team_plan
    const { data: teamPlan, error: insertError } = await supabase
      .from("team_plans")
      .insert({
        team_id,
        coach_id,
        title: planTitle,
        source,
        plan_data: planData,
        total_weeks: totalWeeks,
        is_active: false,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Personalize and push to all athletes
    const athletesUpdated = await personalizePlanForTeam(
      team_id,
      planData,
      planTitle,
      teamPlan.id,
      supabase,
    );

    return new Response(
      JSON.stringify({
        success: true,
        team_plan_id: teamPlan.id,
        athletes_updated: athletesUpdated,
        total_weeks: totalWeeks,
      }),
      { headers: { ...corsHeaders, "content-type": "application/json", "X-Cache": cacheHit ? "HIT" : "MISS" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }
});
