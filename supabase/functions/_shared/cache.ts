import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Check cache for a valid (non-expired) entry.
 * Returns parsed response object or null if miss/expired.
 */
export async function getCached(
  supabase: SupabaseClient,
  key: string
): Promise<object | null> {
  try {
    const { data, error } = await supabase
      .from("ai_response_cache")
      .select("response, expires_at")
      .eq("cache_key", key)
      .maybeSingle();

    if (error || !data) return null;

    // Check expiry (null expires_at = never expires)
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      // Expired — delete async, don't await
      supabase.from("ai_response_cache").delete().eq("cache_key", key).then(() => {});
      return null;
    }

    return JSON.parse(data.response);
  } catch {
    return null;
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
  ttlSeconds: number | null
): Promise<void> {
  try {
    const expires_at = ttlSeconds
      ? new Date(Date.now() + ttlSeconds * 1000).toISOString()
      : null;

    await supabase.from("ai_response_cache").upsert(
      {
        cache_key: key,
        response: JSON.stringify(value),
        expires_at,
      },
      { onConflict: "cache_key" }
    );
  } catch (e) {
    console.error("cache write error:", e);
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
  PERMANENT: null,        // workout feedback — never regenerate
  DAY: 86400,             // training plans, team analysis — 24h
  HOUR: 3600,             // lineup optimizer — 1h
} as const;
