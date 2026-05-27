import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, TTL } from "../_shared/cache.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FALLBACK_PHILOSOPHY = `You are generating training plans following a competitive high school rowing program methodology.

ZONE SYSTEM (paces relative to athlete 2k time per 500m):
UT2: 2k+20-25s, rate 16-20. Pure aerobic base.
UT1: 2k+15-20s, rate 18-24. Moderate aerobic, rate ladders.
AT: 2k+4-9s, rate 26-28. Anaerobic threshold.
TR1: 2k+0-4s, rate 26-32. Threshold, hard pieces.
TR2: below 2k pace, rate 32+. Race specific, peak phase only within 6 weeks of race.

WEEKLY STRUCTURE (erg season Jan-Mar): Mon UT1+lift, Tue lift only, Wed UT2/UT1 high volume, Thu lift only, Fri AT/TR1 quality, Sat lift/rest, Sun off.
WEEKLY STRUCTURE (summer Jun-Aug): Mon lift, Tue TR1 required, Wed lift, Thu lift/UT1, Fri TR1/TR2, Sat lift, Sun off.

3-WEEK LOADING CYCLE: Week 1 easy, Week 2 medium, Week 3 hard, Week 4 recovery (50% volume).

Always specify piece duration/distance, rest interval, stroke rate, warmup, cooldown. Express paces as 2k +/- seconds, never absolute splits.`;

serve(async (req) => {
  console.log("generate-team-training-plan: function started");

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    console.log("generate-team-training-plan: ANTHROPIC_API_KEY present:", !!ANTHROPIC_API_KEY);
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { team_id, weeks, season_phase, practice_days_per_week, injured_athletes = [] } = await req.json();

    console.log("generate-team-training-plan: team_id:", team_id, "weeks:", weeks);

    // Cache per team + weeks + phase per calendar day
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `team_plan:${team_id}:${weeks}:${season_phase || "general"}:${today}`;
    const cached = await getCached(supabase, cacheKey);
    if (cached) {
      console.log("generate-team-training-plan: cache hit");
      await logUsage(supabase, { function_name: "generate-team-training-plan", model: "claude-sonnet-4-20250514", input_tokens: 0, output_tokens: 0, cache_hit: true });
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    const [loadRes, ergRes] = await Promise.all([
      supabase
        .from("weekly_load_logs")
        .select("user_id, fatigue_score, total_meters")
        .eq("team_id", team_id)
        .order("week_start", { ascending: false })
        .limit(30),
      supabase
        .from("erg_scores")
        .select("user_id, watts, test_type")
        .eq("team_id", team_id)
        .order("recorded_at", { ascending: false })
        .limit(50),
    ]);

    const loadData = loadRes.data;
    const ergScores = ergRes.data;

    console.log("generate-team-training-plan: fetching training philosophy");

    // Fetch training philosophy with fallback
    let philosophyPrompt = "";
    try {
      const [customPhilRes, defaultPhilRes] = await Promise.all([
        supabase
          .from("team_training_philosophy")
          .select("philosophy")
          .eq("team_id", team_id)
          .maybeSingle(),
        supabase
          .from("default_training_philosophy")
          .select("system_prompt")
          .eq("is_default", true)
          .maybeSingle(),
      ]);

      const customPhil = customPhilRes.data?.philosophy as { system_prompt?: string } | null;
      if (customPhil?.system_prompt) {
        philosophyPrompt = customPhil.system_prompt;
        console.log("generate-team-training-plan: using team custom philosophy, length:", philosophyPrompt.length);
      } else if (defaultPhilRes.data?.system_prompt) {
        philosophyPrompt = defaultPhilRes.data.system_prompt;
        console.log("generate-team-training-plan: using default philosophy, length:", philosophyPrompt.length);
      } else {
        console.warn("generate-team-training-plan: no philosophy found in DB, using fallback");
      }
    } catch (philErr) {
      console.error("generate-team-training-plan: philosophy fetch threw:", philErr);
    }

    // Cap philosophy to 1500 chars to prevent system prompt token overflow/timeouts
    if (philosophyPrompt.length > 1500) {
      philosophyPrompt = philosophyPrompt.slice(0, 1500) + "\n[see full methodology — follow all rules]";
    }

    if (!philosophyPrompt) {
      philosophyPrompt = FALLBACK_PHILOSOPHY;
    }

    const twokScores = ergScores?.filter(e => e.test_type === "2k") || [];
    const avgWatts2k = twokScores.length
      ? twokScores.reduce((acc, e) => acc + (e.watts || 0), 0) / twokScores.length
      : 0;

    const systemPrompt = `${philosophyPrompt}\n\nYou are generating a team training plan. Apply the methodology above to all sessions.`;

    console.log("generate-team-training-plan: system prompt built, total chars:", systemPrompt.length);

    const prompt = `Generate a ${weeks}-week team rowing training plan.

