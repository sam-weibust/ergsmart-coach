import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCached, logUsage, hashKey, TTL } from "../_shared/cache.ts";
import { preflight, recordApiError, recordApiSuccess, recordUsage, jsonError } from "../_shared/aiGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-4-5";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const user_id = body.user_id;
    const muscle_group = body.muscle_group || "full body";
    const equipment = body.equipment || "standard gym";
    const preferences = body.preferences || {};
    const program_id = body.program_id;

    // Cache by user + muscle_group + equipment (7 days)
    const cacheKey = `strength_plan_${user_id || "anon"}_${program_id || hashKey({ muscle_group, equipment })}`;
    const cached = await getCached(supabase, cacheKey);
    if (cached) {
      await logUsage(supabase, { user_id, function_name: "generate-strength", model: MODEL, input_tokens: 0, output_tokens: 0, cache_hit: true });
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    // Failsafe 9 + 1: circuit breaker + per-user daily limits (after cache check).
    const blocked = await preflight(supabase, { userId: user_id ?? null, functionName: "generate-strength", corsHeaders });
    if (blocked) return blocked;

    let profile: any = null;
    let recentStrength: any[] = [];

    if (user_id) {
      const [profileRes, strengthRes] = await Promise.all([
        supabase.from("profiles").select("experience_level,weight,height").eq("id", user_id).maybeSingle(),
        supabase.from("strength_workouts").select("exercise,sets,reps,weight").eq("user_id", user_id)
          .order("workout_date", { ascending: false }).limit(5),
      ]);
      profile = profileRes.data;
      recentStrength = strengthRes.data || [];
    }

    const experience = body.experience || profile?.experience_level || "intermediate";
    const weight = body.weight || profile?.weight;
    const goals = body.goals || "strength and rowing performance";

    const systemPrompt = `Expert strength coach for rowers. Output ONLY valid JSON:
{"suggestions":{"suggestions":[{"exercise":"...","sets":3,"reps":8,"recommendedWeight":60,"notes":"..."}]}}
Include 5-8 exercises for the requested muscle group and equipment. Weights in kg, sets/reps as numbers. Rowing-specific. No text outside JSON.`;

    const userMsg = `Experience: ${experience}, Weight: ${weight||"?"}kg, Goals: ${goals}. Muscle group: ${muscle_group}. Equipment: ${equipment}.${recentStrength.length ? ` Recent: ${recentStrength.map(w => `${w.exercise} ${w.sets}x${w.reps}@${w.weight}kg`).join(", ")}.` : ""} Generate workout.`;

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1000, system: systemPrompt, messages: [{ role: "user", content: userMsg }] }),
    });

    if (!anthropicResponse.ok) {
      console.error("Anthropic error:", anthropicResponse.status, await anthropicResponse.text());
      await recordApiError(supabase, "generate-strength");
      return jsonError(corsHeaders, 503, "AI service unavailable");
    }
    await recordApiSuccess(supabase, "generate-strength");

    const aiResult = await anthropicResponse.json();
    const usage = aiResult?.usage ?? {};
    const rawText = aiResult?.content?.[0]?.text ?? "";
    const start = rawText.indexOf("{");
    const end = rawText.lastIndexOf("}");
    let parsed: any = { suggestions: { suggestions: [] } };
    if (start !== -1 && end > start) {
      try { parsed = JSON.parse(rawText.slice(start, end + 1)); } catch { /* fallback */ }
    }

    await setCached(supabase, cacheKey, parsed, TTL.WEEK, MODEL, usage.input_tokens, usage.output_tokens);
    await logUsage(supabase, { user_id, function_name: "generate-strength", model: MODEL, input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, cache_hit: false });
    await recordUsage(supabase, user_id ?? null, (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0));

    return new Response(JSON.stringify(parsed), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (e) {
    console.error("generate-strength error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
