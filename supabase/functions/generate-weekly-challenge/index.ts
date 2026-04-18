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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const { week_start } = body;

    if (!week_start) {
      return new Response(JSON.stringify({ error: "Missing week_start" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if challenge already exists
    const { data: existing } = await supabase
      .from("weekly_challenges")
      .select("*")
      .eq("week_start", week_start)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify(existing), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const month = new Date(week_start).getMonth(); // 0-11
    // Season phases: base = Aug-Oct (7-9), build = Nov-Jan (10-0), race_prep = Feb-Apr (1-3), peak = May-Jul (4-6)
    let season_phase = "base";
    if (month >= 10 || month === 0) season_phase = "build";
    else if (month >= 1 && month <= 3) season_phase = "race_prep";
    else if (month >= 4 && month <= 6) season_phase = "peak";

    const challengeTypes = ["fastest_2k_improvement", "most_meters", "consistent_splits", "highest_wpk_gain"];

    const prompt = `You are a rowing coach setting the weekly challenge for your athletes.

Current season phase: ${season_phase}
Week of: ${week_start}

Available challenge types:
- fastest_2k_improvement: athletes improve their 2k erg time the most vs last week
- most_meters: athletes log the most total erg meters this week
- consistent_splits: athletes maintain the most consistent split times during a 2k+ piece
- highest_wpk_gain: athletes show the highest watts-per-kilogram improvement vs last week

Season phase context:
- base: emphasize volume and aerobic development
- build: mix of volume and intensity
- race_prep: emphasize intensity and speed work
- peak: race simulation and speed

Choose the best challenge type for this season phase and write a short, motivating title (max 60 chars) and description (max 150 chars).

Respond in this exact JSON format:
{
  "challenge_type": "<type>",
  "title": "<title>",
  "description": "<description>",
  "reasoning": "<one sentence why>"
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const aiData = await response.json();
    const text = aiData.content?.[0]?.text || "{}";

    let parsed;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] || "{}");
    } catch {
      parsed = {
        challenge_type: season_phase === "base" ? "most_meters" : "fastest_2k_improvement",
        title: season_phase === "base" ? "Volume King Challenge" : "Speed Improvement Challenge",
        description: season_phase === "base" ? "Log the most meters this week!" : "Improve your 2k the most this week!",
        reasoning: "Defaulted based on season phase.",
      };
    }

    const { data: newChallenge, error } = await supabase
      .from("weekly_challenges")
      .insert({
        week_start,
        challenge_type: parsed.challenge_type || "most_meters",
        title: parsed.title || "Weekly Challenge",
        description: parsed.description || "Complete your training this week!",
        season_phase,
        ai_reasoning: parsed.reasoning,
      })
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify(newChallenge), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
