import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, TTL, hashKey } from "../_shared/cache.ts";
import { preflight, recordApiError, recordApiSuccess, recordUsage, jsonError } from "../_shared/aiGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-4-6";
const FN = "score-college-targets";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { user_id, target_id } = await req.json();
    if (!user_id) return jsonError(corsHeaders, 400, "Missing user_id");
    if (!target_id) return jsonError(corsHeaders, 400, "Missing target_id");

    // Failsafe 2: cache before the API call.
    const cacheKey = `${FN}_${hashKey({ user_id, target_id })}`;
    const cached = await getCached(supabase, cacheKey);
    if (cached) {
      await logUsage(supabase, { user_id, function_name: FN, model: MODEL, input_tokens: 0, output_tokens: 0, cache_hit: true });
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    // Failsafe 9 + 1: circuit breaker + per-user daily limits (after cache check).
    const blocked = await preflight(supabase, { userId: user_id, functionName: FN, corsHeaders });
    if (blocked) return blocked;

    const [profileRes, ergRes, athleteProfileRes, goalsRes, targetRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user_id).maybeSingle(),
      supabase.from("erg_workouts").select("*").eq("user_id", user_id).order("workout_date", { ascending: false }).limit(10),
      supabase.from("athlete_profiles").select("*").eq("user_id", user_id).maybeSingle(),
      supabase.from("user_goals").select("*").eq("user_id", user_id).maybeSingle(),
      supabase.from("college_targets").select("*").eq("id", target_id).maybeSingle(),
    ]);

    const profile = profileRes.data;
    const ap = athleteProfileRes.data;
    const goals = goalsRes.data;
    const ergs = ergRes.data || [];
    const target = targetRes.data;

    if (!target) {
      return new Response(JSON.stringify({ error: "Target not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bestErgSplit = ergs.reduce((best: string | null, w: any) => {
      if (!w.avg_split) return best;
      if (!best || w.avg_split < best) return w.avg_split;
      return best;
    }, null);

    const ctx = `
Athlete:
- Height: ${profile?.height ? (profile.height / 2.54).toFixed(1) + '"' : "unknown"}
- Weight: ${profile?.weight ? Math.round(profile.weight * 2.205) + " lbs" : "unknown"}
- Best erg split: ${bestErgSplit || "unknown"}
- 2K goal: ${goals?.goal_2k_time || "unknown"}
- GPA: ${ap?.gpa || "unknown"}
- Grad year: ${ap?.grad_year || "unknown"}
- Experience: ${profile?.experience_level || "unknown"}

Target School: ${target.school_name}
Division: ${target.division}
`.trim();

    const prompt = `You are a college rowing recruiting expert. Based on this athlete's data and the target school/division, provide a fit assessment.

${ctx}

Typical recruiting benchmarks by division (men's 2K split):
- D1 top programs (Ivy, Pac-12): sub 6:15
- D1 mid-tier: 6:15-6:30
- D2: 6:30-6:50
- D3 competitive: 6:30-7:00
- NAIA/Club: 7:00+

For women's (roughly 40-45 seconds slower per division tier).

Respond ONLY with valid JSON:
{
  "fit_score": "reach" | "target" | "likely",
  "fit_notes": "2-3 sentences explaining why",
  "improve_notes": "1-2 specific things they need to improve to upgrade a reach to target, or target to likely. Empty string if already likely."
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error("Anthropic error:", await response.text());
      await recordApiError(supabase, FN);
      return jsonError(corsHeaders, 503, "AI service unavailable");
    }
    await recordApiSuccess(supabase, FN);

    const result = await response.json();
    const raw = result?.content?.[0]?.text?.trim() || "";
    const usage = result?.usage ?? {};
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    let parsed = { fit_score: "target", fit_notes: "", improve_notes: "" };
    if (start !== -1 && end > start) {
      try { parsed = JSON.parse(raw.slice(start, end + 1)); } catch {}
    }

    await supabase.from("college_targets").update({
      fit_score: parsed.fit_score,
      fit_notes: parsed.fit_notes,
      improve_notes: parsed.improve_notes,
      updated_at: new Date().toISOString(),
    }).eq("id", target_id);

    await setCached(supabase, cacheKey, parsed, TTL.TWO_DAYS, MODEL, usage.input_tokens, usage.output_tokens);
    await logUsage(supabase, { user_id, function_name: FN, model: MODEL, input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, cache_hit: false });
    await recordUsage(supabase, user_id, (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0));

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
