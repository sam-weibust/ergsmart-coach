import { supabase } from "@/integrations/supabase/client";

/**
 * Failsafe 3 (network layer): a guarded wrapper around
 * `supabase.functions.invoke` for AI edge functions.
 *
 * If an identical request (same function + same body) is already in flight,
 * the existing promise is returned instead of firing a second request — so a
 * double-tap can never spend credits twice. A short cooldown after completion
 * swallows immediate repeat taps.
 *
 * Drop-in replacement: returns the same `{ data, error }` shape as
 * `supabase.functions.invoke`.
 */

interface InvokeOptions {
  body?: unknown;
  headers?: Record<string, string>;
}

const DEBOUNCE_MS = 500;
const inFlight = new Map<string, Promise<{ data: unknown; error: unknown }>>();
const lastCompleted = new Map<string, number>();

function keyFor(name: string, options: InvokeOptions): string {
  try {
    return `${name}::${JSON.stringify(options.body ?? null)}`;
  } catch {
    return name;
  }
}

export async function invokeAI(
  name: string,
  options: InvokeOptions = {},
): Promise<{ data: any; error: any }> {
  const key = keyFor(name, options);

  // De-dupe: an identical request is already running — reuse it, fire nothing new.
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<{ data: any; error: any }>;

  // 500ms debounce: ignore a repeat of the same request fired immediately after one finished.
  const since = Date.now() - (lastCompleted.get(key) ?? 0);
  if (since < DEBOUNCE_MS) {
    return { data: null, error: { message: "Please wait a moment before trying again." } };
  }

  const promise = (async () => {
    try {
      return await supabase.functions.invoke(name, options as any);
    } finally {
      inFlight.delete(key);
      lastCompleted.set(key, Date.now());
    }
  })();

  inFlight.set(key, promise);
  return promise;
}
