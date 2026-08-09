import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Shared response cache + usage accounting for every Anthropic-calling edge function.
 *
 * IMPORTANT — why this file does not rely on try/catch around supabase calls:
 * supabase-js v2 query builders are thenables that RESOLVE with `{ data, error }`.
 * They do not reject. A `try { await supabase.rpc(...) } catch {}` block is therefore
 * dead code, and any RPC failure becomes a silent no-op. That is exactly how the
 * cache write path failed unnoticed. Every call below inspects `error` explicitly
 * and logs on failure.
 */

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Check the cache for a valid (non-expired) entry. Increments hit_count on hit.
 * Returns the parsed response object, or null on miss/expiry/error.
 */
export async function getCached(
  supabase: SupabaseClient,
  key: string,
): Promise<object | null> {
  // Preferred path: RPC (bumps hit_count and applies the expiry check in SQL).
  const { data, error } = await supabase.rpc("get_cached_response", {
    p_cache_key: key,
  });

  if (!error) {
    if (data === null || data === undefined) return null; // genuine miss
    return safeParse(data as string, key);
  }

  console.error(`cache: get_cached_response RPC failed for "${key}":`, error.message);

  // Real fallback: read the table directly.
  const { data: row, error: selErr } = await supabase
    .from("ai_response_cache")
    .select("response, expires_at")
    .eq("cache_key", key)
    .maybeSingle();

  if (selErr) {
    console.error(`cache: direct read failed for "${key}":`, selErr.message);
    return null;
  }
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

  return safeParse(row.response as string, key);
}

