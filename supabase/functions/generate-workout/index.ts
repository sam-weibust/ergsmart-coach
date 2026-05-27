import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, TTL } from "../_shared/cache.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FALLBACK_PHILOSOPHY = `You are generating training plans following a competitive high school rowing program methodology.

ZONE SYSTEM (paces relative to athlete 2k time per 500m):
UT2: 2k+20-25s, rate 16-20. Pure aerobic base.
UT1: 2k+15-20s, rate 18-24. Moderate aerobic, rate ladders.
AT: 2k+4-9s, rate 26-28. Anaerobic threshold.
TR1: 2k+0-4s, rate 26-32. Threshold, hard pieces.
TR2: below 2k pace, rate 32+. Race specific, peak phase only within 6 weeks of race.

CORRECT WEEKLY STRUCTURE — CRITICAL RULES:
- Each day has EXACTLY ONE required session.
- Lifting is ALWAYS optional — NEVER a standalone required session Monday through Friday.
- Saturday may have lifting as the required session when erg is the optional.
- Sunday is ALWAYS OFF — no required or optional sessions.

Monday: Required — erg session (UT1). Optional — lift (Day A Lower Power) after erg.
Tuesday: Required — erg session (AT or TR1, higher intensity). Optional — second easy erg (UT2) or lift (Day B Upper Pull).
Wednesday: Required — erg session (UT2/UT1 high volume). Optional — lift (Day B Upper Pull or Day C Lower Endurance) after erg.
Thursday: Required — erg session (moderate intensity) or rest depending on weekly load. Optional — lift (Day C Lower Endurance) or easy erg.
Friday: Required — erg quality session (AT/TR1). Optional — second easy session.
Saturday: Required — lift (Day D Upper Endurance) or easy erg. Optional — second erg or rest.
Sunday: OFF. No sessions at all.

NEVER generate Tuesday, Wednesday, or Thursday as "lift only" required days.
NEVER generate more than one required session per day.

3-WEEK LOADING CYCLE: Week 1 easy, Week 2 medium, Week 3 hard, Week 4 recovery (50% volume).

