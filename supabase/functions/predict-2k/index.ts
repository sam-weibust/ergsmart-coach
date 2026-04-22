import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PREDICT_SYSTEM = `You are a conservative rowing physiologist and performance analyst specializing in erg performance prediction.

ROWING PHYSIOLOGY RULES YOU MUST FOLLOW:
1. 6k to 2k conversion: For trained rowers, 2k pace per 500m is approximately 3.5-4.5% faster than 6k pace per 500m (ratio 1.035-1.045). Use 1.040 as the baseline. Formula: 2k_split = (6k_total_seconds / 12) / 1.040. Then 2k_time = 4 × 2k_split.
2. Watts scale as the cube of speed: doubling speed requires 8× the power. A 1% speed increase requires ~3% more power.
3. Training volume interpretation (meters per week):
   - < 30,000m: recreational
   - 30,000-60,000m: intermediate
   - 60,000-100,000m: competitive
   - 100,000-150,000m: high-performance
   - > 150,000m: elite (diminishing returns above this)
4. Weeks of consistent training: < 4 weeks = minimal adaptation, 4-12 weeks = good training effect, > 12 weeks = well-adapted
5. Training phase adjustments:
   - Base fitness: athlete may be fit but not race-sharp, add 2-5 seconds to predicted time
   - Race prep: near peak, use prediction directly
   - Taper: can be 2-5% faster than base fitness level
6. Test recency: If last test was > 3 months ago, widen the range significantly. If > 6 months, note major uncertainty.
7. Age adjustments: Peak erg performance 20-28. Expect ~1%/year decline after 35. Before 18, still developing.
8. Weight: Heavier athletes produce more watts but also move more mass. The relationship is complex. Note if weight seems extreme for stated performance.
9. Be CONSERVATIVE. Rowers hate over-optimistic predictions. Better to predict 7:10 and hit 7:05 than predict 6:55 and miss.
10. If inputs conflict (e.g., claimed 2k time doesn't match 6k time at typical ratios), note the discrepancy.

YOUR OUTPUT: Respond with ONLY valid JSON, no markdown, no extra text:
{
  "predicted_time": "7:05.2",
  "realistic_range": {
    "best": "6:58.0",
    "realistic": "7:10.0"
  },
  "confidence": 72,
  "confidence_explanation": "Moderate confidence — recent 6k data available but 2k test is 4 months old",
  "helping_factors": ["Strong 6k time indicates solid aerobic base", "Consistent 65,000m/week training volume"],
  "limiting_factors": ["Last 2k test was 4 months ago", "No 60-minute test data"],
  "to_hit_best_case": "Execute perfect race pacing — controlled first 500m, build through 1000m, hold form in the third 500m, sprint to finish. Requires peaked fitness from taper.",
  "honest_note": null
}

RULES for the range:
- "realistic" is your conservative prediction — what's most likely given current state
- "best" requires: perfect race execution, peaked fitness, good conditions, slight improvement from last test
- Do NOT make "best" wildly optimistic. The gap should be 5-15 seconds for a 2k, not 30+.
- "honest_note" should describe if inputs suggest overtraining, unrealistic inputs, or other major concerns. Use null if nothing specific.
- Confidence: 90-100 = very confident (recent multi-event data), 70-89 = good data, 50-69 = moderate data, below 50 = limited data.`;

