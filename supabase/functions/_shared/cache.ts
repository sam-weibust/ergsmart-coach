import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Check cache for a valid (non-expired) entry. Increments hit_count on hit.
 * Returns parsed response object or null if miss/expired.
 */
export async function getCached(
  supabase: SupabaseClient,
  key: string
): Promise<object | null> {
  try {
    const { data, error } = await supabase.rpc("get_cached_response", {
      p_cache_key: key,
    });

    if (error || !data) return null;
    return JSON.parse(data);
  } catch {
    // Fallback to direct select if RPC fails
    try {
      const { data, error } = await supabase
        .from("ai_response_cache")
        .select("response, expires_at")
        .eq("cache_key", key)
        .maybeSingle();

      if (error || !data) return null;
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        supabase.from("ai_response_cache").delete().eq("cache_key", key).then(() => {});
        return null;
      }
      return JSON.parse(data.response);
    } catch {
      return null;
    }
  }
}

/**
 * Store a response in cache.
 * ttlSeconds: null = never expires (permanent cache)
 */
export async function setCached(
  supabase: SupabaseClient,
  key: string,
  value: object,
  ttlSeconds: number | null,
  model?: string,
  inputTokens?: number,
  outputTokens?: number
): Promise<void> {
  try {
    const expires_at = ttlSeconds
      ? new Date(Date.now() + ttlSeconds * 1000).toISOString()
      : null;

    await supabase.rpc("set_cached_response", {
      p_cache_key: key,
      p_response: JSON.stringify(value),
      p_model: model ?? null,
      p_input_tokens: inputTokens ?? null,
      p_output_tokens: outputTokens ?? null,
      p_expires_at: expires_at,
    });
  } catch {
    // Fallback to direct upsert
    try {
      const expires_at = ttlSeconds
        ? new Date(Date.now() + ttlSeconds * 1000).toISOString()
        : null;
      await supabase.from("ai_response_cache").upsert(
        {
          cache_key: key,
          response: JSON.stringify(value),
          expires_at,
          model: model ?? null,
          input_tokens: inputTokens ?? null,
          output_tokens: outputTokens ?? null,
        },
        { onConflict: "cache_key" }
      );
    } catch (e) {
      console.error("cache write error:", e);
    }
  }
}

/**
 * Log API usage to api_usage_log table.
 */
export async function logUsage(
  supabase: SupabaseClient,
  opts: {
    user_id?: string | null;
    function_name: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_hit: boolean;
  }
): Promise<void> {
  try {
    // Cost per million tokens
    const COSTS: Record<string, { input: number; output: number }> = {
      "claude-haiku-4-5": { input: 1.00, output: 5.00 },
      "claude-sonnet-5": { input: 3.00, output: 15.00 },
    };
    const rates = COSTS[opts.model] ?? { input: 3.00, output: 15.00 };
    const cost_usd = opts.cache_hit
      ? 0
      : (opts.input_tokens / 1_000_000) * rates.input +
        (opts.output_tokens / 1_000_000) * rates.output;

    await supabase.from("api_usage_log").insert({
      user_id: opts.user_id ?? null,
      function_name: opts.function_name,
      model: opts.model,
      input_tokens: opts.input_tokens,
      output_tokens: opts.output_tokens,
      cache_hit: opts.cache_hit,
      cost_usd,
    });
  } catch (e) {
    console.error("logUsage error:", e);
  }
}

/** Stable hash of any serializable value for use in cache keys. */
export function hashKey(value: unknown): string {
  const str = JSON.stringify(value, (_k, v) =>
    Array.isArray(v) ? [...v].sort() : v
  );
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

export const TTL = {
  PERMANENT: null,          // never expires
  WEEK: 604800,             // 7 days
  TWO_DAYS: 172800,         // 48 hours
  DAY: 86400,               // 24 hours
  HALF_DAY: 43200,          // 12 hours
  SIX_HOURS: 21600,         // 6 hours
  HOUR: 3600,               // 1 hour
} as const;