Always specify piece duration/distance, rest interval, stroke rate, warmup, cooldown. Express paces as 2k +/- seconds, never absolute splits.`;

// Build dynamic additions to the system prompt based on user preferences
function buildPreferencePrompt(prefs: Record<string, unknown>): string {
  const goal = prefs.training_goal as string || "general_fitness";
  const intensity = prefs.intensity as string || "moderate";
  const goalDate = prefs.goal_date as string | null;
  const includeLift = prefs.include_lifting !== false;
  const liftDays = (prefs.lifting_days_per_week as number) || 2;
  const twoADays = prefs.include_two_a_days !== false;

  const lines: string[] = [];

  lines.push("\nATHLETE PREFERENCES — apply these to all sessions:");

  // Intensity
  if (intensity === "easy") {
    lines.push("INTENSITY: Easy. Use 3-4 sessions per week. UT2 and UT1 only. No TR work unless goal date is within 4 weeks. Longer rest between pieces. Good for beginners or busy schedules.");
  } else if (intensity === "hard") {
    lines.push("INTENSITY: Hard. 6 sessions per week. Medium/Hard zone targets. TR1 introduced at 8 weeks from goal date. TR2 at 4 weeks from goal date. Tight rest intervals. Serious competitor program.");
  } else {
    lines.push("INTENSITY: Moderate. 5-6 sessions per week. Standard competitive program volume. UT1 and AT base, TR1 introduced at 6 weeks from goal date.");
  }

  // Training goal
  if (goal === "erg_testing") {
    lines.push("TRAINING GOAL: Erg Testing. Include a testing taper in the final week. Add 2k simulation pieces in week 3 of 4-week blocks. Sharp taper in final week before test date.");
    if (goalDate) lines.push(`Test date: ${goalDate}. Peak the plan at this date.`);
  } else if (goal === "upcoming_race") {
    lines.push("TRAINING GOAL: Upcoming Race. Full periodization toward race date. TR2 work in final 3 weeks. Race-specific pieces.");
    if (goalDate) lines.push(`Race date: ${goalDate}. Build toward this date.`);
  } else if (goal === "tryouts") {
    lines.push("TRAINING GOAL: Tryouts. Peak at tryout date. Include competitive pieces and seat-racing simulation efforts. High-intensity work in final 2 weeks.");
    if (goalDate) lines.push(`Tryout date: ${goalDate}. Peak the plan at this date.`);
  } else if (goal === "off_season") {
    lines.push("TRAINING GOAL: Off Season. UT2 dominant. Low volume maintenance. No TR2 work. Focus on recovery and aerobic base preservation.");
  } else if (goal === "return_from_injury") {
    lines.push("TRAINING GOAL: Return from Injury. Start at 50% volume in week 1. Build 10% per week. No TR work for first 2 weeks. Gradual reintroduction only. Flag intensity caution.");
  } else {
    lines.push("TRAINING GOAL: General Fitness. Heavy UT2 and UT1. No TR2. No testing blocks. Steady progressive overload.");
  }

  // Lifting
  if (!includeLift) {
    lines.push("LIFTING: None. No lifting sessions anywhere in the plan. Erg-only program.");
  } else if (liftDays === 3) {
    lines.push("LIFTING: Optional 3 days per week — Monday (Day A Lower Power), Wednesday (Day B Upper Pull/Day C Lower Endurance), Saturday (Day D Upper Endurance). All lifting is OPTIONAL, never required Monday-Friday.");
  } else {
    lines.push("LIFTING: Optional 2 days per week — Monday (Day A Lower Power) and Thursday (Day C Lower Endurance). All lifting is OPTIONAL, never required Monday-Friday.");
  }

  // 2-a-days
  if (!twoADays) {
    lines.push("2-A-DAYS: Do NOT include optional second sessions. Single session per day only. Set optional to null for every day.");
  } else {
    lines.push("2-A-DAYS: Include optional second sessions Monday through Saturday. Optional sessions are always lower intensity than the required session. If required is TR1, optional is UT2. If required is UT1, optional is UT2. Sunday has no optional session.");
  }

  return lines.join("\n");
}

serve(async (req) => {
  console.log("generate-workout: function started");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const raw = await req.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user_id = body.user_id as string;
    const preferences = (body.preferences ?? {}) as Record<string, unknown>;

    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const prefKey = `${preferences.training_goal ?? "g"}:${preferences.intensity ?? "m"}:${preferences.include_lifting ?? 1}:${preferences.lifting_days_per_week ?? 2}:${preferences.include_two_a_days ?? 1}`;
    const cacheKey = `training_plan_v2:${user_id}:${preferences.months ?? 3}:${prefKey}:${today}`;
    const cached = await getCached(supabase, cacheKey);
    if (cached) {
      console.log("generate-workout: cache hit");
      await logUsage(supabase, { user_id, function_name: "generate-workout", model: "claude-sonnet-4-20250514", input_tokens: 0, output_tokens: 0, cache_hit: true });
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    const [profileRes, goalsRes, ergRes, strengthRes, teamMemberRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user_id).maybeSingle(),
      supabase.from("user_goals").select("*").eq("user_id", user_id).maybeSingle(),
      supabase.from("erg_workouts").select("*").eq("user_id", user_id).order("workout_date", { ascending: false }).limit(5),
      supabase.from("strength_workouts").select("*").eq("user_id", user_id).order("workout_date", { ascending: false }).limit(5),
      supabase.from("team_members").select("team_id").eq("user_id", user_id).limit(1).maybeSingle(),
    ]);

    const profile = profileRes.data;
    const goals = goalsRes.data;
    const recentErg = ergRes.data || [];
    const recentStrength = strengthRes.data || [];

    let philosophyPrompt = "";
    try {
      const teamId = teamMemberRes.data?.team_id;
      if (teamId) {
        const { data: customPhil } = await supabase
          .from("team_training_philosophy")
          .select("philosophy")
          .eq("team_id", teamId)
          .maybeSingle();
        const sp = (customPhil?.philosophy as { system_prompt?: string } | null)?.system_prompt;
        if (sp) philosophyPrompt = sp;
      }
      if (!philosophyPrompt) {
        const { data: defaultPhil } = await supabase
          .from("default_training_philosophy")
          .select("system_prompt")
          .eq("is_default", true)
          .maybeSingle();
        if (defaultPhil?.system_prompt) philosophyPrompt = defaultPhil.system_prompt;
      }
    } catch (philErr) {
      console.error("generate-workout: philosophy fetch threw:", philErr);
    }

    if (philosophyPrompt.length > 1500) {
      philosophyPrompt = philosophyPrompt.slice(0, 1500) + "\n[see full methodology — follow all rules]";
    }
    if (!philosophyPrompt) philosophyPrompt = FALLBACK_PHILOSOPHY;

    const userContext = `
