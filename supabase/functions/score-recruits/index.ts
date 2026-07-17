import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, hashKey, TTL } from "../_shared/cache.ts";
import { preflight, recordApiError, recordApiSuccess, recordUsage, jsonError } from "../_shared/aiGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "claude-haiku-4-5";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { coach_id, athlete_ids } = await req.json();
    if (!coach_id) return new Response(JSON.stringify({ error: "Missing coach_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Cache by coach + sorted athlete_ids (48h TTL)
    const cacheKey = `recruit_score_${coach_id}_${hashKey(athlete_ids || [])}`;
    const cached = await getCached(supabase, cacheKey);
    if (cached) {
      await logUsage(supabase, { user_id: coach_id, function_name: "score-recruits", model: MODEL, input_tokens: 0, output_tokens: 0, cache_hit: true });
      return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" } });
    }

    // Failsafe 9 + 1: circuit breaker + per-user daily limits (after cache check).
    const blocked = await preflight(supabase, { userId: coach_id, functionName: "score-recruits", corsHeaders });
    if (blocked) return blocked;

    const { data: coachProfile } = await supabase
      .from("coach_profiles")
      .select("*")
      .eq("coach_id", coach_id)
      .maybeSingle();

    let athleteQuery = supabase
      .from("athlete_profiles")
      .select("*, profiles!inner(full_name, height, weight, experience_level)")
      .eq("is_recruiting", true)
      .eq("is_public", true);

    if (athlete_ids?.length) athleteQuery = athleteQuery.in("user_id", athlete_ids);

    const { data: athletes } = await athleteQuery;
    if (!athletes?.length) return new Response(JSON.stringify({ scores: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const athleteUserIds = athletes.map((a: any) => a.user_id);
    const { data: ergScores } = await supabase
      .from("erg_scores")
      .select("user_id, time_seconds, watts, watts_per_kg, test_type, recorded_at")
      .in("user_id", athleteUserIds)
      .eq("test_type", "2k")
      .order("recorded_at", { ascending: false });

    const bestScores: Record<string, any> = {};
    for (const score of ergScores ?? []) {
      if (!bestScores[score.user_id] || score.time_seconds < bestScores[score.user_id].time_seconds) {
        bestScores[score.user_id] = score;
      }
    }

    const { data: combineEntries } = await supabase
      .from("combine_entries")
      .select("user_id, two_k_seconds, virtual_combine_score")
      .in("user_id", athleteUserIds)
      .order("created_at", { ascending: false });

    const combineByUser: Record<string, any> = {};
    for (const ce of combineEntries ?? []) {
      if (!combineByUser[ce.user_id]) combineByUser[ce.user_id] = ce;
    }

    const athleteSummaries = athletes.map((a: any) => {
      const erg = bestScores[a.user_id];
      const combine = combineByUser[a.user_id];
      const profile = a.profiles;
      const ergTime = erg ? `${Math.floor(erg.time_seconds / 60)}:${String(erg.time_seconds % 60).padStart(2, "0")}` : "unknown";
      return {
        user_id: a.user_id,
        name: profile?.full_name ?? "Unknown",
        grad_year: a.grad_year,
        best_2k: ergTime,
        watts_per_kg: erg?.watts_per_kg ? Math.round(erg.watts_per_kg * 10) / 10 : null,
        combine_score: combine?.virtual_combine_score,
        height_cm: profile?.height,
      };
    });

    const programContext = coachProfile
      ? `Program: ${coachProfile.school_name || "?"}, ${coachProfile.division || "?"}, ${coachProfile.team_type || "?"}. Target 2k: ${coachProfile.target_2k_min_seconds ? `${Math.floor(coachProfile.target_2k_min_seconds/60)}:${String(coachProfile.target_2k_min_seconds%60).padStart(2,"0")}` : "?"}-${coachProfile.target_2k_max_seconds ? `${Math.floor(coachProfile.target_2k_max_seconds/60)}:${String(coachProfile.target_2k_max_seconds%60).padStart(2,"0")}` : "?"}. Height: ${coachProfile.target_height_min_cm ?? "?"}cm-${coachProfile.target_height_max_cm ?? "?"}cm.`
      : "No program profile. Score on general standards.";

    const prompt = `Rowing recruiting analyst. Score each recruit 1-100 for fit with this program.\n\n${programContext}\n\nAthletes:\n${JSON.stringify(athleteSummaries)}\n\nReturn ONLY valid JSON array (no markdown):\n[{"user_id":"...","score":85,"reasoning":"1-sentence reason"}]`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 150, messages: [{ role: "user", content: prompt }] }),
    });

    if (!aiRes.ok) {
      console.error("Anthropic error:", await aiRes.text());
      await recordApiError(supabase, "score-recruits");
      return jsonError(corsHeaders, 503, "AI service unavailable");
    }
    await recordApiSuccess(supabase, "score-recruits");

    const aiData = await aiRes.json();
    const usage = aiData?.usage ?? {};
    const rawText = aiData.content?.[0]?.text ?? "[]";
    const scores = JSON.parse(rawText);

    for (const s of scores) {
      await supabase.from("recruit_scores").upsert({
        coach_id, athlete_user_id: s.user_id, score: s.score, reasoning: s.reasoning,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "coach_id,athlete_user_id" });
    }

    const responseBody = { scores };
    await setCached(supabase, cacheKey, responseBody, TTL.TWO_DAYS, MODEL, usage.input_tokens, usage.output_tokens);
    await logUsage(supabase, { user_id: coach_id, function_name: "score-recruits", model: MODEL, input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, cache_hit: false });
    await recordUsage(supabase, coach_id, (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0));

    return new Response(JSON.stringify(responseBody), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
