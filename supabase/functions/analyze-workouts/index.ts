import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, TTL } from "../_shared/cache.ts";
import { preflight, recordApiError, recordApiSuccess, jsonError } from "../_shared/aiGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "claude-haiku-4-5";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatSplit(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "--:--";
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) return jsonResponse({ error: "ANTHROPIC_API_KEY not configured" }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let body: any;
    try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON body" }, 400); }

    const { sessions, assignmentTitle, pieces, completedCount, totalCount, assignment_id } = body;

    if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
      return jsonResponse({ error: "sessions array is required and must not be empty" }, 400);
    }

    const isErgAssignment = !!assignmentTitle;

    // Cache for erg assignments by assignment_id + completed count
    let cacheKey: string | null = null;
    if (isErgAssignment && assignment_id) {
      cacheKey = `workout_analysis_${assignment_id}_${completedCount ?? sessions.length}`;
      const cached = await getCached(supabase, cacheKey);
      if (cached) {
        await logUsage(supabase, { function_name: "analyze-workouts", model: MODEL, input_tokens: 0, output_tokens: 0, cache_hit: true });
        return jsonResponse(cached);
      }
    }

    // Failsafe 9: circuit breaker (after cache check).
    const blocked = await preflight(supabase, { userId: null, functionName: "analyze-workouts", corsHeaders });
    if (blocked) return blocked;

    const truncatedSessions = sessions.slice(0, 20);

    let prompt: string;

    if (isErgAssignment) {
      const pieceTargets = (pieces || []).map((p: any) =>
        `  Piece ${p.piece_number} (${p.piece_type}): ${p.distance ? p.distance + "m" : "--"}, split ${formatSplit(p.target_split_seconds)}, SR ${p.target_stroke_rate || "--"}`
      ).join("\n");

      const athleteDescriptions = truncatedSessions.map((s: any, i: number) => {
        const name = s.athlete || s.boatName || `Athlete ${i + 1}`;
        const athletePieces = (s.pieces || []).map((p: any) =>
          `  - P${p.piece_number}: ${formatSplit(p.actual_split_seconds)}, SR ${p.actual_stroke_rate || "--"}`
        ).join("\n");
        return `${name}:\n${athletePieces || "  No pieces"}${s.notes ? " Notes: " + s.notes : ""}`;
      }).join("\n\n");

      prompt = `Rowing coach analyzing erg results. Workout: ${assignmentTitle}. Completion: ${completedCount ?? truncatedSessions.length}/${totalCount ?? truncatedSessions.length}

TARGETS:\n${pieceTargets || "None"}\n\nRESULTS:\n${athleteDescriptions}

Provide:\n**TEAM SUMMARY**\n**STANDOUT PERFORMANCES**\n**AREAS OF CONCERN**\n**PACING PATTERNS**\n**RECOMMENDATIONS**\nBe direct, reference split times, 2-3 sentences each section.`;
    } else {
      const sessionDescriptions = truncatedSessions.map((s: any, i: number) => {
        const piecesArr = s.pieces || [];
        const avgSplit = s.avgSplit ? formatSplit(s.avgSplit) : "N/A";
        const pieceDetails = piecesArr.map((p: any) =>
          `  ${p.distance || "--"}m, split ${formatSplit(p.average_split_seconds)}, rate ${p.stroke_rate || "N/A"}`
        ).join("\n");
        return `Session ${i + 1}: ${s.date || "?"} ${s.boatName || ""} | Split: ${avgSplit} | ${s.totalDistance || 0}m | Attendance: ${s.attendance}/${s.totalRoster}\n${pieceDetails}`;
      }).join("\n\n");

      prompt = `Rowing coach analyzing ${truncatedSessions.length} session(s).\n\n${sessionDescriptions}\n\nProvide:\n**STRONGEST SESSION**\n**PACING PATTERNS**\n**PERFORMANCE TREND**\n**CONDITIONS CORRELATION**\n**NEXT PRACTICE FOCUS**\n**ANOMALIES**\n2-4 sentences each.`;
    }

    const anthropicPayload = {
      model: MODEL,
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(anthropicPayload),
    });

    if (!response.ok) {
      console.error("Anthropic error:", await response.text());
      await recordApiError(supabase, "analyze-workouts");
      return jsonError(corsHeaders, 503, "AI service unavailable");
    }
    await recordApiSuccess(supabase, "analyze-workouts");

    const data = await response.json();
    const usage = data?.usage ?? {};
    const text = data.content?.[0]?.text ?? "";

    await logUsage(supabase, { function_name: "analyze-workouts", model: MODEL, input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, cache_hit: false });

    if (isErgAssignment) {
      const sectionKeys = ["TEAM SUMMARY", "STANDOUT PERFORMANCES", "AREAS OF CONCERN", "PACING PATTERNS", "RECOMMENDATIONS"];
      const sections: Record<string, string> = {};
      for (let i = 0; i < sectionKeys.length; i++) {
        const key = sectionKeys[i];
        const nextKey = sectionKeys[i + 1];
        const start = text.indexOf(`**${key}**`);
        if (start === -1) continue;
        const contentStart = start + key.length + 4;
        const end = nextKey ? text.indexOf(`**${nextKey}**`) : text.length;
        sections[key] = text.slice(contentStart, end === -1 ? text.length : end).trim();
      }
      const result = { analysis: text, sections, raw: text };
      if (cacheKey) await setCached(supabase, cacheKey, result, TTL.HOUR, MODEL, usage.input_tokens, usage.output_tokens);
      return jsonResponse(result);
    }

    const sectionKeys = ["STRONGEST SESSION", "PACING PATTERNS", "PERFORMANCE TREND", "CONDITIONS CORRELATION", "NEXT PRACTICE FOCUS", "ANOMALIES"];
    const sections: Record<string, string> = {};
    for (let i = 0; i < sectionKeys.length; i++) {
      const key = sectionKeys[i];
      const nextKey = sectionKeys[i + 1];
      const start = text.indexOf(`**${key}**`);
      if (start === -1) continue;
      const contentStart = start + key.length + 4;
      const end = nextKey ? text.indexOf(`**${nextKey}**`) : text.length;
      sections[key] = text.slice(contentStart, end === -1 ? text.length : end).trim();
    }

    return jsonResponse({ sections, raw: text });

  } catch (err: any) {
    console.error("[analyze-workouts] unhandled error:", err?.message);
    return jsonResponse({ error: err?.message ?? "Internal server error" }, 500);
  }
});