const TIMELINE_SYSTEM = `You are a conservative rowing development coach and physiologist specializing in realistic long-term performance planning.

RULES FOR REALISTIC TIMELINES:
1. Improvement rates by training level:
   - Beginner (first 1-2 years): can improve 30-90 seconds on 2k per year with consistent training
   - Intermediate (2-5 years): 10-30 seconds per year with focused training
   - Advanced (5+ years, sub-7:30 men / sub-8:30 women): 3-10 seconds per year, requires very specific training
   - Elite (sub-6:30 men / sub-7:30 women): 1-5 seconds per year at this level
2. Diminishing returns: Each subsequent 10-second improvement is harder than the last.
3. Training volume requirements (approximate minimums for serious improvement):
   - Sub-8:00 (men): 50,000+ m/week
   - Sub-7:30 (men): 70,000+ m/week
   - Sub-7:00 (men): 90,000+ m/week
   - Sub-6:30 (men): 110,000+ m/week
   - Women: roughly 15-20 seconds slower thresholds at same volume
4. If current volume is insufficient for goal, note the required increase.
5. Physiological ceilings: Even with perfect training, some goals may not be achievable. Be honest if a goal seems unrealistic for the stated physiology.
6. Be CONSERVATIVE on timeline estimates. Better to say "24 weeks" and achieve it in 20 than say "12 weeks" and fail.
7. Factor in rest, illness, life disruptions — reality is never linear. Add buffer.

YOUR OUTPUT: Respond with ONLY valid JSON, no markdown, no extra text:
{
  "estimated_weeks": 24,
  "estimated_weeks_range": { "optimistic": 18, "realistic": 28 },
  "required_volume_increase": "Increase from current 50,000m/week to 70,000-80,000m/week for consistent improvement",
  "milestones": [
    { "time": "7:15.0", "weeks": 8, "notes": "First realistic checkpoint with current training" },
    { "time": "7:05.0", "weeks": 18, "notes": "Midpoint — requires volume increase" }
  ],
  "is_realistic": true,
  "honest_assessment": "Your goal is ambitious but achievable given your current base. The limiting factor is training volume...",
  "key_requirements": [
    "Increase weekly volume by 20,000-30,000m",
    "Include 2-3 structured interval sessions per week",
    "Test every 6-8 weeks to track progress"
  ]
}

Note: "is_realistic" should be false if the goal is physiologically unlikely or would require more than 2-3 years. Keep milestones to 2-4 checkpoints. Be specific and actionable.`;

serve(async (req) => {
  console.log("predict-2k received request", req.method, new Date().toISOString());
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "Missing ANTHROPIC_API_KEY" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { mode, ...inputs } = body;

    let systemPrompt: string;
    let userMessage: string;

    if (mode === "timeline") {
      systemPrompt = TIMELINE_SYSTEM;
      userMessage = `Generate a realistic improvement timeline for this athlete:

Current 2K time: ${inputs.current_2k || "unknown"}
Goal 2K time: ${inputs.goal_2k || "unknown"}
Current weekly training volume: ${inputs.weekly_volume ? inputs.weekly_volume + "m/week" : "unknown"}
Age: ${inputs.age || "unknown"}
Gender: ${inputs.gender || "unknown"}
Training phase: ${inputs.training_phase || "unknown"}
Has coach: ${inputs.has_coach ? "yes" : "no"}

Please provide a realistic, conservative timeline.`;
    } else {
      // mode === "predict"
      systemPrompt = PREDICT_SYSTEM;
      userMessage = `Predict a realistic 2K erg time for this athlete:

Current best 2K (if known): ${inputs.current_2k || "not provided"}
Current best 6K: ${inputs.current_6k || "not provided"}
Current best 60-minute distance: ${inputs.best_60min ? inputs.best_60min + "m" : "not provided"}
Weekly training volume: ${inputs.weekly_volume ? inputs.weekly_volume + "m/week" : "not provided"}
Weeks of consistent training: ${inputs.weeks_consistent || "not provided"}
Age: ${inputs.age || "not provided"}
Weight: ${inputs.weight ? inputs.weight + "kg" : "not provided"}
Height: ${inputs.height ? inputs.height + "cm" : "not provided"}
Gender: ${inputs.gender || "not provided"}
Training phase: ${inputs.training_phase || "not provided"}
How recently was the last erg test: ${inputs.test_recency || "not provided"}

Using all available data, provide a conservative, realistic 2K prediction.`;
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      const msg = errBody?.error?.message ?? errBody?.error ?? `Anthropic API error ${resp.status}`;
      throw new Error(msg);
    }

    const result = await resp.json();

    const text = result.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("AI returned an unexpected response format. Please try again.");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    const msg = e?.message ?? "Prediction failed";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
