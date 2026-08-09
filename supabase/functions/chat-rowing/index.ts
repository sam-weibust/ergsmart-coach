import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logUsage, TTL } from "../_shared/cache.ts";
import {
  chatCacheKey,
  getCachedChat,
  replayAsSSE,
  instrumentAnthropicStream,
} from "../_shared/streamCache.ts";
import { preflight, recordApiError, recordApiSuccess, recordUsage, jsonError } from "../_shared/aiGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FN = "chat-rowing";
const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Anthropic key
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    // Use service role key (fixes all 401s)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Frontend must send: { user_id, messages }
    const { user_id, messages } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonError(corsHeaders, 400, "Missing messages");
    }

    // Fetch user context
    const [profileRes, goalsRes, recentErgRes, recentStrengthRes, plansRes] =
      await Promise.all([
        supabase.from("profiles").select("*").eq("id", user_id).maybeSingle(),
        supabase
          .from("user_goals")
          .select("*")
          .eq("user_id", user_id)
          .maybeSingle(),
        supabase
          .from("erg_workouts")
          .select("*")
          .eq("user_id", user_id)
          .order("workout_date", { ascending: false })
          .limit(5),
        supabase
          .from("strength_workouts")
          .select("*")
          .eq("user_id", user_id)
          .order("workout_date", { ascending: false })
          .limit(5),
        supabase
          .from("workout_plans")
          .select("title, description, created_at")
          .eq("user_id", user_id)
          .order("created_at", { ascending: false })
          .limit(3),
      ]);

    const profile = profileRes.data;
    const goals = goalsRes.data;
    const recentErg = recentErgRes.data || [];
    const recentStrength = recentStrengthRes.data || [];
    const plans = plansRes.data || [];

    const userContext = `
USER PROFILE:
- Name: ${profile?.full_name || "Unknown"}
- Type: ${profile?.user_type || "rower"}
- Experience: ${profile?.experience_level || "Unknown"}
- Age: ${profile?.age || "Unknown"}, Weight: ${profile?.weight || "Unknown"}kg, Height: ${profile?.height || "Unknown"}cm
- Goals: ${profile?.goals || "Not set"}

USER GOALS:
- Current 2K: ${goals?.current_2k_time || "Not set"} → Goal: ${goals?.goal_2k_time || "Not set"}
- Current 5K: ${goals?.current_5k_time || "Not set"} → Goal: ${goals?.goal_5k_time || "Not set"}
- Current 6K: ${goals?.current_6k_time || "Not set"} → Goal: ${goals?.goal_6k_time || "Not set"}

RECENT ERG WORKOUTS:
${
  recentErg.length
    ? recentErg
        .map(
          (w) =>
            `- ${w.workout_date}: ${w.workout_type}, ${w.distance}m, duration: ${w.duration}, avg split: ${w.avg_split}`
        )
        .join("\n")
    : "No recent workouts"
}

RECENT STRENGTH WORKOUTS:
${
  recentStrength.length
    ? recentStrength
        .map(
          (w) =>
            `- ${w.workout_date}: ${w.exercise}, ${w.sets}x${w.reps} @ ${w.weight}kg`
        )
        .join("\n")
    : "No recent workouts"
}

TRAINING PLANS:
${
  plans.length
    ? plans
        .map((p) => `- ${p.title}: ${p.description || "No description"}`)
        .join("\n")
    : "No plans"
}
`.trim();

    // Guidelines first, then data. The whole block is the cached prefix, so it
    // must be byte-identical across the turns of a conversation — which it is,
    // since every value below is derived from stored data, not from the clock.
    const systemPrompt = `You are CrewSync AI, an expert rowing and strength coach assistant.

Guidelines:
- Encouraging but honest; specific and actionable
- Use rowing terminology naturally; base pace suggestions on the athlete's actual fitness below
- Markdown formatting
- Keep answers focused unless detail is requested, and finish your thought within ~700 words

ATHLETE DATA:
${userContext}`;

    // Cache-before-call. Key covers the full message history AND the system
    // prompt, so a reply is only reused for an identical conversation against
    // identical athlete data. Short TTL — this mainly absorbs retries,
    // double-submits and refreshes rather than genuine repeat questions.
    const cacheKey = chatCacheKey(FN, systemPrompt, messages);
    const cachedText = await getCachedChat(supabase, cacheKey);
    if (cachedText) {
      await logUsage(supabase, {
        user_id,
        function_name: FN,
        model: MODEL,
        cache_hit: true,
      });
      return new Response(replayAsSSE(cachedText, MODEL), {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-Cache": "HIT" },
      });
    }

    // Failsafe 9 + 1: circuit breaker + per-user daily limits (after the cache
    // check — a cache hit is free and must never be blocked).
    const blocked = await preflight(supabase, { userId: user_id, functionName: FN, corsHeaders });
    if (blocked) return blocked;

    // Anthropic streaming request
    const anthropicResponse = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          stream: true,
          // claude-sonnet-5 runs ADAPTIVE THINKING when this field is omitted,
          // and thinking tokens are billed and counted against max_tokens. At a
          // 1000-token budget that could consume the whole reply. Chat needs
          // low latency and a visible answer, not reasoning — so disable it.
          thinking: { type: "disabled" },
          // Prompt caching: the system block is re-sent verbatim on every turn
          // of a conversation, so caching it turns those repeats into 0.1x
          // cache reads. cache_control goes on the last (only) block of the
          // stable prefix; the volatile part of the request is the message
          // history, which sits after it.
          system: [
            {
              type: "text",
              text: systemPrompt,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [...messages],
        }),
      }
    );

    if (!anthropicResponse.ok) {
      const t = await anthropicResponse.text();
      console.error("Anthropic error:", anthropicResponse.status, t);
      await recordApiError(supabase, FN);
      return jsonError(corsHeaders, 503, "AI service unavailable");
    }
    await recordApiSuccess(supabase, FN);

    if (!anthropicResponse.body) {
      await recordApiError(supabase, FN);
      return jsonError(corsHeaders, 503, "AI service returned an empty stream");
    }

    // Pass the SSE through untouched while accumulating the answer and the real
    // token usage; the cache write and usage log happen when the stream ends.
    const instrumented = instrumentAnthropicStream(anthropicResponse.body, {
      supabase,
      cacheKey,
      functionName: FN,
      model: MODEL,
      userId: user_id,
      ttlSeconds: TTL.HOUR,
      onUsage: (total) => recordUsage(supabase, user_id, total),
    });

    return new Response(instrumented, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "X-Cache": "MISS",
      },
    });
  } catch (e) {
    console.error("chat-rowing error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
