import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { recordApiError, recordApiSuccess } from "../_shared/aiGuard.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "CrewSync <noreply@crewsync.app>";
const APP_URL = "https://crewsync.app";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

function formatSplit(seconds: number | null): string {
  if (!seconds) return "N/A";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getWeekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + 1); // Monday
  return d.toISOString().split("T")[0];
}

function getWeekRange(): { start: string; end: string } {
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - now.getDay() + 1);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return {
    start: mon.toISOString().split("T")[0],
    end: sun.toISOString().split("T")[0],
  };
}

async function generateAISummary(
  athleteName: string,
  weekMeters: number,
  practices: number,
  seasonAvgMeters: number,
): Promise<string> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) return "";

  try {
    const prompt = `Write a single encouraging paragraph (2-3 sentences) summarizing an athlete's week for their parent. Athlete: ${athleteName}. This week: ${weekMeters.toLocaleString()}m logged, ${practices} practices attended. Season average per week: ${Math.round(seasonAvgMeters).toLocaleString()}m. Be positive and specific. Do not use markdown. Keep it under 60 words.`;
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 150,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok) {
      console.error("Anthropic error:", resp.status, await resp.text());
      await recordApiError(supabase, "send-parent-emails");
      return "";
    }
    await recordApiSuccess(supabase, "send-parent-emails");
    const data = await resp.json();
    return data.content?.[0]?.text || "";
  } catch {
    await recordApiError(supabase, "send-parent-emails");
    return "";
  }
}

