import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function formatSplit(seconds: number): string {
  if (!seconds) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1);
  return `${m}:${s.padStart(4, "0")}`;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { team_id, season_id } = await req.json();
    if (!team_id || !season_id) {
      return new Response(JSON.stringify({ error: "Missing team_id or season_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch team and season info
    const [teamRes, seasonRes] = await Promise.all([
      supabase.from("teams").select("name").eq("id", team_id).single(),
      supabase.from("team_seasons").select("*").eq("id", season_id).single(),
    ]);

    const teamName = teamRes.data?.name || "Team";
    const season = seasonRes.data;
    const seasonName = season?.name || "Season";
    const seasonStart = season?.start_date || "2024-01-01";
    const seasonEnd = season?.end_date || new Date().toISOString().split("T")[0];

    // Fetch all data in parallel
    const [
      practicesRes,
      ergScoresRes,
      onwaterRes,
      seatRacesRes,
      loadRes,
      boatsRes,
      membersRes,
    ] = await Promise.all([
      supabase.from("practice_entries").select("*").eq("team_id", team_id)
        .gte("practice_date", seasonStart).lte("practice_date", seasonEnd),
      supabase.from("erg_scores").select("*").eq("team_id", team_id).eq("test_type", "2k")
        .gte("recorded_at", seasonStart).lte("recorded_at", seasonEnd + "T23:59:59")
        .order("recorded_at", { ascending: true }),
      supabase.from("onwater_results").select("*").eq("team_id", team_id)
        .gte("result_date", seasonStart).lte("result_date", seasonEnd)
        .order("result_date", { ascending: true }),
      supabase.from("seat_races").select("*").eq("team_id", team_id)
        .gte("race_date", seasonStart).lte("race_date", seasonEnd),
      supabase.from("weekly_load_logs").select("*").eq("team_id", team_id)
        .gte("week_start", seasonStart).lte("week_start", seasonEnd)
        .order("week_start", { ascending: true }),
      supabase.from("team_boats").select("*").eq("team_id", team_id),
      supabase.from("team_members").select("*, profile:profiles(id, full_name, username, best_2k_seconds)")
        .eq("team_id", team_id),
    ]);

    const practices = practicesRes.data || [];
    const ergScores = ergScoresRes.data || [];
    const onwaterResults = onwaterRes.data || [];
    const seatRaces = seatRacesRes.data || [];
    const loadLogs = loadRes.data || [];
    const boats = boatsRes.data || [];
    const members = membersRes.data || [];

    // Calculate stats
    const totalPractices = practices.length;
    const totalOnwaterMeters = onwaterResults.reduce((sum: number, r: any) => sum + (r.distance_meters || 0), 0);

    // Avg 2k at start vs end
    const midPoint = new Date((new Date(seasonStart).getTime() + new Date(seasonEnd).getTime()) / 2).toISOString();
    const earlyScores = ergScores.filter((s: any) => s.recorded_at <= midPoint);
    const lateScores = ergScores.filter((s: any) => s.recorded_at > midPoint);
    const avgEarlySeconds = earlyScores.length
      ? earlyScores.reduce((s: number, r: any) => s + (r.time_seconds || 0), 0) / earlyScores.length : 0;
    const avgLateSeconds = lateScores.length
      ? lateScores.reduce((s: number, r: any) => s + (r.time_seconds || 0), 0) / lateScores.length : 0;

    // Top 5 improvers
    const improvementMap = new Map<string, { name: string; improveSec: number }>();
    for (const m of members) {
      const profile = m.profile;
      if (!profile) continue;
      const athleteScores = ergScores
        .filter((s: any) => s.user_id === profile.id && s.time_seconds)
        .sort((a: any, b: any) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
      if (athleteScores.length >= 2) {
        const improve = athleteScores[0].time_seconds - athleteScores[athleteScores.length - 1].time_seconds;
        if (improve > 0) {
          improvementMap.set(profile.id, {
            name: profile.full_name || profile.username || "Athlete",
            improveSec: improve,
          });
        }
      }
    }
    const top5Improvers = Array.from(improvementMap.values())
      .sort((a, b) => b.improveSec - a.improveSec)
      .slice(0, 5);

    // Attendance rate
    const attendanceRes = await supabase
      .from("practice_attendance")
      .select("status")
      .in("lineup_id", practices.filter((p: any) => p.lineup_id).map((p: any) => p.lineup_id));
    const attendanceData = attendanceRes.data || [];
    const totalResponses = attendanceData.length;
    const yesResponses = attendanceData.filter((a: any) => a.status === "yes").length;
    const attendanceRate = totalResponses > 0 ? Math.round((yesResponses / totalResponses) * 100) : null;

    // Regattas / race events
    const regattas = onwaterResults.filter((r: any) => r.piece_type === "race" || r.event_name);

    // Best splits per boat per event
    const boatBestSplits = new Map<string, { boatName: string; bestSplit: number; event: string }>();
    for (const r of onwaterResults) {
      if (!r.avg_split_seconds) continue;
      const boatId = r.boat_id || r.boat_class;
      const existing = boatBestSplits.get(boatId);
      if (!existing || r.avg_split_seconds < existing.bestSplit) {
        const boat = boats.find((b: any) => b.id === r.boat_id);
        boatBestSplits.set(boatId, {
          boatName: boat?.name || r.boat_class || boatId,
          bestSplit: r.avg_split_seconds,
          event: r.event_name || r.piece_type || "Practice",
        });
      }
    }

    // Weekly load summary
    const weeklyLoad = loadLogs.map((l: any) => ({
      week: l.week_start,
      totalMeters: (l.on_water_meters || 0) + (l.erg_meters || 0),
    }));

    // Build PDF
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const PAGE_WIDTH = 612;
    const PAGE_HEIGHT = 792;
    const MARGIN = 48;
    const COL_WIDTH = PAGE_WIDTH - MARGIN * 2;

    let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;

    function checkPage(needed = 40) {
      if (y < MARGIN + needed) {
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }
    }

    function drawText(text: string, x: number, size: number, isBold = false, color = rgb(0.1, 0.1, 0.1)) {
      page.drawText(text, { x, y, size, font: isBold ? boldFont : font, color });
      y -= size + 4;
    }

    function drawLine() {
      page.drawLine({ start: { x: MARGIN, y: y + 2 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 2 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
      y -= 8;
    }

    function drawSection(title: string) {
      checkPage(60);
      y -= 8;
      page.drawRectangle({ x: MARGIN, y: y - 4, width: COL_WIDTH, height: 22, color: rgb(0.12, 0.22, 0.4) });
      page.drawText(title, { x: MARGIN + 8, y: y, size: 11, font: boldFont, color: rgb(1, 1, 1) });
      y -= 24;
    }

    // Header
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 80, width: PAGE_WIDTH, height: 80, color: rgb(0.12, 0.22, 0.4) });
    page.drawText(teamName, { x: MARGIN, y: PAGE_HEIGHT - 38, size: 22, font: boldFont, color: rgb(1, 1, 1) });
    page.drawText(`${seasonName} · Season Report`, { x: MARGIN, y: PAGE_HEIGHT - 60, size: 13, font, color: rgb(0.7, 0.8, 1) });
    page.drawText(`Generated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, {
      x: MARGIN, y: PAGE_HEIGHT - 76, size: 9, font, color: rgb(0.6, 0.7, 0.9),
    });
    y = PAGE_HEIGHT - 100;

    // Summary stats
    drawSection("Season Summary");
    const stats = [
      ["Total Practices Logged", String(totalPractices)],
      ["Total On-Water Meters", totalOnwaterMeters.toLocaleString() + "m"],
      ["Season", `${seasonStart} → ${seasonEnd}`],
      attendanceRate !== null ? ["Practice Attendance Rate", `${attendanceRate}%`] : null,
      ["Seat Races Conducted", String(seatRaces.length)],
      ["Regattas / Race Events", String(regattas.length)],
    ].filter(Boolean) as string[][];

    for (const [label, value] of stats) {
      checkPage(20);
      page.drawText(label, { x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
      page.drawText(value, { x: MARGIN + 240, y, size: 10, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
      y -= 18;
    }

    // 2K improvement
    if (avgEarlySeconds > 0 || avgLateSeconds > 0) {
      drawSection("Team 2K Performance");
      if (avgEarlySeconds > 0) {
        checkPage(20);
        page.drawText("Avg 2K at Season Start", { x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
        page.drawText(formatTime(avgEarlySeconds), { x: MARGIN + 240, y, size: 10, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
        y -= 18;
      }
      if (avgLateSeconds > 0) {
        checkPage(20);
        page.drawText("Avg 2K at Season End", { x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
        page.drawText(formatTime(avgLateSeconds), { x: MARGIN + 240, y, size: 10, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
        y -= 18;
      }
      if (avgEarlySeconds > 0 && avgLateSeconds > 0) {
        const improveSec = avgEarlySeconds - avgLateSeconds;
        checkPage(20);
        page.drawText("Team Improvement", { x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
        const color = improveSec > 0 ? rgb(0.1, 0.6, 0.2) : rgb(0.8, 0.2, 0.2);
        page.drawText(`${improveSec > 0 ? "-" : "+"}${formatTime(Math.abs(improveSec))}`, {
          x: MARGIN + 240, y, size: 10, font: boldFont, color,
        });
        y -= 18;
      }
    }

    // Top improvers
    if (top5Improvers.length > 0) {
      drawSection("Top 5 Athletes by Improvement");
      for (let i = 0; i < top5Improvers.length; i++) {
        checkPage(20);
        const imp = top5Improvers[i];
        page.drawText(`${i + 1}. ${imp.name}`, { x: MARGIN, y, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
        page.drawText(`-${formatTime(imp.improveSec)}`, { x: MARGIN + 280, y, size: 10, font: boldFont, color: rgb(0.1, 0.6, 0.2) });
        y -= 18;
      }
    }

    // Regattas / Results
    if (onwaterResults.length > 0) {
      drawSection("On-Water Results");
      // Group by event date
      const grouped = new Map<string, any[]>();
      for (const r of onwaterResults) {
        const key = r.result_date;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(r);
      }
      for (const [date, results] of grouped) {
        checkPage(30);
        page.drawText(new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }), {
          x: MARGIN, y, size: 10, font: boldFont, color: rgb(0.1, 0.1, 0.1),
        });
        y -= 16;
        for (const r of results) {
          checkPage(16);
          const boatName = boats.find((b: any) => b.id === r.boat_id)?.name || r.boat_class || "";
          const split = r.avg_split_seconds ? ` · ${formatSplit(parseFloat(String(r.avg_split_seconds)))}/500m avg` : "";
          const dist = r.distance_meters ? ` ${r.distance_meters}m` : "";
          page.drawText(`  ${boatName}${dist}${split}`, { x: MARGIN, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
          y -= 14;
        }
      }
    }

    // Best splits per boat
    if (boatBestSplits.size > 0) {
      drawSection("Best Splits Per Boat");
      for (const [, { boatName, bestSplit, event }] of boatBestSplits) {
        checkPage(20);
        page.drawText(boatName, { x: MARGIN, y, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
        page.drawText(formatSplit(bestSplit) + "/500m", { x: MARGIN + 180, y, size: 10, font: boldFont, color: rgb(0.1, 0.3, 0.7) });
        page.drawText(event, { x: MARGIN + 300, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
        y -= 18;
      }
    }

    // Seat race summary
    if (seatRaces.length > 0) {
      drawSection("Seat Race Summary");
      checkPage(20);
      page.drawText(`Total seat races: ${seatRaces.length}`, { x: MARGIN, y, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
      y -= 18;
      for (const sr of seatRaces.slice(0, 10)) {
        checkPage(16);
        const dateStr = sr.race_date ? new Date(sr.race_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
        page.drawText(`  ${dateStr} · ${sr.boat_class || ""} · ${sr.notes || "Race conducted"}`, {
          x: MARGIN, y, size: 9, font, color: rgb(0.3, 0.3, 0.3),
        });
        y -= 14;
      }
    }

    // Weekly load summary
    if (weeklyLoad.length > 0) {
      drawSection("Training Volume by Week");
      const maxMeters = Math.max(...weeklyLoad.map(w => w.totalMeters), 1);
      const BAR_MAX = 220;
      for (const week of weeklyLoad) {
        checkPage(22);
        const barWidth = (week.totalMeters / maxMeters) * BAR_MAX;
        page.drawText(week.week, { x: MARGIN, y: y + 2, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
        page.drawRectangle({ x: MARGIN + 80, y: y - 2, width: barWidth, height: 12, color: rgb(0.12, 0.22, 0.4) });
        page.drawText(`${(week.totalMeters / 1000).toFixed(1)}k`, {
          x: MARGIN + 80 + barWidth + 4, y: y + 2, size: 8, font, color: rgb(0.3, 0.3, 0.3),
        });
        y -= 18;
      }
    }

    // Per-boat history
    if (boats.length > 0) {
      for (const boat of boats) {
        const boatResults = onwaterResults.filter((r: any) => r.boat_id === boat.id);
        if (boatResults.length === 0) continue;
        checkPage(60);
        drawSection(`${boat.name} (${boat.boat_class})`);
        for (const r of boatResults) {
          checkPage(16);
          const dateStr = new Date(r.result_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
          const split = r.avg_split_seconds ? formatSplit(parseFloat(String(r.avg_split_seconds))) + "/500m" : "";
          const dist = r.distance_meters ? r.distance_meters + "m" : "";
          page.drawText(`${dateStr}  ${dist}  ${split}  ${r.notes || ""}`.trim(), {
            x: MARGIN, y, size: 9, font, color: rgb(0.3, 0.3, 0.3),
          });
          y -= 14;
        }
      }
    }

    // Footer on all pages
    const pageCount = pdfDoc.getPageCount();
    for (let i = 0; i < pageCount; i++) {
      const pg = pdfDoc.getPage(i);
      pg.drawText(`${teamName} · ${seasonName} · Page ${i + 1} of ${pageCount}`, {
        x: MARGIN, y: 20, size: 8, font, color: rgb(0.6, 0.6, 0.6),
      });
    }

    const pdfBytes = await pdfDoc.save();
    const base64 = btoa(String.fromCharCode(...pdfBytes));

    return new Response(JSON.stringify({ pdf_base64: base64, success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-season-report error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
