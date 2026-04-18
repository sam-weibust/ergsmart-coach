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

    const body = await req.json();
    const { athlete1, athlete2 } = body;

    if (!athlete1 || !athlete2) {
      return new Response(JSON.stringify({ error: "Missing athlete data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `You are an expert rowing coach analyzing two athletes for boat seat placement.

Athlete 1: ${athlete1.name}
- Best 2k: ${athlete1.best2k || "N/A"} (${athlete1.best2k_watts ? athlete1.best2k_watts + "W" : "N/A"})
- Best 6k: ${athlete1.best6k || "N/A"}
- Avg watts/kg: ${athlete1.wpk || "N/A"}
- Training load (7d meters): ${athlete1.recent_meters || "N/A"}
- Fatigue score: ${athlete1.fatigue || "N/A"}/10
- Seat race wins: ${athlete1.seat_wins || 0}/${athlete1.seat_total || 0}
- Improvement rate (last 30d): ${athlete1.improvement || "N/A"}s

Athlete 2: ${athlete2.name}
- Best 2k: ${athlete2.best2k || "N/A"} (${athlete2.best2k_watts ? athlete2.best2k_watts + "W" : "N/A"})
- Best 6k: ${athlete2.best6k || "N/A"}
- Avg watts/kg: ${athlete2.wpk || "N/A"}
- Training load (7d meters): ${athlete2.recent_meters || "N/A"}
- Fatigue score: ${athlete2.fatigue || "N/A"}/10
- Seat race wins: ${athlete2.seat_wins || 0}/${athlete2.seat_total || 0}
- Improvement rate (last 30d): ${athlete2.improvement || "N/A"}s

Write a concise one-paragraph comparison of these two athletes, highlighting key differences in erg performance, training consistency, and development trajectory. Then on a new line write "RECOMMENDATION:" followed by a boat class recommendation (e.g., "Athlete 1 for the varsity 8+ stroke seat, Athlete 2 for the JV 4+") with a brief rationale.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    const parts = text.split("RECOMMENDATION:");
    const summary = parts[0].trim();
    const recommendation = parts[1]?.trim() || "";

    return new Response(JSON.stringify({ summary, recommendation }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