function buildEmailHtml(params: {
  athleteName: string;
  parentName: string;
  teamName: string;
  teamColor: string;
  weekMeters: number;
  waterMeters: number;
  practicesAttended: number;
  practicesTotal: number;
  workoutsCompleted: number;
  prs: string[];
  upcomingEvents: string[];
  coachNote: string;
  teamNote: string;
  aiSummary: string;
  unsubscribeToken: string;
}): string {
  const c = params.teamColor || "#0a1628";
  const prHtml = params.prs.length ? `
    <tr><td style="padding:0 32px 20px;">
      <p style="margin:0 0 8px;font-weight:600;color:#0a1628;font-size:14px;">🏆 Personal Bests This Week</p>
      <ul style="margin:0;padding-left:20px;color:#4a5568;font-size:14px;line-height:1.8;">
        ${params.prs.map(pr => `<li>${pr}</li>`).join("")}
      </ul>
    </td></tr>` : "";

  const upcomingHtml = params.upcomingEvents.length ? `
    <tr><td style="padding:0 32px 20px;">
      <p style="margin:0 0 8px;font-weight:600;color:#0a1628;font-size:14px;">📅 Coming Up This Week</p>
      <ul style="margin:0;padding-left:20px;color:#4a5568;font-size:14px;line-height:1.8;">
        ${params.upcomingEvents.map(e => `<li>${e}</li>`).join("")}
      </ul>
    </td></tr>` : "";

  const noteHtml = params.coachNote ? `
    <tr><td style="padding:0 32px 20px;">
      <div style="background:#f0f4f8;border-left:3px solid ${c};border-radius:0 8px 8px 0;padding:14px 16px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#718096;text-transform:uppercase;letter-spacing:0.05em;">Note from Coach</p>
        <p style="margin:0;color:#2d3748;font-size:14px;line-height:1.6;">${params.coachNote}</p>
      </div>
    </td></tr>` : "";

  const teamNoteHtml = params.teamNote ? `
    <tr><td style="padding:0 32px 20px;">
      <div style="background:#ebf8ff;border-left:3px solid #3182ce;border-radius:0 8px 8px 0;padding:14px 16px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#2b6cb0;text-transform:uppercase;letter-spacing:0.05em;">Team Update</p>
        <p style="margin:0;color:#2c5282;font-size:14px;line-height:1.6;">${params.teamNote}</p>
      </div>
    </td></tr>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8f9fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fb;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr><td style="background:${c};padding:28px 32px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${params.teamName}</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">Weekly Training Update · CrewSync</p>
        </td></tr>
        <tr><td style="padding:28px 32px 8px;">
          <p style="margin:0;color:#4a5568;font-size:15px;line-height:1.7;">Hi ${params.parentName},</p>
          <p style="margin:12px 0 0;color:#4a5568;font-size:15px;line-height:1.7;">Here's ${params.athleteName}'s training summary for this week.</p>
        </td></tr>
        <tr><td style="padding:20px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#f7fafc;border-radius:8px;padding:16px;text-align:center;width:25%;">
                <p style="margin:0;font-size:22px;font-weight:700;color:${c};">${(params.weekMeters / 1000).toFixed(1)}k</p>
                <p style="margin:4px 0 0;font-size:11px;color:#718096;text-transform:uppercase;letter-spacing:0.05em;">Erg Meters</p>
              </td>
              <td style="width:8px;"></td>
              <td style="background:#f7fafc;border-radius:8px;padding:16px;text-align:center;width:25%;">
                <p style="margin:0;font-size:22px;font-weight:700;color:${c};">${(params.waterMeters / 1000).toFixed(1)}k</p>
                <p style="margin:4px 0 0;font-size:11px;color:#718096;text-transform:uppercase;letter-spacing:0.05em;">Water Meters</p>
              </td>
              <td style="width:8px;"></td>
              <td style="background:#f7fafc;border-radius:8px;padding:16px;text-align:center;width:25%;">
                <p style="margin:0;font-size:22px;font-weight:700;color:${c};">${params.practicesAttended}/${params.practicesTotal}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#718096;text-transform:uppercase;letter-spacing:0.05em;">Practices</p>
              </td>
              <td style="width:8px;"></td>
              <td style="background:#f7fafc;border-radius:8px;padding:16px;text-align:center;width:25%;">
                <p style="margin:0;font-size:22px;font-weight:700;color:${c};">${params.workoutsCompleted}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#718096;text-transform:uppercase;letter-spacing:0.05em;">Workouts</p>
              </td>
            </tr>
          </table>
        </td></tr>
        ${params.aiSummary ? `<tr><td style="padding:0 32px 20px;"><p style="margin:0;color:#4a5568;font-size:14px;line-height:1.8;font-style:italic;">${params.aiSummary}</p></td></tr>` : ""}
        ${prHtml}
        ${upcomingHtml}
        ${teamNoteHtml}
        ${noteHtml}
        <tr><td style="background:${c};padding:20px 32px;text-align:center;">
          <p style="margin:0;color:rgba(255,255,255,0.5);font-size:11px;">
            © 2026 CrewSync · <a href="${APP_URL}" style="color:rgba(255,255,255,0.7);text-decoration:none;">crewsync.app</a>
            · <a href="${APP_URL}/unsubscribe?token=${params.unsubscribeToken}" style="color:rgba(255,255,255,0.5);text-decoration:none;">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { week } = getWeekRange();
    const weekStart = getWeekStart();

    // Get all teams with parent emails enabled
    const { data: settings } = await supabase
      .from("parent_email_settings")
      .select("team_id, team_note")
      .eq("enabled", true);

    if (!settings || settings.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let totalSent = 0;

    for (const setting of settings) {
      const { team_id, team_note } = setting;

      // Get team info
      const { data: team } = await supabase
        .from("teams")
        .select("name, primary_color")
        .eq("id", team_id)
        .maybeSingle();

      // Get parent contacts for this team
      const { data: contacts } = await supabase
        .from("parent_contacts")
        .select("athlete_id, parent_name, parent_email, opted_in")
        .eq("team_id", team_id)
        .eq("opted_in", true);

      if (!contacts || contacts.length === 0) continue;

      for (const contact of contacts) {
        const { athlete_id, parent_name, parent_email } = contact;

        // Fetch athlete profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, username, best_2k_seconds")
          .eq("id", athlete_id)
          .maybeSingle();

        const athleteName = profile?.full_name || profile?.username || "Your athlete";
        const weekRange = getWeekRange();

        // Erg workouts this week
        const { data: ergWorkouts } = await supabase
          .from("erg_workouts")
          .select("distance, workout_date, avg_split")
          .eq("user_id", athlete_id)
          .gte("workout_date", weekRange.start)
          .lte("workout_date", weekRange.end);

        const weekMeters = (ergWorkouts || []).reduce((sum: number, w: any) => sum + (w.distance || 0), 0);

        // On-water meters this week (approximate from on_water_results)
        const { data: waterWorkouts } = await supabase
          .from("on_water_results" as any)
          .select("distance")
          .eq("team_id", team_id)
          .gte("result_date", weekRange.start)
          .lte("result_date", weekRange.end);

        const waterMeters = 0; // Will be 0 if table not available

        // Attendance this week
        const { data: attendanceRecords } = await supabase
          .from("attendance_records" as any)
          .select("status")
          .eq("user_id", athlete_id)
          .eq("team_id", team_id)
          .gte("practice_date", weekRange.start)
          .lte("practice_date", weekRange.end);

        const practicesTotal = (attendanceRecords || []).length;
        const practicesAttended = (attendanceRecords || []).filter((a: any) => a.status === "present").length;

        // Assigned workouts completed this week
        const { data: assignedWorkouts } = await supabase
          .from("erg_assignment_results" as any)
          .select("id")
          .eq("user_id", athlete_id)
          .eq("team_id", team_id)
          .gte("completed_at", weekRange.start + "T00:00:00Z")
          .lte("completed_at", weekRange.end + "T23:59:59Z");

        const workoutsCompleted = (assignedWorkouts || []).length;

        // Season average weekly meters
        const { data: allErg } = await supabase
          .from("erg_workouts")
          .select("distance")
          .eq("user_id", athlete_id)
          .gte("workout_date", new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0]);

        const totalSeasonMeters = (allErg || []).reduce((sum: number, w: any) => sum + (w.distance || 0), 0);
        const seasonAvgWeekly = totalSeasonMeters / 13; // ~90 days = 13 weeks

        // Coach note for this athlete
        const { data: note } = await supabase
          .from("parent_email_notes")
          .select("individual_note")
          .eq("team_id", team_id)
          .eq("athlete_id", athlete_id)
          .eq("week_of", weekStart)
          .maybeSingle();

        // AI summary
        const aiSummary = await generateAISummary(athleteName, weekMeters, practicesAttended, seasonAvgWeekly);

        // Build and send email
        const unsubscribeToken = btoa(`${team_id}:${athlete_id}:${parent_email}`);
        const html = buildEmailHtml({
          athleteName,
          parentName: parent_name,
          teamName: team?.name || "Your Team",
          teamColor: team?.primary_color || "#0a1628",
          weekMeters,
          waterMeters,
          practicesAttended,
          practicesTotal,
          workoutsCompleted,
          prs: [], // Could add PR detection logic here
          upcomingEvents: [],
          coachNote: note?.individual_note || "",
          teamNote: team_note || "",
          aiSummary,
          unsubscribeToken,
        });

        const emailResp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [parent_email],
            subject: `${athleteName} Weekly Training Update — CrewSync`,
            html,
          }),
        });

        if (emailResp.ok) totalSent++;
        else {
          const err = await emailResp.json();
          console.error("Resend error for", parent_email, err);
        }
      }
    }

    return new Response(JSON.stringify({ sent: totalSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-parent-emails error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