function safeParse(raw: string, key: string): object | null {
  try {
    return JSON.parse(raw);
  } catch {
    console.error(`cache: corrupt JSON for "${key}" — treating as miss`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Store a response in the cache.
 * ttlSeconds: null = never expires (permanent cache).
 * Never throws — a cache write must not fail the request that produced the value.
 */
export async function setCached(
  supabase: SupabaseClient,
  key: string,
  value: unknown,
  ttlSeconds: number | null,
  model?: string,
  inputTokens?: number,
  outputTokens?: number,
): Promise<void> {
  if (value === undefined || value === null) {
    // `response` is NOT NULL; JSON.stringify(undefined) is undefined and would
    // fail the insert. Skip rather than write a broken row.
    console.error(`cache: refusing to cache empty value for "${key}"`);
    return;
  }

  const expires_at = ttlSeconds
    ? new Date(Date.now() + ttlSeconds * 1000).toISOString()
    : null;
  const response = JSON.stringify(value);

  const { error } = await supabase.rpc("set_cached_response", {
    p_cache_key: key,
    p_response: response,
    p_model: model ?? null,
    p_input_tokens: inputTokens ?? null,
    p_output_tokens: outputTokens ?? null,
    p_expires_at: expires_at,
  });

  if (!error) return;

  console.error(`cache: set_cached_response RPC failed for "${key}":`, error.message);

  // Real fallback: upsert the table directly.
  const { error: upErr } = await supabase.from("ai_response_cache").upsert(
    {
      cache_key: key,
      response,
      expires_at,
      model: model ?? null,
      input_tokens: inputTokens ?? null,
      output_tokens: outputTokens ?? null,
    },
    { onConflict: "cache_key" },
  );

  if (!upErr) return;

  console.error(`cache: direct upsert failed for "${key}":`, upErr.message);

  // Last resort: the tracking columns (model/input_tokens/output_tokens) were
  // added by a later migration than the table itself. If that migration has
  // not been applied, the upsert above fails on the unknown columns while the
  // base columns are perfectly writable. Retry with the original schema so the
  // cache still works rather than silently doing nothing.
  const { error: minErr } = await supabase
    .from("ai_response_cache")
    .upsert({ cache_key: key, response, expires_at }, { onConflict: "cache_key" });

  if (minErr) {
    console.error(`cache: minimal upsert also failed for "${key}":`, minErr.message);
  }
}

// ---------------------------------------------------------------------------
// Usage + cost accounting
// ---------------------------------------------------------------------------

/**
 * Per-million-token list prices (Anthropic first-party API).
 *
 * NOTE: claude-sonnet-5 carries an introductory $2/$10 rate through 2026-08-31.
 * These are the STANDARD rates, which is what applies from the September paid
 * launch onward — so cost reporting does not under-state spend post-launch.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1.00, output: 5.00 },
  "claude-sonnet-5": { input: 3.00, output: 15.00 },
  "claude-opus-5": { input: 5.00, output: 25.00 },
};

const DEFAULT_PRICE = PRICES["claude-sonnet-5"];

/** Prompt-caching multipliers relative to the base input rate. */
const CACHE_WRITE_MULTIPLIER = 1.25; // 5-minute ephemeral write
const CACHE_READ_MULTIPLIER = 0.1;   // cache hit

/**
 * Compute the USD cost of a single Anthropic call.
 * Cache-write and cache-read input tokens are priced separately from ordinary
 * input tokens — they are NOT the same rate, and Anthropic reports them as
 * three distinct buckets in `usage`.
 */
export function computeCost(opts: {
  model: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}): number {
  const p = PRICES[opts.model] ?? DEFAULT_PRICE;
  const inp = opts.input_tokens ?? 0;
  const out = opts.output_tokens ?? 0;
  const write = opts.cache_creation_input_tokens ?? 0;
  const read = opts.cache_read_input_tokens ?? 0;

  return (
    (inp * p.input +
      write * p.input * CACHE_WRITE_MULTIPLIER +
      read * p.input * CACHE_READ_MULTIPLIER +
      out * p.output) /
    1_000_000
  );
}

/**
 * Extract the four token buckets from an Anthropic `usage` object.
 * Tolerates a missing/partial usage object (e.g. streamed responses).
 */
export function tokensFrom(usage: unknown): {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
} {
  const u = (usage ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);
  return {
    input_tokens: num(u.input_tokens),
    output_tokens: num(u.output_tokens),
    cache_creation_input_tokens: num(u.cache_creation_input_tokens),
    cache_read_input_tokens: num(u.cache_read_input_tokens),
  };
}

/**
 * Log an API call to api_usage_log with token counts and computed cost.
 * A cache hit is logged with zero tokens and zero cost so hit-rate and savings
 * can both be derived from this one table.
 */
export async function logUsage(
  supabase: SupabaseClient,
  opts: {
    user_id?: string | null;
    function_name: string;
    model: string;
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    cache_hit: boolean;
  },
): Promise<void> {
  const input_tokens = opts.cache_hit ? 0 : opts.input_tokens ?? 0;
  const output_tokens = opts.cache_hit ? 0 : opts.output_tokens ?? 0;
  const cache_creation_input_tokens = opts.cache_hit
    ? 0
    : opts.cache_creation_input_tokens ?? 0;
  const cache_read_input_tokens = opts.cache_hit
    ? 0
    : opts.cache_read_input_tokens ?? 0;

  const cost_usd = opts.cache_hit
    ? 0
    : computeCost({
        model: opts.model,
        input_tokens,
        output_tokens,
        cache_creation_input_tokens,
        cache_read_input_tokens,
      });

  const { error } = await supabase.from("api_usage_log").insert({
    user_id: opts.user_id ?? null,
    function_name: opts.function_name,
    model: opts.model,
    input_tokens,
    output_tokens,
    cache_creation_input_tokens,
    cache_read_input_tokens,
    cache_hit: opts.cache_hit,
    cost_usd,
  });

  if (error) {
    console.error(`logUsage failed for ${opts.function_name}:`, error.message);
  }
}

// ---------------------------------------------------------------------------
// Key hashing
// ---------------------------------------------------------------------------

/**
 * Stable 128-bit hash of any serializable value, for use in cache keys.
 *
 * Two properties this deliberately guarantees:
 *  - OBJECT KEY ORDER IS NORMALISED, so `{a,b}` and `{b,a}` hash identically.
 *    Objects assembled from DB rows or spreads otherwise produce different keys
 *    for identical inputs, which silently destroys the hit rate.
 *  - ARRAY ORDER IS PRESERVED. The previous implementation sorted every array,
 *    which made the hash blind to ordering — two different force curves or
 *    stroke sequences with the same values collided onto one cache entry.
 *    Callers that genuinely want set semantics (e.g. a list of athlete ids)
 *    must sort explicitly at the call site.
 */
export function hashKey(value: unknown): string {
  const str = stableStringify(value);

  // Four independently-seeded FNV-1a lanes => 128 bits of output.
  // A single 32-bit hash (the previous implementation) has a ~50% collision
  // probability at only ~77k distinct keys, and a collision here serves one
  // athlete's analysis to another.
  const seeds = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  const h = new Uint32Array(seeds);
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    for (let l = 0; l < 4; l++) {
      h[l] ^= c + l;
      h[l] = Math.imul(h[l], 0x01000193);
    }
  }
  let out = "";
  for (let l = 0; l < 4; l++) out += (h[l] >>> 0).toString(36).padStart(7, "0");
  return out;
}

/** JSON.stringify with deterministic object-key ordering (arrays untouched). */
function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v as object)) return "[circular]";
    seen.add(v as object);

    if (Array.isArray(v)) return v.map(walk);

    const src = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) out[k] = walk(src[k]);
    return out;
  };

  return JSON.stringify(walk(value)) ?? "null";
}

// ---------------------------------------------------------------------------

export const TTL = {
  PERMANENT: null,          // never expires
  WEEK: 604800,             // 7 days
  TWO_DAYS: 172800,         // 48 hours
  DAY: 86400,               // 24 hours
  HALF_DAY: 43200,          // 12 hours
  SIX_HOURS: 21600,         // 6 hours
  HOUR: 3600,               // 1 hour
} as const;
