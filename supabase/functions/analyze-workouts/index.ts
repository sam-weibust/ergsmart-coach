import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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
    // Cause 1 — API key check
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    console.log("[analyze-workouts] ANTHROPIC_API_KEY present:", !!ANTHROPIC_API_KEY);
    if (!ANTHROPIC_API_KEY) {
      return jsonResponse({ error: "ANTHROPIC_API_KEY not configured in Supabase secrets" }, 500);
    }

    let body: any;
    try {
      body = await req.json();
    } catch (e) {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    console.log("[analyze-workouts] body keys:", Object.keys(body));

    const { sessions, assignmentTitle, pieces, completedCount, totalCount } = body;

    if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
      return jsonResponse({ error: "sessions array is required and must not be empty" }, 400);
    }

    // Cause 3 — Truncate large payloads (max 20 sessions)
    const truncatedSessions = sessions.slice(0, 20);
    console.log(`[analyze-workouts] sessions: ${sessions.length} (sending ${truncatedSessions.length})`);

    // Build a prompt that handles both on-water sessions and erg assignment results
    const isErgAssignment = !!assignmentTitle;

    let prompt: string;

    if (isErgAssignment) {
      // Erg assignment analysis mode
      const pieceTargets = (pieces || []).map((p: any) =>
        `  Piece ${p.piece_number} (${p.piece_type}): target ${p.distance ? p.distance + "m" : "--"}, split ${formatSplit(p.target_split_seconds)}, SR ${p.target_stroke_rate || "--"} spm`
      ).join("\n");

      const athleteDescriptions = truncatedSessions.map((s: any, i: number) => {
        const name = s.athlete || s.boatName || `Athlete ${i + 1}`;
        const athletePieces = (s.pieces || []).map((p: any) =>
          `  - Piece ${p.piece_number}: split ${formatSplit(p.actual_split_seconds)}, SR ${p.actual_stroke_rate || "--"} spm${p.notes ? ", notes: " + p.notes : ""}`
        ).join("\n");
        return `${name}:\n${athletePieces || "  No pieces logged"}${s.notes ? "\n  Notes: " + s.notes : ""}`;
      }).join("\n\n");

      prompt = `You are an expert rowing coach analyzing erg workout results.

Workout: ${assignmentTitle}
Completion: ${completedCount ?? truncatedSessions.length}/${totalCount ?? truncatedSessions.length} athletes

TARGET PIECES:
${pieceTargets || "No targets defined"}

ATHLETE RESULTS:
${athleteDescriptions}

Provide a structured coaching analysis:

**TEAM SUMMARY**
Overall performance vs targets. Who hit pace, who struggled.

**STANDOUT PERFORMANCES**
Best performances and why they stand out.

**AREAS OF CONCERN**
Athletes or pieces where splits were significantly off target.

**PACING PATTERNS**
Did athletes go out hard and fade, stay consistent, or build through the pieces?

**RECOMMENDATIONS**
3 specific, actionable coaching recommendations based on this data.

Be direct and data-driven. Reference specific split times. Keep each section to 2-3 sentences.`;
    } else {
      // On-water session analysis mode
      const sessionDescriptions = truncatedSessions.map((s: any, i: number) => {
        const piecesArr = s.pieces || [];
        const avgSplit = s.avgSplit ? formatSplit(s.avgSplit) : "N/A";
        const pieceDetails = piecesArr.map((p: any) =>
          `  - Piece ${p.piece_number} (${p.piece_type || ""}): ${p.distance || "--"}m, split ${formatSplit(p.average_split_seconds)}, rate ${p.stroke_rate || "N/A"} spm`
        ).join("\n");

        return `Session ${i + 1}: ${s.date || "unknown date"} — ${s.boatName || "unknown"} (${s.boatClass || ""})
  Planned workout: ${s.coachNotes || "N/A"}
  Avg split: ${avgSplit}
  Distance: ${s.totalDistance || 0}m
  Total time: ${s.totalTime ? formatTime(s.totalTime) : "N/A"}
  Stroke rate: ${s.avgStrokeRate || "N/A"} spm
  Attendance: ${s.attendance}/${s.totalRoster} athletes
  Weather: ${s.conditions || "N/A"}
  Wind: ${s.windConditions || "N/A"}, Water: ${s.waterConditions || "N/A"}
  Lineup: ${s.lineup || "N/A"}
  Pieces logged:
${pieceDetails || "  No pieces logged"}`;
      }).join("\n\n");

      prompt = `You are an expert rowing coach analyzing training session data for a competitive rowing program. Analyze these ${truncatedSessions.length} practice session${truncatedSessions.length !== 1 ? "s" : ""} and provide a structured coaching report.

SESSION DATA:
${sessionDescriptions}

Provide a structured analysis with these exact section headers:
**STRONGEST SESSION**
Which session performed best and why, citing specific split data.

**PACING PATTERNS**
How pacing strategy differed across sessions — did they go out hard and fade, stay consistent, or build?

**PERFORMANCE TREND**
Is the lineup improving, declining, or plateauing over time? What does the trajectory suggest?

**CONDITIONS CORRELATION**
What weather/water conditions correlated with better splits? Any notable patterns?

**NEXT PRACTICE FOCUS**
3 specific, actionable recommendations for the next practice based on this data.

**ANOMALIES**
Any unusual data points, concerning patterns, or things that don't fit the trend and warrant investigation.

Be direct, specific, and coaching-focused. Use split times and data to back every claim. Keep each section to 2-4 sentences.`;
    }

    console.log("[analyze-workouts] prompt length:", prompt.length, "chars");

    // Cause 2 — Correct model string
    const anthropicPayload = {
      model: "claude-sonnet-4-5",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    };

    console.log("[analyze-workouts] calling Anthropic API, model:", anthropicPayload.model);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(anthropicPayload),
    });

    console.log("[analyze-workouts] Anthropic response status:", response.status);

    if (!response.ok) {
      const errText = await response.text();
      console.error("[analyze-workouts] Anthropic error body:", errText);
      return jsonResponse({ error: `Anthropic API error ${response.status}: ${errText}` }, 502);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? "";
    console.log("[analyze-workouts] response text length:", text.length);

    if (isErgAssignment) {
      // Parse erg-specific sections
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
      return jsonResponse({ analysis: text, sections, raw: text });
    }

    // Parse on-water sections
    const sectionKeys = [
      "STRONGEST SESSION", "PACING PATTERNS", "PERFORMANCE TREND",
      "CONDITIONS CORRELATION", "NEXT PRACTICE FOCUS", "ANOMALIES",
    ];
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
    // Cause 5 — Never crash without returning a response
    console.error("[analyze-workouts] unhandled error:", err?.message, err?.stack);
    return jsonResponse({ error: err?.message ?? "Internal server error" }, 500);
  }
});
