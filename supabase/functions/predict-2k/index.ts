import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, hashKey, TTL } from "../_shared/cache.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "claude-haiku-4-5-20251001";

const PREDICT_SYSTEM = `Conservative rowing physiologist predicting 2K erg times.

RULES:
- 6k→2k: 2k_split = (6k_total_seconds/12)/1.040; 2k_time = 4×split
- Watts cube speed: 1% speed = 3% more power
- Volume: <30k=recreational, 30-60k=intermediate, 60-100k=competitive, >100k=elite
- Training <4wk=minimal, 4-12wk=good, >12wk=well-adapted
- Base fitness: add 2-5s; taper: up to 2-5% faster
- Test >3mo: widen range significantly
- Be CONSERVATIVE. Better to under-predict.

Output ONLY valid JSON:
{"predicted_time":"7:05.2","realistic_range":{"best":"6:58.0","realistic":"7:10.0"},"confidence":72,"confidence_explanation":"...","helping_factors":["..."],"limiting_factors":["..."],"to_hit_best_case":"...","honest_note":null}`;

const TIMELINE_SYSTEM = `Conservative rowing development coach estimating improvement timelines.

RULES:
- Beginner: 30-90s/year improvement; Intermediate: 10-30s; Advanced: 3-10s; Elite: 1-5s
- Be CONSERVATIVE on timeline. Buffer for disruptions.
- Note if goal is physiologically unlikely.

Output ONLY valid JSON:
{"estimated_weeks":24,"estimated_weeks_range":{"optimistic":18,"realistic":28},"required_volume_increase":"...","milestones":[{"time":"7:15.0","weeks":8,"notes":"..."}],"is_realistic":true,"honest_assessment":"...","key_requirements":["..."]}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "Missing ANTHROPIC_API_KEY" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const body = await req.json();
    const { mode, user_id, ...inputs } = body;

    // Cache by input hash
    const cacheKey = `predict_2k_${mode || "predict"}_${hashKey(inputs)}`;
    const cached = await getCached(supabase, cacheKey);
    if (cached) {
      await logUsage(supabase, { user_id, function_name: "predict-2k", model: MODEL, input_tokens: 0, output_tokens: 0, cache_hit: true });
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    let systemPrompt: string;
    let userMessage: string;

    if (mode === "timeline") {
      systemPrompt = TIMELINE_SYSTEM;
      userMessage = `Timeline for: Current 2K=${inputs.current_2k||"?"}, Goal=${inputs.goal_2k||"?"}, Volume=${inputs.weekly_volume||"?"}m/wk, Age=${inputs.age||"?"}, Gender=${inputs.gender||"?"}, Phase=${inputs.training_phase||"?"}, Coach=${inputs.has_coach?"yes":"no"}`;
    } else {
      systemPrompt = PREDICT_SYSTEM;
      userMessage = `Predict 2K for: Current 2K=${inputs.current_2k||"?"}, 6K=${inputs.current_6k||"?"}, 60min=${inputs.best_60min||"?"}m, Volume=${inputs.weekly_volume||"?"}m/wk, Consistent=${inputs.weeks_consistent||"?"}wk, Age=${inputs.age||"?"}, Weight=${inputs.weight||"?"}kg, Height=${inputs.height||"?"}cm, Gender=${inputs.gender||"?"}, Phase=${inputs.training_phase||"?"}, Last test=${inputs.test_recency||"?"}`;
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      throw new Error(errBody?.error?.message ?? `Anthropic API error ${resp.status}`);
    }

    const result = await resp.json();
    const text = result.content?.[0]?.text ?? "";
    const usage = result?.usage ?? {};
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) throw new Error("AI returned an unexpected response format. Please try again.");

    const parsed = JSON.parse(jsonMatch[0]);
    await setCached(supabase, cacheKey, parsed, TTL.DAY, MODEL, usage.input_tokens, usage.output_tokens);
    await logUsage(supabase, { user_id, function_name: "predict-2k", model: MODEL, input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, cache_hit: false });

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Prediction failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
