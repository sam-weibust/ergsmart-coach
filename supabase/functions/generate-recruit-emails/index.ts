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

    const { user_id, athlete_info, target_school } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cache by user + target_school hash (7 days)
    const cacheKey = `recruit_email_${user_id}_${hashKey(target_school || "")}`;
    const cached = await getCached(supabase, cacheKey);
    if (cached) {
      await logUsage(supabase, { user_id, function_name: "generate-recruit-emails", model: MODEL, input_tokens: 0, output_tokens: 0, cache_hit: true });
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    // Failsafe 9 + 1: circuit breaker + per-user daily limits (after cache check).
    const blocked = await preflight(supabase, { userId: user_id, functionName: "generate-recruit-emails", corsHeaders });
    if (blocked) return blocked;

    const [profileRes, goalsRes, ergRes] = await Promise.all([
      supabase.from("profiles").select("full_name,grad_year,height,weight,experience_level").eq("id", user_id).maybeSingle(),
      supabase.from("user_goals").select("current_2k_time,goal_2k_time").eq("user_id", user_id).maybeSingle(),
      supabase.from("erg_workouts").select("workout_date,distance,avg_split").eq("user_id", user_id)
        .order("workout_date", { ascending: false }).limit(3),
    ]);

    const profile = profileRes.data;
    const goals = goalsRes.data;
    const recentErg = ergRes.data || [];

    const ergSummary = recentErg.length
      ? recentErg.map(w => `${w.workout_date}: ${w.distance}m (${w.avg_split})`).join("; ")
      : "No recent erg results";

    const systemPrompt = `Rowing recruiting email assistant. Output ONLY valid JSON, no markdown:
{"general_email":"email","coaches":[{"name":"...","title":"...","email":"...","confidence":"likely","notes":"..."}],"email_campaign":[{"sequence_number":1,"email_type":"Initial Contact","timing":"Send now","subject":"...","body":"...","tips":"..."},{"sequence_number":2,"email_type":"Follow-Up","timing":"2 weeks after","subject":"...","body":"...","tips":"..."},{"sequence_number":3,"email_type":"Final","timing":"4 weeks after","subject":"...","body":"...","tips":"..."}],"campaign_tips":["...","...","..."]}
Athlete: ${profile?.full_name||"?"}, grad ${profile?.grad_year||"?"}, ${profile?.height||"?"}cm, 2K: ${goals?.current_2k_time||"?"} → ${goals?.goal_2k_time||"?"}. Recent: ${ergSummary}. Target: ${target_school}`;

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
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
    await logUsage(supabase, { user_id, function_name: "generate-recruit-emails", model: MODEL, input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, cache_hit: false });
    await recordUsage(supabase, user_id, (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0));

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
