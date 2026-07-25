import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, hashKey, TTL } from "../_shared/cache.ts";
import { preflight, recordApiError, recordApiSuccess, recordUsage, jsonError } from "../_shared/aiGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-haiku-4-5";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Accept both the athlete-app shape ({ user_id, target_school }) and the
    // RecruitEmailSection shape ({ school, division, profile, goals, gpa, gender, prediction }).
    const bodyIn = await req.json();
    const user_id: string | null = bodyIn.user_id ?? null;
    const target_school: string = bodyIn.target_school ?? bodyIn.school ?? "";
    const division: string = bodyIn.division ?? "";
    const gpa = bodyIn.gpa ?? null;
    const gender = bodyIn.gender ?? null;

    if (!target_school) {
      return new Response(JSON.stringify({ error: "Missing target school" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cache by user (or "anon") + school/athlete hash (7 days)
    const cacheKey = `recruit_email_${user_id || "anon"}_${hashKey(`${target_school}|${bodyIn.profile?.full_name ?? ""}`)}`;
    const cached = await getCached(supabase, cacheKey);
    if (cached) {
      if (user_id) await logUsage(supabase, { user_id, function_name: "generate-recruit-emails", model: MODEL, input_tokens: 0, output_tokens: 0, cache_hit: true });
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    // Failsafe 9 + 1: only enforce per-user limits when a user_id is supplied.
    if (user_id) {
      const blocked = await preflight(supabase, { userId: user_id, functionName: "generate-recruit-emails", corsHeaders });
      if (blocked) return blocked;
    }

    // Prefer athlete data supplied in the body; fall back to DB when a user_id is given.
    let profile: any = bodyIn.profile ?? null;
    let goals: any = bodyIn.goals ?? null;
    let recentErg: any[] = [];
    if (user_id) {
      const [profileRes, goalsRes, ergRes] = await Promise.all([
        supabase.from("profiles").select("full_name,grad_year,height,weight,experience_level").eq("id", user_id).maybeSingle(),
        supabase.from("user_goals").select("current_2k_time,goal_2k_time").eq("user_id", user_id).maybeSingle(),
        supabase.from("erg_workouts").select("workout_date,distance,avg_split").eq("user_id", user_id)
          .order("workout_date", { ascending: false }).limit(3),
      ]);
      profile = profile ?? profileRes.data;
      goals = goals ?? goalsRes.data;
      recentErg = ergRes.data || [];
    }

    const ergSummary = recentErg.length
      ? recentErg.map((w: any) => `${w.workout_date}: ${w.distance}m (${w.avg_split})`).join("; ")
      : "No recent erg results";

    const systemPrompt = `Rowing recruiting email assistant. Output ONLY valid JSON, no markdown:
{"general_email":"email","coaches":[{"name":"...","title":"...","email":"...","confidence":"likely","notes":"..."}],"email_campaign":[{"sequence_number":1,"email_type":"Initial Contact","timing":"Send now","subject":"...","body":"...","tips":"..."},{"sequence_number":2,"email_type":"Follow-Up","timing":"2 weeks after","subject":"...","body":"...","tips":"..."},{"sequence_number":3,"email_type":"Final","timing":"4 weeks after","subject":"...","body":"...","tips":"..."}],"campaign_tips":["...","...","..."]}
Athlete: ${profile?.full_name||"?"}, grad ${profile?.grad_year||profile?.graduation_year||"?"}, ${profile?.height||"?"}cm, GPA ${gpa ?? "?"}, ${gender ?? "?"}, 2K: ${goals?.current_2k_time||"?"} → ${goals?.goal_2k_time||"?"}. Recent: ${ergSummary}. Target: ${target_school}${division ? ` (${division})` : ""}`;

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        // 400 truncated the 3-email campaign JSON, so it always fell back to empty.
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: `Generate recruiting email campaign for: ${target_school}` }],
      }),
    });

    if (!anthropicResponse.ok) {
      console.error("Anthropic error:", anthropicResponse.status, await anthropicResponse.text());
      await recordApiError(supabase, "generate-recruit-emails");
      return jsonError(corsHeaders, 503, "AI service unavailable");
    }
    await recordApiSuccess(supabase, "generate-recruit-emails");

    const aiResult = await anthropicResponse.json();
    const usage = aiResult?.usage ?? {};
    const rawText = aiResult?.content?.[0]?.text ?? "";
    const start = rawText.indexOf("{");
    const end = rawText.lastIndexOf("}");
    let parsed: any = { coaches: [], email_campaign: [], campaign_tips: [] };
    if (start !== -1 && end > start) {
      try { parsed = JSON.parse(rawText.slice(start, end + 1)); } catch { /* fallback */ }
    }

    await setCached(supabase, cacheKey, parsed, TTL.WEEK, MODEL, usage.input_tokens, usage.output_tokens);
    if (user_id) {
      await logUsage(supabase, { user_id, function_name: "generate-recruit-emails", model: MODEL, input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, cache_hit: false });
      await recordUsage(supabase, user_id, (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0));
    }

    return new Response(JSON.stringify(parsed), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (e) {
    console.error("generate-recruit-emails error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
