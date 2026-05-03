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
    if (!ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { user_id, team_id, is_team_analysis } = body;

    if (is_team_analysis && team_id) {
      return await analyzeTeam(supabase, team_id, ANTHROPIC_API_KEY, corsHeaders);
    } else if (user_id) {
      return await analyzeIndividual(supabase, user_id, ANTHROPIC_API_KEY, corsHeaders);
    } else {
      return new Response(JSON.stringify({ error: "user_id or team_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function analyzeIndividual(supabase: any, userId: string, apiKey: string, corsHeaders: any) {
  const cutoff90 = new Date();
  cutoff90.setDate(cutoff90.getDate() - 90);
  const cutoff90Str = cutoff90.toISOString().split("T")[0];

  const cutoff12w = new Date();
  cutoff12w.setDate(cutoff12w.getDate() - 84);
  const cutoff12wStr = cutoff12w.toISOString().split("T")[0];

  const [ergScoresRes, loadLogsRes, profileRes, whoopRes, onWaterRes] = await Promise.all([
    supabase
      .from("erg_scores")
      .select("test_type, time_seconds, total_meters, avg_split_seconds, watts, watts_per_kg, recorded_at")
      .eq("user_id", userId)
      .gte("recorded_at", cutoff90Str)
      .order("recorded_at", { ascending: true }),
    supabase
      .from("weekly_load_logs")
      .select("week_start, total_meters, erg_meters, on_water_meters, fatigue_score")
      .eq("user_id", userId)
      .gte("week_start", cutoff12wStr)
      .order("week_start", { ascending: true }),
    supabase
      .from("profiles")
      .select("full_name, weight_kg")
      .eq("id", userId)
      .single(),
    supabase
      .from("whoop_recovery")
      .select("date, recovery_score, hrv_rmssd, resting_heart_rate, sleep_performance_percentage")
      .eq("user_id", userId)
      .gte("date", cutoff90Str)
      .order("date", { ascending: true }),
    supabase
      .from("onwater_results")
      .select("result_date, piece_type, distance_meters, avg_split_seconds, conditions")
      .gte("result_date", cutoff90Str)
      .order("result_date", { ascending: true }),
  ]);

  const ergScores = ergScoresRes.data || [];
  const loadLogs = loadLogsRes.data || [];
  const profile = profileRes.data;
  const whoopData = whoopRes.data || [];
  const onWaterData = onWaterRes.data || [];

  const ergByWeek: Record<string, { meters: number; sessions: number }> = {};
  for (const s of ergScores) {
    const week = getWeekStart(s.recorded_at);
    if (!ergByWeek[week]) ergByWeek[week] = { meters: 0, sessions: 0 };
    if (s.total_meters) ergByWeek[week].meters += s.total_meters;
    ergByWeek[week].sessions += 1;
  }

  const twokScores = ergScores.filter((s: any) => s.test_type === "2k" || s.total_meters === 2000);
  const allWatts = ergScores.filter((s: any) => s.watts).map((s: any) => ({ date: s.recorded_at, watts: Number(s.watts) }));
  const allWkg = ergScores.filter((s: any) => s.watts_per_kg).map((s: any) => ({ date: s.recorded_at, wkg: Number(s.watts_per_kg) }));

  const sortedByWatts = [...allWatts].sort((a, b) => b.watts - a.watts);
  const bestEffort = sortedByWatts[0];
  const worstEffort = sortedByWatts[sortedByWatts.length - 1];

  const ergScoreLines = ergScores.map((s: any) =>
    `  ${s.recorded_at}: ${s.test_type} — split ${formatSplit(s.avg_split_seconds)}, watts ${s.watts || "N/A"}, W/kg ${s.watts_per_kg || "N/A"}, meters ${s.total_meters || "N/A"}`
  ).join("\n");

  const loadLines = loadLogs.map((l: any) =>
    `  Week of ${l.week_start}: erg ${l.erg_meters || 0}m + on_water ${l.on_water_meters || 0}m = ${l.total_meters || 0}m total, fatigue ${l.fatigue_score || "N/A"}/10`
  ).join("\n");

  const whoopLines = whoopData.length > 0 ? whoopData.slice(-14).map((w: any) =>
    `  ${w.date}: recovery ${w.recovery_score}%, HRV ${w.hrv_rmssd || "N/A"}, RHR ${w.resting_heart_rate || "N/A"}, sleep ${w.sleep_performance_percentage || "N/A"}%`
  ).join("\n") : "  No Whoop data connected.";

  const onWaterLines = onWaterData.length > 0 ? onWaterData.map((r: any) =>
    `  ${r.result_date}: ${r.piece_type} ${r.distance_meters || "?"}m, split ${formatSplit(r.avg_split_seconds)}`
  ).join("\n") : "  No on-water data.";

  const prompt = `You are an expert rowing performance coach analyzing an individual athlete's data. Provide a detailed, data-driven analysis.

ATHLETE: ${profile?.full_name || "Unknown"}
WEIGHT: ${profile?.weight_kg ? `${profile.weight_kg}kg` : "Not recorded"}

ERG SCORES (last 90 days):
${ergScoreLines || "  No erg scores logged."}

BEST EFFORT: ${bestEffort ? `${bestEffort.watts}W on ${bestEffort.date}` : "N/A"}
WORST EFFORT: ${worstEffort ? `${worstEffort.watts}W on ${worstEffort.date}` : "N/A"}

2K SCORES SPECIFICALLY:
${twokScores.length > 0 ? twokScores.map((s: any) => `  ${s.recorded_at}: ${formatSplit(s.avg_split_seconds)} split, ${s.watts || "N/A"}W`).join("\n") : "  None logged."}

W/KG TREND:
${allWkg.map((w: any) => `  ${w.date}: ${w.wkg} W/kg`).join("\n") || "  No W/kg data."}

TRAINING LOAD (last 12 weeks):
${loadLines || "  No load data logged."}

WHOOP RECOVERY (last 14 days):
${whoopLines}

ON-WATER SESSIONS:
${onWaterLines}

Analyze this data and provide a structured response with these EXACT section headers:

**OVERALL TRAJECTORY**
Is the athlete improving or declining? At what rate? Cite specific data points.

**STRONGEST AND WEAKEST PERIODS**
Which training weeks/periods showed the best performance and why? What correlated with peak performance vs. decline?

**PREDICTED 2K TIME**
Based on current trajectory and watts, what is the predicted 2k time? Show your calculation.

**SPECIFIC WEAKNESSES**
What specific technical or training weaknesses does the data reveal? (e.g., pacing consistency, training volume, recovery)

**NEXT 4 WEEKS RECOMMENDATIONS**
5 specific, actionable training recommendations for the next 4 weeks based on this data. Be precise with volumes and intensities.

Be direct, cite specific numbers, keep each section to 3-5 sentences.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text || "";

  const sections = parseSections(text, [
    "OVERALL TRAJECTORY",
    "STRONGEST AND WEAKEST PERIODS",
    "PREDICTED 2K TIME",
    "SPECIFIC WEAKNESSES",
    "NEXT 4 WEEKS RECOMMENDATIONS",
  ]);

  return new Response(JSON.stringify({ sections, raw: text, type: "individual" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function analyzeTeam(supabase: any, teamId: string, apiKey: string, corsHeaders: any) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const cutoff12w = new Date();
  cutoff12w.setDate(cutoff12w.getDate() - 84);
  const cutoff12wStr = cutoff12w.toISOString().split("T")[0];

  const [ergScoresRes, loadLogsRes, membersRes, attendanceRes] = await Promise.all([
    supabase
      .from("erg_scores")
      .select("user_id, test_type, watts, watts_per_kg, avg_split_seconds, recorded_at, total_meters")
      .eq("team_id", teamId)
      .gte("recorded_at", cutoffStr)
      .order("recorded_at", { ascending: true }),
    supabase
      .from("weekly_load_logs")
      .select("user_id, week_start, total_meters, erg_meters, on_water_meters, fatigue_score")
      .eq("team_id", teamId)
      .gte("week_start", cutoff12wStr)
      .order("week_start", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", (await supabase.from("team_members").select("user_id").eq("team_id", teamId)).data?.map((m: any) => m.user_id) || []),
    supabase
      .from("practice_attendance")
      .select("user_id, lineup_id, status")
      .gte("created_at", cutoffStr),
  ]);

  const ergScores = ergScoresRes.data || [];
  const loadLogs = loadLogsRes.data || [];
  const members = membersRes.data || [];
  const attendance = attendanceRes.data || [];

  const memberMap: Record<string, string> = {};
  for (const m of members) memberMap[m.id] = m.full_name || m.id.slice(0, 8);

  const byAthlete: Record<string, { scores: any[]; name: string }> = {};
  for (const s of ergScores) {
    if (!byAthlete[s.user_id]) byAthlete[s.user_id] = { scores: [], name: memberMap[s.user_id] || s.user_id.slice(0, 8) };
    byAthlete[s.user_id].scores.push(s);
  }

  const athleteLines = Object.values(byAthlete).map((a: any) => {
    const watts = a.scores.filter((s: any) => s.watts).map((s: any) => Number(s.watts));
    const first = watts[0];
    const last = watts[watts.length - 1];
    const change = first && last ? ((last - first) / first * 100).toFixed(1) : "N/A";
    const maxW = watts.length ? Math.max(...watts).toFixed(0) : "N/A";
    return `  ${a.name}: ${watts.length} scores, best ${maxW}W, trend ${change}%`;
  }).join("\n");

  const weeklyLoad: Record<string, { erg: number; ow: number; count: number }> = {};
  for (const l of loadLogs) {
    if (!weeklyLoad[l.week_start]) weeklyLoad[l.week_start] = { erg: 0, ow: 0, count: 0 };
    weeklyLoad[l.week_start].erg += l.erg_meters || 0;
    weeklyLoad[l.week_start].ow += l.on_water_meters || 0;
    weeklyLoad[l.week_start].count += 1;
  }

  const loadLines = Object.entries(weeklyLoad).sort().map(([week, d]) =>
    `  Week of ${week}: avg erg ${Math.round(d.erg / Math.max(d.count, 1))}m + OW ${Math.round(d.ow / Math.max(d.count, 1))}m per athlete`
  ).join("\n");

  const twokTeamByWeek: Record<string, number[]> = {};
  const twokScores = ergScores.filter((s: any) => s.test_type === "2k" || s.total_meters === 2000);
  for (const s of twokScores) {
    const week = getWeekStart(s.recorded_at);
    if (!twokTeamByWeek[week]) twokTeamByWeek[week] = [];
    if (s.watts) twokTeamByWeek[week].push(Number(s.watts));
  }
  const teamWattsLines = Object.entries(twokTeamByWeek).sort().map(([week, watts]) =>
    `  Week of ${week}: avg team 2k = ${(watts.reduce((a, b) => a + b, 0) / watts.length).toFixed(0)}W (${watts.length} athletes)`
  ).join("\n");

  const attendanceByMember: Record<string, { present: number; total: number }> = {};
  for (const a of attendance) {
    if (!attendanceByMember[a.user_id]) attendanceByMember[a.user_id] = { present: 0, total: 0 };
    attendanceByMember[a.user_id].total += 1;
    if (a.status === "present") attendanceByMember[a.user_id].present += 1;
  }
  const attendanceLines = Object.entries(attendanceByMember).map(([uid, d]) =>
    `  ${memberMap[uid] || uid.slice(0, 8)}: ${d.present}/${d.total} (${Math.round(d.present / Math.max(d.total, 1) * 100)}%)`
  ).join("\n");

  const prompt = `You are an expert rowing coach analyzing team-wide performance data. Provide a structured team analysis.

TEAM ERG SCORES (last 90 days) BY ATHLETE:
${athleteLines || "  No erg scores logged."}

AVERAGE TEAM 2K WATTS BY WEEK:
${teamWattsLines || "  No 2k data."}

TRAINING LOAD BY WEEK (last 12 weeks):
${loadLines || "  No load data."}

ATTENDANCE (last 90 days):
${attendanceLines || "  No attendance data."}

Analyze this data and provide a structured response with these EXACT section headers:

**TEAM TRAJECTORY**
Is the team overall improving or declining? Cite specific data. What is the trend line for average 2k?

**TOP AND BOTTOM PERFORMERS**
Who is improving fastest? Who needs the most attention? Cite names and specific numbers.

**TRAINING LOAD RECOMMENDATIONS**
Based on current load and fatigue data, what adjustments should be made for the next training block?

**ATTENDANCE PATTERNS**
Which athletes have attendance issues? Does attendance correlate with performance gains or losses?

**LINEUP RECOMMENDATIONS**
Based on current form and improvement rates, who should be prioritized for the top boat(s)?

**RED FLAGS**
Any athletes who are declining, overtraining, or showing concerning patterns that need immediate attention?

Be direct, cite specific athletes and numbers where available, keep each section to 3-5 sentences.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text || "";

  const sections = parseSections(text, [
    "TEAM TRAJECTORY",
    "TOP AND BOTTOM PERFORMERS",
    "TRAINING LOAD RECOMMENDATIONS",
    "ATTENDANCE PATTERNS",
    "LINEUP RECOMMENDATIONS",
    "RED FLAGS",
  ]);

  return new Response(JSON.stringify({ sections, raw: text, type: "team" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseSections(text: string, keys: string[]): Record<string, string> {
  const sections: Record<string, string> = {};
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const nextKey = keys[i + 1];
    const start = text.indexOf(`**${key}**`);
    if (start === -1) continue;
    const contentStart = start + key.length + 4;
    const end = nextKey ? text.indexOf(`**${nextKey}**`) : text.length;
    sections[key] = text.slice(contentStart, end === -1 ? text.length : end).trim();
  }
  return sections;
}

function formatSplit(seconds: number | null): string {
  if (!seconds) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1);
  return `${m}:${s.padStart(4, "0")}`;
}

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return d.toISOString().split("T")[0];
}
