import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logUsage } from "../_shared/cache.ts";
import { preflight, recordApiError, recordApiSuccess, recordUsage, jsonError } from "../_shared/aiGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-5";
const FN = "import-team-plan";

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

    // Failsafe 9 + 1: circuit breaker + per-user daily limits.
    const blocked = await preflight(supabase, { userId: coach_id ?? null, functionName: FN, corsHeaders });
    if (blocked) return blocked;

    // Call Anthropic to parse the spreadsheet
    const userMessage = `Parse this rowing training plan spreadsheet and extract a structured weekly plan. Return valid JSON matching this schema exactly:
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
- If splits are expressed as 2K+X or 2K-X keep them exactly as written
- If splits are absolute, convert to 2K+X format using 7:00 2K baseline (28s/500m base)
- Express all pace targets as 2K±Xs/500m format

File content:
${file_content}`;

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        system:
          "You are a rowing training plan parser. Parse the provided training plan spreadsheet content and return ONLY valid JSON with no explanation or markdown.",
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
    const usage = claudeData?.usage ?? {};
    await logUsage(supabase, { user_id: coach_id ?? null, function_name: FN, model: MODEL, input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, cache_hit: false });
    await recordUsage(supabase, coach_id, (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0));

    let planData: any;
    try {
      // Strip markdown fences if present
      const cleaned = rawText.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      planData = JSON.parse(cleaned);
    } catch {
      throw new Error("Failed to parse Claude response as JSON");
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
      { headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }
});
