import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, tokensFrom, hashKey, TTL } from "../_shared/cache.ts";
import { preflight, recordApiError, recordApiSuccess, recordUsage, jsonError } from "../_shared/aiGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-5";
const FN = "import-team-plan";

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
  // Fetch team members with profiles
  const { data: members } = await supabase
    .from("team_members")
    .select("user_id, profile:profiles(id, full_name)")
    .eq("team_id", teamId);

  if (!members || members.length === 0) return 0;

  const FALLBACK_2K = 450; // 7:30
  let updated = 0;

  for (const member of members) {
    const userId = member.user_id;

    // Get best 2K
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

    // Upsert workout_plans for this athlete
    const { error } = await supabase
      .from("workout_plans")
      .upsert(
        {
          user_id: userId,
          title: planTitle,
          workout_data: personalized,
          coach_plan_id: teamPlanId,
          is_coach_assigned: true,
        },
        {
          onConflict: "user_id,coach_plan_id",
          ignoreDuplicates: false,
        },
      );

    // If upsert with composite key fails (constraint may not exist), insert fresh
    if (error) {
      // Delete existing coach-assigned plan for this team plan + user and reinsert
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
    }

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
    const { team_id, coach_id, file_content, file_name, title } = body;

    if (!team_id || !coach_id || !file_content) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: team_id, coach_id, file_content" }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Call Anthropic to parse the spreadsheet
    const userMessage = `Parse this rowing training plan spreadsheet into a structured weekly plan. Return valid JSON matching this schema exactly:
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

Rules:
- Splits already written as 2K+X or 2K-X: keep exactly as written.
- Absolute splits: convert to 2K+X using a 7:00 2K baseline (28s/500m base).
- Express every pace target as 2K±Xs/500m.

File content:
${file_content}`;

    const SYSTEM_PROMPT =
      "Rowing training plan parser. Parse the provided spreadsheet content and return ONLY valid JSON. No explanation, no markdown.";

    // Cache the MODEL OUTPUT (the parsed plan), not the HTTP response: the
    // response carries a freshly-inserted team_plan_id and athlete count, which
    // must not be replayed. Keyed on the source document alone — the parse is a
    // pure function of file_content, so the same spreadsheet imported by a
    // different team or under a different title reuses the entry (team_id,
    // coach_id and title affect only the DB rows written below, never the parse).
    const cacheKey = `import-team-plan_${hashKey({ system: SYSTEM_PROMPT, file_content })}`;
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
          // Disable adaptive thinking (Sonnet 5 default) and widen the budget so the
          // parsed plan JSON isn't truncated (8000 with thinking on failed to parse).
          max_tokens: 16000,
          thinking: { type: "disabled" },
          system: SYSTEM_PROMPT,
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
        // Strip markdown fences if present
        const cleaned = rawText.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
        planData = JSON.parse(cleaned);
      } catch {
        throw new Error("Failed to parse Claude response as JSON");
      }

      // A week: parsing a fixed document is stable, and re-importing the same
      // spreadsheet (retry, second team, corrected title) is the common case.
      // Not PERMANENT — a prompt/schema change on deploy should age out.
      if (hasPlanWeeks(planData)) {
        await setCached(supabase, cacheKey, planData, TTL.WEEK, MODEL, tok.input_tokens, tok.output_tokens);
      }
    }

    const planTitle = title || file_name || "Imported Team Plan";
    const totalWeeks = planData.total_weeks || (planData.plan || []).length || 0;

    // Insert team_plan
    const { data: teamPlan, error: insertError } = await supabase
      .from("team_plans")
      .insert({
        team_id,
        coach_id,
        title: planTitle,
        source: "imported",
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
