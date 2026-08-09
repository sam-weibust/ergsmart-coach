import { useCallback, useRef } from "react";

/**
 * Button-level guard for expensive (AI / paid) actions.
 *
 * Two protections, both at the UI layer:
 *   1. re-entrancy — while the wrapped handler's promise is still pending,
 *      further presses are dropped outright;
 *   2. a `delayMs` cooldown after it settles, so a double-tap (or a duplicated
 *      touch + click event on iOS) cannot fire the same request twice.
 *
 * This complements — it does not replace — the network-layer de-duplication in
 * `src/lib/aiInvoke.ts` (invokeAI) and `src/lib/api.ts` (callFunction). Those
 * collapse identical in-flight requests; this stops the second request from
 * being constructed at all, which also avoids the duplicate DB writes and
 * duplicate toasts that surround an AI call.
 *
 * Usage:
 *   const handleSave = useDebouncedAction(async () => { ... });
 *   <Button onClick={handleSave} />
 */
export function useDebouncedAction<A extends unknown[]>(
  fn: (...args: A) => void | Promise<void>,
  delayMs = 500,
): (...args: A) => void {
  const runningRef = useRef(false);
  const lastSettledRef = useRef(0);

  return useCallback(
    (...args: A) => {
      if (runningRef.current) return;
      if (Date.now() - lastSettledRef.current < delayMs) return;

      runningRef.current = true;
      Promise.resolve()
        .then(() => fn(...args))
        .catch((err) => {
          // The wrapped handler owns its own error UI; never swallow silently.
          console.error("[useDebouncedAction] handler threw:", err);
        })
        .finally(() => {
          runningRef.current = false;
          lastSettledRef.current = Date.now();
        });
    },
    [fn, delayMs],
  );
}
