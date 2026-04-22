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

    const { coach_id } = await req.json();
    if (!coach_id) return new Response(JSON.stringify({ error: "Missing coach_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Fetch coach program profile
    const { data: coachProfile } = await supabase
      .from("coach_profiles")
      .select("*")
      .eq("coach_id", coach_id)
      .maybeSingle();

    // Fetch current roster erg scores (athletes on the coach's teams)
    const { data: teams } = await supabase
      .from("teams")
      .select("id")
      .eq("coach_id", coach_id);

    const teamIds = (teams ?? []).map((t: any) => t.id);
    let rosterSummary = "No roster data available.";

    if (teamIds.length > 0) {
      const { data: rosterMembers } = await supabase
        .from("team_members")
        .select("user_id, profiles!inner(full_name, height, weight)")
        .in("team_id", teamIds);

      if (rosterMembers?.length) {
        const rosterIds = rosterMembers.map((m: any) => m.user_id);
        const { data: rosterScores } = await supabase
          .from("erg_scores")
          .select("user_id, time_seconds, watts_per_kg, test_type")
          .in("user_id", rosterIds)
          .eq("test_type", "2k")
          .order("recorded_at", { ascending: false });

        const bestByRoster: Record<string, any> = {};
        for (const s of rosterScores ?? []) {
          if (!bestByRoster[s.user_id] || s.time_seconds < bestByRoster[s.user_id].time_seconds) {
            bestByRoster[s.user_id] = s;
          }
        }

        const rosterData = rosterMembers.map((m: any) => {
          const score = bestByRoster[m.user_id];
          const p = m.profiles;
          return {
            name: p?.full_name ?? "Unknown",
            height_cm: p?.height,
            weight_kg: p?.weight,
            best_2k_seconds: score?.time_seconds,
            watts_per_kg: score?.watts_per_kg,
          };
        });

        rosterSummary = JSON.stringify(rosterData);
      }
    }

    // Fetch all recruiting athletes
    const { data: athletes } = await supabase
      .from("athlete_profiles")
      .select("*, profiles!inner(full_name, height, weight)")
      .eq("is_recruiting", true)
      .eq("is_public", true);

    if (!athletes?.length) {
      return new Response(JSON.stringify({ recommendations: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const athleteIds = athletes.map((a: any) => a.user_id);
    const { data: ergScores } = await supabase
      .from("erg_scores")
      .select("user_id, time_seconds, watts, watts_per_kg, test_type, recorded_at")
      .in("user_id", athleteIds)
      .eq("test_type", "2k")
      .order("recorded_at", { ascending: false });

    const bestScores: Record<string, any> = {};
    for (const s of ergScores ?? []) {
      if (!bestScores[s.user_id] || s.time_seconds < bestScores[s.user_id].time_seconds) {
        bestScores[s.user_id] = s;
      }
    }

    const athleteSummaries = athletes.map((a: any) => {
      const erg = bestScores[a.user_id];
      const p = a.profiles;
      return {
        user_id: a.user_id,
        name: p?.full_name ?? "Unknown",
        grad_year: a.grad_year,
        location: a.location,
        school: a.school,
        division_interest: a.division_interest,
        height_cm: p?.height,
        weight_kg: p?.weight,
        best_2k_seconds: erg?.time_seconds,
        watts_per_kg: erg?.watts_per_kg,
      };
    });

    const programContext = coachProfile
      ? `Program: ${coachProfile.school_name ?? "Unknown"}, ${coachProfile.division ?? "unknown division"}, ${coachProfile.team_type ?? ""}.
Description: ${coachProfile.program_description ?? "Not provided"}.
Target 2k: ${coachProfile.target_2k_min_seconds ?? "?"}s–${coachProfile.target_2k_max_seconds ?? "?"}s.
Target height: ${coachProfile.target_height_min_cm ?? "?"}–${coachProfile.target_height_max_cm ?? "?"}cm.
Target weight: ${coachProfile.target_weight_min_kg ?? "?"}–${coachProfile.target_weight_max_kg ?? "?"}kg.`
      : "No program profile on file. Use general collegiate rowing recruiting standards.";

    const prompt = `You are a rowing recruiting analyst. Based on this coach's current roster and program profile, identify the top 10 recruits from the pool that would best fill roster gaps.

Program profile:
${programContext}

Current roster:
${rosterSummary}

Recruit pool (select the 10 best fits to fill roster gaps):
${JSON.stringify(athleteSummaries, null, 2)}

Return ONLY valid JSON array with exactly this format (no markdown):
[{"user_id":"...","reasoning":"Why this recruit fills a specific gap","gap_addressed":"What gap this fills (e.g. port-side heavyweight with sub-6:30 2k)"}]

Return at most 10 athletes.`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const aiData = await aiRes.json();
    const rawText = aiData.content?.[0]?.text ?? "[]";
    const recommendations = JSON.parse(rawText);

    // Clear old recommendations and insert new ones
    await supabase.from("coach_recommendations").delete().eq("coach_id", coach_id);

    for (const r of recommendations) {
      await supabase.from("coach_recommendations").insert({
        coach_id,
        athlete_user_id: r.user_id,
        reasoning: r.reasoning,
        gap_addressed: r.gap_addressed,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    return new Response(JSON.stringify({ recommendations }), {
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