USER PROFILE:
- Name: ${profile?.full_name || "Unknown"}
- Type: ${profile?.user_type || "rower"}
- Experience: ${profile?.experience_level || "Unknown"}
- Age: ${profile?.age || "Unknown"}, Weight: ${profile?.weight || "Unknown"}kg, Height: ${profile?.height || "Unknown"}cm

USER GOALS:
- Current 2K: ${goals?.current_2k_time || "Not set"} → Goal: ${goals?.goal_2k_time || "Not set"}

RECENT ERG WORKOUTS:
${recentErg.length ? recentErg.map((w: any) => `- ${w.workout_date}: ${w.workout_type}, ${w.distance}m, avg split: ${w.avg_split}`).join("\n") : "No recent erg workouts"}

RECENT STRENGTH WORKOUTS:
${recentStrength.length ? recentStrength.map((w: any) => `- ${w.workout_date}: ${w.exercise}, ${w.sets}x${w.reps} @ ${w.weight}kg`).join("\n") : "No recent strength workouts"}
`.trim();

    const totalWeeks = Math.max(1, ((preferences.months as number) ?? 3) * 4);
    const durationLabel = `${preferences.months ?? 3} months (${totalWeeks} weeks)`;

    const prefPrompt = buildPreferencePrompt(preferences);

    const systemPrompt = `${philosophyPrompt}
${prefPrompt}

You are CrewSync AI, an expert rowing and strength training coach.

USER CONTEXT:
${userContext}

LIFTING PROGRAM (when include_lifting is true):
Day A — Lower Power: Back Squat 5x3, Romanian Deadlift 4x5, Power Clean 4x3, Box Jump 4x5, Glute Ham Raise 3x8, Plank 3x60s
Day B — Upper Pull: Deadlift 5x3, Weighted Pull-ups 4x5, Barbell Row 4x6, Single Arm DB Row 3x8, Face Pulls 3x15, Hanging Leg Raise 3x12
Day C — Lower Endurance: Front Squat 4x6, Bulgarian Split Squat 3x8, Trap Bar Deadlift 4x8, Step-ups 3x10, Nordic Hamstring Curl 3x6, Pallof Press 3x12
Day D — Upper Endurance: Hex Bar Deadlift 4x8, DB Romanian Deadlift 3x12, Lat Pulldown 4x10, Cable Row 4x12, DB Curl to Press 3x10, Copenhagen Plank 3x30s, Reverse Hyper 3x15

CRITICAL STRUCTURE RULE — MUST FOLLOW:
Each day has exactly one required session. Optional sessions are always lower intensity.
NEVER make lifting a standalone required session on Monday-Friday.
Sunday always has is_rest: true, required: null, optional: null.

You MUST output the FULL plan, all ${totalWeeks} weeks. No summaries. No "repeat" instructions.
Output ONLY valid JSON. No text before or after.

