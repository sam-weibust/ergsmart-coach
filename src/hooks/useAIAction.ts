import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Failsafe 3 (UI layer): wraps an async AI-triggering action so that the
 * button is debounced, disabled while a request is in flight, and protected
 * by a hard timeout that re-enables it if the request hangs.
 *
 * Usage:
 *   const generate = useAIAction(async () => {
 *     const { data, error } = await invokeAI("generate-workout", { body });
 *     ...
 *   });
 *   <Button onClick={generate.run} disabled={generate.loading}>
 *     {generate.loading && <Loader2 className="animate-spin" />} Generate
 *   </Button>
 */

const DEBOUNCE_MS = 500;
const TIMEOUT_MS = 30_000;

export function useAIAction<T>(
  action: () => Promise<T>,
  opts: { debounceMs?: number; timeoutMs?: number } = {},
) {
  const debounceMs = opts.debounceMs ?? DEBOUNCE_MS;
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;

  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  const lastRun = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionRef = useRef(action);
  actionRef.current = action;

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const run = useCallback(async () => {
    // Do nothing if a request is already in flight (ignore the tap entirely).
    if (inFlight.current) return;
    // Debounce rapid taps.
    const now = Date.now();
    if (now - lastRun.current < debounceMs) return;
    lastRun.current = now;

    inFlight.current = true;
    setLoading(true);

    // Safety timeout: re-enable the button even if the request never resolves.
    timer.current = setTimeout(() => {
      inFlight.current = false;
      setLoading(false);
    }, timeoutMs);

    try {
      return await actionRef.current();
    } finally {
      if (timer.current) clearTimeout(timer.current);
      inFlight.current = false;
      setLoading(false);
    }
  }, [debounceMs, timeoutMs]);

  return { run, loading };
}
