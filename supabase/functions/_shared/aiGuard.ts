import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * AI credit failsafes shared across every edge function that calls Anthropic.
 *
 * Usage in an edge function:
 *
 *   import { preflight, recordApiError, recordApiSuccess, recordUsage, jsonError, validateRequired }
 *     from "../_shared/aiGuard.ts";
 *
 *   const FN = "generate-insights";
 *   ...
 *   const missing = validateRequired(body, ["user_id"]);
 *   if (missing) return jsonError(corsHeaders, 400, `Missing ${missing}`);
 *
 *   // (cache check first — a cache hit is free and should never be blocked)
 *
 *   const blocked = await preflight(supabase, { userId: user_id, functionName: FN, corsHeaders });
 *   if (blocked) return blocked;
 *
 *   const resp = await fetch("https://api.anthropic.com/v1/messages", {...});
 *   if (!resp.ok) { await recordApiError(supabase, FN); return jsonError(corsHeaders, 503, "AI service unavailable"); }
 *   await recordApiSuccess(supabase, FN);
 *   ...
 *   await recordUsage(supabase, user_id, (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0));
 */

// ---------------------------------------------------------------------------
// Failsafe 1: global per-user daily limits
// ---------------------------------------------------------------------------
export const DAILY_CALL_LIMIT = 50;
export const DAILY_TOKEN_LIMIT = 100_000;

// ---------------------------------------------------------------------------
// Failsafe 10: free-tier daily cap. Written and ready, but inactive while in
// beta. TODO: re-enable when Stripe goes live Fall 2026.
// ---------------------------------------------------------------------------
export const IS_BETA = true;
const FREE_TIER_CAPS: Record<string, number> = {
  free: 3,
  pro: 20,
  elite: Number.POSITIVE_INFINITY,
};

export function jsonError(
  corsHeaders: Record<string, string>,
  status: number,
  message: string,
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Failsafe 4: returns the name of the first required field that is missing or
 * empty, or null when all are present.
 */
export function validateRequired(
  body: Record<string, unknown> | null | undefined,
  fields: string[],
): string | null {
  if (!body || typeof body !== "object") return fields[0] ?? "body";
  for (const f of fields) {
    const v = (body as Record<string, unknown>)[f];
    if (v === undefined || v === null || v === "") return f;
    if (Array.isArray(v) && v.length === 0) return f;
  }
  return null;
}

/**
 * Failsafe 9: is the circuit breaker open for this function?
 * Fails open (returns false) so a breaker-bookkeeping error never blocks traffic.
 */
export async function isCircuitOpen(
  supabase: SupabaseClient,
  functionName: string,
): Promise<boolean> {
  try {
    const { data } = await supabase.rpc("check_ai_circuit", { p_function: functionName });
    return data === true;
  } catch {
    return false;
  }
}

export async function recordApiError(supabase: SupabaseClient, functionName: string): Promise<void> {
  try {
    await supabase.rpc("record_ai_error", { p_function: functionName });
  } catch (e) {
    console.error("recordApiError failed:", e);
  }
}

export async function recordApiSuccess(supabase: SupabaseClient, functionName: string): Promise<void> {
  try {
    await supabase.rpc("record_ai_success", { p_function: functionName });
  } catch (e) {
    console.error("recordApiSuccess failed:", e);
  }
}

/**
 * Increment a user's daily usage after a successful (non-cached) API call.
 * No-op for anonymous calls.
 */
export async function recordUsage(
  supabase: SupabaseClient,
  userId: string | null | undefined,
  tokens: number,
): Promise<void> {
  if (!userId) return;
  try {
    await supabase.rpc("increment_daily_ai_usage", {
      p_user_id: userId,
      p_tokens: Math.max(0, Math.round(tokens || 0)),
    });
  } catch (e) {
    console.error("recordUsage failed:", e);
  }
}

/**
 * Pre-flight gate that runs immediately before an Anthropic API call.
 * Enforces the circuit breaker (Failsafe 9) and per-user daily limits
 * (Failsafe 1), plus the beta-gated free-tier cap (Failsafe 10).
 *
 * Returns a Response to short-circuit the request, or null to proceed.
 * Call this AFTER the cache check — cached hits are free and must not be blocked.
 */
export async function preflight(
  supabase: SupabaseClient,
  opts: {
    userId?: string | null;
    functionName: string;
    corsHeaders: Record<string, string>;
  },
): Promise<Response | null> {
  const { userId, functionName, corsHeaders } = opts;

  // Failsafe 9: circuit breaker.
  if (await isCircuitOpen(supabase, functionName)) {
    return jsonError(
      corsHeaders,
      503,
      "AI features are temporarily unavailable. Please try again in a few minutes.",
    );
  }

  // Failsafe 1 + 10 require a user to attribute usage to.
  if (!userId) return null;

  try {
    const { data } = await supabase.rpc("get_daily_ai_usage", { p_user_id: userId });
    const calls = Number(data?.total_calls ?? 0);
    const tokens = Number(data?.total_tokens ?? 0);

    // Failsafe 1: hard global daily cap.
    if (calls >= DAILY_CALL_LIMIT || tokens >= DAILY_TOKEN_LIMIT) {
      return jsonError(corsHeaders, 429, "You have reached your daily AI limit. Try again tomorrow.");
    }

    // Failsafe 10: free-tier cap (inactive while IS_BETA).
    if (!IS_BETA) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("subscription_status")
        .eq("id", userId)
        .maybeSingle();
      const tier = (profile?.subscription_status as string) || "free";
      const cap = FREE_TIER_CAPS[tier] ?? FREE_TIER_CAPS.free;
      if (calls >= cap) {
        return jsonError(
          corsHeaders,
          429,
          "You've used all your AI requests for today. Upgrade your plan for more.",
        );
      }
    }
  } catch (e) {
    // Never block legitimate traffic on a limit-check failure.
    console.error("preflight usage check failed:", e);
  }

  return null;
}
