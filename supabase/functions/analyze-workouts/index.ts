import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY");

    const { sessions } = await req.json();
    if (!sessions || sessions.length < 2) {
      return new Response(JSON.stringify({ error: "At least 2 sessions required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sessionDescriptions = sessions.map((s: any, i: number) => {
      const pieces = s.pieces || [];
      const avgSplit = s.avgSplit ? formatSplit(s.avgSplit) : "N/A";
      const pieceDetails = pieces.map((p: any) =>
        `  - Piece ${p.piece_number} (${p.piece_type}): ${p.distance}m, split ${formatSplit(p.average_split_seconds)}, rate ${p.stroke_rate || "N/A"} spm`
      ).join("\n");

      return `Session ${i + 1}: ${s.date} — ${s.boatName} (${s.boatClass})
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

    const prompt = `You are an expert rowing coach analyzing training session data for a competitive rowing program. Analyze these ${sessions.length} practice sessions and provide a structured coaching report.

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

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || "";

    const sections: Record<string, string> = {};
    const sectionKeys = [
      "STRONGEST SESSION",
      "PACING PATTERNS",
      "PERFORMANCE TREND",
      "CONDITIONS CORRELATION",
      "NEXT PRACTICE FOCUS",
      "ANOMALIES",
    ];

    for (let i = 0; i < sectionKeys.length; i++) {
      const key = sectionKeys[i];
      const nextKey = sectionKeys[i + 1];
      const start = text.indexOf(`**${key}**`);
      if (start === -1) continue;
      const contentStart = start + key.length + 4;
      const end = nextKey ? text.indexOf(`**${nextKey}**`) : text.length;
      sections[key] = text.slice(contentStart, end === -1 ? text.length : end).trim();
    }

    return new Response(JSON.stringify({ sections, raw: text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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
