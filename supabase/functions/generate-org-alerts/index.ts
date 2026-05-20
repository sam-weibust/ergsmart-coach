import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86400000);
  return d.toISOString().split("T")[0];
}

async function insertAlert(params: {
  org_id: string | null;
  team_id: string;
  athlete_id: string | null;
  alert_type: string;
  message: string;
}) {
  // Avoid duplicate alerts for same team+athlete+type in last 24h
  const { data: existing } = await supabase
    .from("org_alerts")
    .select("id")
    .eq("team_id", params.team_id)
    .eq("alert_type", params.alert_type)
    .eq("resolved", false)
    .eq("athlete_id", params.athlete_id ?? "")
    .gte("created_at", new Date(Date.now() - 86400000).toISOString())
    .maybeSingle();

  if (!existing) {
    await supabase.from("org_alerts").insert(params);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Get all orgs
    const { data: orgs } = await supabase.from("organizations").select("id");
    // Get all teams (including those not in an org, for team-specific ADs)
    const { data: allTeams } = await supabase
      .from("teams")
      .select("id, name");

    // Map team → org
    const { data: orgTeams } = await supabase
      .from("organization_teams")
      .select("organization_id, team_id");

    const teamOrgMap: Record<string, string> = {};
    (orgTeams || []).forEach((ot: any) => { teamOrgMap[ot.team_id] = ot.organization_id; });

    // Get teams that have at least one AD linked (either via org or direct)
    const { data: adTeams } = await supabase
      .from("team_athletic_directors")
      .select("team_id")
      .eq("status", "accepted");

    const adTeamIds = new Set((adTeams || []).map((t: any) => t.team_id));
    const orgTeamIds = new Set(Object.keys(teamOrgMap));

    // Only process teams that have an AD or are in an org
    const teamsToProcess = (allTeams || []).filter(
      (t: any) => adTeamIds.has(t.id) || orgTeamIds.has(t.id)
    );

    let alertsCreated = 0;

    for (const team of teamsToProcess) {
      const org_id = teamOrgMap[team.id] || null;

      // Get team members
      const { data: members } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", team.id);

      const memberIds = (members || []).map((m: any) => m.user_id);
      if (!memberIds.length) continue;

      // ── 1. Consecutive absences (3+) ─────────────────────────────────────
      const { data: recentAttendance } = await supabase
        .from("attendance_records")
        .select("user_id, practice_date, status")
        .eq("team_id", team.id)
        .gte("practice_date", daysAgo(21))
        .order("practice_date", { ascending: false });

      const byAthlete: Record<string, any[]> = {};
      (recentAttendance || []).forEach((r: any) => {
        if (!byAthlete[r.user_id]) byAthlete[r.user_id] = [];
        byAthlete[r.user_id].push(r);
      });

      for (const [userId, records] of Object.entries(byAthlete)) {
        const sorted = records.sort((a, b) => b.practice_date.localeCompare(a.practice_date));
        let consecutive = 0;
        for (const r of sorted) {
          if (r.status === "absent") consecutive++;
          else break;
        }
        if (consecutive >= 3) {
          const { data: p } = await supabase.from("profiles").select("full_name, username").eq("id", userId).maybeSingle();
          const name = p?.full_name || p?.username || "Unknown";
          await insertAlert({
            org_id,
            team_id: team.id,
            athlete_id: userId,
            alert_type: "consecutive_absences",
            message: `${name} has missed ${consecutive} consecutive practices on ${team.name}.`,
          });
          alertsCreated++;
        }
      }

      // ── 2. Team attendance below 60% this week ────────────────────────────
      const { data: weekAttendance } = await supabase
        .from("attendance_records")
        .select("status")
        .eq("team_id", team.id)
        .gte("practice_date", daysAgo(7));

      if (weekAttendance && weekAttendance.length > 0) {
        const present = weekAttendance.filter((r: any) => r.status === "present").length;
        const rate = present / weekAttendance.length;
        if (rate < 0.60) {
          await insertAlert({
            org_id,
            team_id: team.id,
            athlete_id: null,
            alert_type: "low_attendance",
            message: `${team.name} had ${Math.round(rate * 100)}% attendance this week (below 60% threshold).`,
          });
          alertsCreated++;
        }
      }

      // ── 3. No activity logged in 7+ days ─────────────────────────────────
      const { data: recentErg } = await supabase
        .from("erg_workouts")
        .select("workout_date")
        .in("user_id", memberIds)
        .gte("workout_date", daysAgo(7))
        .limit(1);

      if (!recentErg || recentErg.length === 0) {
        await insertAlert({
          org_id,
          team_id: team.id,
          athlete_id: null,
          alert_type: "no_activity",
          message: `${team.name} has no erg activity logged in the last 7 days.`,
        });
        alertsCreated++;
      }

      // ── 4. Performance decline (2k getting slower over 3+ weeks) ─────────
      const threeWeeksAgo = daysAgo(21);
      const { data: ergScores } = await supabase
        .from("erg_workouts")
        .select("user_id, workout_date, best_split_seconds")
        .in("user_id", memberIds)
        .gte("workout_date", threeWeeksAgo)
        .eq("workout_type", "2k")
        .order("workout_date", { ascending: true });

      const athleteScores: Record<string, number[]> = {};
      (ergScores || []).forEach((w: any) => {
        if (!w.best_split_seconds) return;
        if (!athleteScores[w.user_id]) athleteScores[w.user_id] = [];
        athleteScores[w.user_id].push(w.best_split_seconds);
      });

      for (const [userId, splits] of Object.entries(athleteScores)) {
        if (splits.length < 3) continue;
        const isDecline = splits[splits.length - 1] > splits[0] * 1.02; // 2%+ slower
        if (isDecline) {
          const { data: p } = await supabase.from("profiles").select("full_name, username").eq("id", userId).maybeSingle();
          const name = p?.full_name || p?.username || "Unknown";
          await insertAlert({
            org_id,
            team_id: team.id,
            athlete_id: userId,
            alert_type: "performance_decline",
            message: `${name}'s 2K split has been declining over the last 3 weeks on ${team.name}.`,
          });
          alertsCreated++;
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, alerts_created: alertsCreated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-org-alerts error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