JSON SCHEMA:
{
  "duration": "${durationLabel}",
  "total_weeks": ${totalWeeks},
  "plan": [
    {
      "week": 1,
      "phase": "Base",
      "phase_label": "Week 1 of ${totalWeeks} — Base Phase",
      "summary": "Easy base building week. Focus on UT2 aerobic base. Two UT1 sessions.",
      "intensity_label": "Easy Week",
      "days": [
        {
          "day": 1,
          "day_name": "Monday",
          "is_rest": false,
          "required": {
            "session_type": "erg",
            "zone": "UT1",
            "title": "UT1 Steady State",
            "description": "45 min steady state at UT1",
            "distance": "10000",
            "duration": "45 min",
            "targetSplit": "2k+18s/500m",
            "rate": "r20-22",
            "warmup": "10 min easy at r18",
            "cooldown": "5 min easy",
            "restPeriods": ""
          },
          "optional": {
            "session_type": "lift",
            "title": "Optional Lift — Day A (Lower Power)",
            "description": "Back Squat 5x3, Romanian Deadlift 4x5, Power Clean 4x3, Box Jump 4x5, Glute Ham Raise 3x8, Plank 3x60s",
            "note": "Complete only if energy allows after required erg session."
          }
        },
        {
          "day": 7,
          "day_name": "Sunday",
          "is_rest": true,
          "required": null,
          "optional": null
        }
      ]
    }
  ]
}

For erg required sessions: session_type must be "erg".
For lift required sessions (Saturday only): session_type must be "lift".
For lift optional sessions: session_type must be "lift".
For erg optional sessions: session_type must be "erg".
For rest days: is_rest: true, required: null, optional: null.
targetSplit MUST always be expressed as 2k+Xs/500m or 2k-Xs/500m.
Each week MUST have 7 days (day 1=Monday through day 7=Sunday).
Plan array MUST contain exactly ${totalWeeks} week objects.`.trim();

    console.log("generate-workout: calling Anthropic API");

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        stream: false,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: `Generate the complete ${durationLabel} training plan. Output only the JSON object.` }],
      }),
    });

    console.log("generate-workout: Anthropic response status:", anthropicResponse.status);

    if (!anthropicResponse.ok) {
      const t = await anthropicResponse.text();
      console.error("generate-workout: Anthropic error:", t);
      return new Response(JSON.stringify({ error: "AI service unavailable", detail: t }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await anthropicResponse.json();
    const text = result?.content?.[0]?.text;

    if (!text) {
      return new Response(JSON.stringify({ error: "Invalid AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tryParseJson = (raw: string): object | null => {
      const s = raw.indexOf("{");
      const e = raw.lastIndexOf("}");
      if (s === -1 || e === -1 || e <= s) return null;
      try { return JSON.parse(raw.slice(s, e + 1)); } catch { return null; }
    };

    let parsed = tryParseJson(text);

    if (!parsed) {
      console.warn("generate-workout: first parse failed, attempting repair pass");
      const repairResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 16000,
          stream: false,
          system: "You are a JSON repair tool. Output only valid JSON. No text before or after. Fix any syntax errors in the training plan JSON provided.",
          messages: [{ role: "user", content: text }],
        }),
      });
      if (repairResponse.ok) {
        const repairResult = await repairResponse.json();
        parsed = tryParseJson(repairResult?.content?.[0]?.text ?? "");
      }
    }

    if (!parsed) {
      return new Response(JSON.stringify({ error: "AI returned invalid JSON" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const usage = result?.usage ?? {};
    await setCached(supabase, cacheKey, parsed, TTL.DAY, "claude-sonnet-4-20250514", usage.input_tokens, usage.output_tokens);
    await logUsage(supabase, { user_id, function_name: "generate-workout", model: "claude-sonnet-4-20250514", input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, cache_hit: false });

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (e) {
    console.error("generate-workout: unhandled error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