Season phase: ${season_phase || "general preparation"}
Practice days per week: ${practice_days_per_week || 5}
Injured/restricted athletes: ${JSON.stringify(injured_athletes)}
Team average 2k watts: ${avgWatts2k?.toFixed(0) || "unknown"}
High fatigue athletes: ${JSON.stringify(loadData?.filter(l => (l.fatigue_score || 0) >= 7).map(l => l.user_id) || [])}

Generate a complete multi-week plan. Each practice day has a REQUIRED primary session and an OPTIONAL secondary session.
- Required session: the main workout (warmup, main_set, cooldown, varsity_notes, novice_notes)
- Optional session: a lighter add-on (e.g. easy UT2 row, short cross-training). May be null if rest day with no optional work.
- Rest days: session_type="rest", required=null, optional may be an easy UT2 if appropriate.
- Zones: UT2 (easy), UT1 (moderate), TR1/TR2 (threshold/race prep), AT (anaerobic threshold)
- Express all target paces as 2k+Xs/500m or 2k-Xs/500m — never absolute splits
- Varsity gets higher volume (~20%) than novice. Fatigue athletes get reduced load.

Respond with ONLY valid JSON (no markdown):
{
  "weeks": [
    {
      "week": 1,
      "phase": "base|build|peak|taper",
      "focus": "e.g. aerobic base",
      "days": [
        {
          "day": 1,
          "day_name": "Monday",
          "session_type": "erg|on_water|rest|cross_training",
          "title": "Session title",
          "total_meters": 12000,
          "required": {
            "warmup": "10 min easy paddle",
            "main_set": [
              {"segment": 1, "description": "4x2000m", "distance": 2000, "repeats": 4, "zone": "UT1", "rate": 20, "rest": "3 min", "notes": ""}
            ],
            "cooldown": "10 min easy",
            "varsity_notes": "",
            "novice_notes": ""
          },
          "optional": {
            "title": "Optional UT2",
            "warmup": "5 min easy",
            "main_set": [
              {"segment": 1, "description": "20 min continuous", "distance": 4000, "repeats": 1, "zone": "UT2", "rate": 18, "rest": "", "notes": ""}
            ],
            "cooldown": "5 min easy"
          }
        }
      ]
    }
  ]
}`;

    console.log("generate-team-training-plan: calling Anthropic API, model: claude-sonnet-4-20250514");

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "anthropic-beta": "prompt-caching-2024-07-31", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    console.log("generate-team-training-plan: Anthropic response status:", resp.status);

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("generate-team-training-plan: Anthropic error body:", errText);
      throw new Error(`Anthropic error ${resp.status}: ${errText}`);
    }

    const result = await resp.json();
    const text = result?.content?.[0]?.text ?? "";

    console.log("generate-team-training-plan: response received, text length:", text.length);

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
      console.error("generate-team-training-plan: no valid JSON object found in response:", text.slice(0, 200));
      throw new Error("AI response did not contain valid JSON");
    }

    let plan;
    try {
      plan = JSON.parse(text.slice(start, end + 1));
    } catch (parseErr) {
      console.error("generate-team-training-plan: JSON.parse failed:", parseErr);
      throw new Error("AI returned malformed JSON");
    }

    const usage = result?.usage ?? {};
    console.log("generate-team-training-plan: success, caching and returning plan");
    await setCached(supabase, cacheKey, plan, TTL.DAY, "claude-sonnet-4-20250514", usage.input_tokens, usage.output_tokens);
    await logUsage(supabase, { function_name: "generate-team-training-plan", model: "claude-sonnet-4-20250514", input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, cache_hit: false });

    return new Response(JSON.stringify(plan), { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" } });
  } catch (e) {
    console.error("generate-team-training-plan: unhandled error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
