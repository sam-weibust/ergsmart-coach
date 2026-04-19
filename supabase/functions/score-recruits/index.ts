import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Fetch coach program profile
    const { data: coachProfile } = await supabase
      .from("coach_profiles")
      .select("*")
      .eq("coach_id", coach_id)
      .maybeSingle();

    // Fetch athletes to score
    let athleteQuery = supabase
      .from("athlete_profiles")
      .select("*, profiles!inner(full_name, height, weight, experience_level)")
      .eq("is_recruiting", true)
      .eq("is_public", true);

    if (athlete_ids?.length) athleteQuery = athleteQuery.in("user_id", athlete_ids);

    const { data: athletes } = await athleteQuery;
    if (!athletes?.length) return new Response(JSON.stringify({ scores: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Fetch best 2k scores for each athlete
    const athleteUserIds = athletes.map((a: any) => a.user_id);
    const { data: ergScores } = await supabase
      .from("erg_scores")
      .select("user_id, time_seconds, watts, watts_per_kg, test_type, recorded_at")
      .in("user_id", athleteUserIds)
      .eq("test_type", "2k")
      .order("recorded_at", { ascending: false });

    // Get best score per athlete
    const bestScores: Record<string, any> = {};
    for (const score of ergScores ?? []) {
      if (!bestScores[score.user_id] || score.time_seconds < bestScores[score.user_id].time_seconds) {
        bestScores[score.user_id] = score;
      }
    }

    // Fetch combine scores
    const { data: combineEntries } = await supabase
      .from("combine_entries")
      .select("user_id, two_k_seconds, virtual_combine_score")
      .in("user_id", athleteUserIds)
      .order("created_at", { ascending: false });

    const combineByUser: Record<string, any> = {};
    for (const ce of combineEntries ?? []) {
      if (!combineByUser[ce.user_id]) combineByUser[ce.user_id] = ce;
    }

    // Build athlete summaries for AI
    const athleteSummaries = athletes.map((a: any) => {
      const erg = bestScores[a.user_id];
      const combine = combineByUser[a.user_id];
      const profile = a.profiles;
      const ergTime = erg ? `${Math.floor(erg.time_seconds / 60)}:${String(erg.time_seconds % 60).padStart(2, "0")}` : "unknown";
      return {
        user_id: a.user_id,
        name: profile?.full_name ?? "Unknown",
        grad_year: a.grad_year,
        location: a.location,
        school: a.school,
        division_interest: a.division_interest,
        height_cm: profile?.height,
        weight_kg: profile?.weight,
        best_2k: ergTime,
        watts_per_kg: erg?.watts_per_kg,
        combine_score: combine?.virtual_combine_score,
      };
    });

    const programContext = coachProfile
      ? `Coach's program: ${coachProfile.school_name || "Unknown"}, ${coachProfile.division || "unknown division"}, ${coachProfile.team_type || "unknown type"}.
Target 2k range: ${coachProfile.target_2k_min_seconds ? `${Math.floor(coachProfile.target_2k_min_seconds/60)}:${String(coachProfile.target_2k_min_seconds%60).padStart(2,"0")}` : "not set"} - ${coachProfile.target_2k_max_seconds ? `${Math.floor(coachProfile.target_2k_max_seconds/60)}:${String(coachProfile.target_2k_max_seconds%60).padStart(2,"0")}` : "not set"}.
Target height: ${coachProfile.target_height_min_cm ?? "?"}cm - ${coachProfile.target_height_max_cm ?? "?"}cm.
Target weight: ${coachProfile.target_weight_min_kg ?? "?"}kg - ${coachProfile.target_weight_max_kg ?? "?"}kg.
Description: ${coachProfile.program_description ?? "Not provided"}.`
      : "Coach has not filled out their program profile yet. Score based on general recruiting standards.";

    const prompt = `You are a rowing recruiting analyst. Score each recruit 1-100 for fit with this program.

${programContext}

Athletes to score:
${JSON.stringify(athleteSummaries, null, 2)}

Return ONLY valid JSON array with this exact format (no markdown, no explanation):
[{"user_id":"...","score":85,"reasoning":"Brief 1-sentence reason"}]`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const aiData = await aiRes.json();
    const rawText = aiData.content?.[0]?.text ?? "[]";
    const scores = JSON.parse(rawText);

    // Upsert scores into database
    for (const s of scores) {
      await supabase.from("recruit_scores").upsert({
        coach_id,
        athlete_user_id: s.user_id,
        score: s.score,
        reasoning: s.reasoning,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "coach_id,athlete_user_id" });
    }

    return new Response(JSON.stringify({ scores }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
