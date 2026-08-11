/**
 * Post-login redirect target ("?next=/pricing").
 *
 * Kept in sessionStorage rather than read straight off the URL because the
 * Google OAuth round-trip returns to window.location.origin and drops every
 * query param, and because two places race to navigate after sign-in: Auth.tsx
 * (password login) and the SIGNED_IN handler in App.tsx (OAuth, email confirm).
 * Stashing it once and consuming it in whichever fires first keeps both paths
 * on the same destination.
 */
const KEY = "auth_next";

/** Only same-origin absolute paths. "//evil.com" is protocol-relative — reject it. */
function isSafeInternalPath(path: string | null): path is string {
  return !!path && path.startsWith("/") && !path.startsWith("//");
}

export function stashAuthNext(path: string | null): void {
  if (!isSafeInternalPath(path)) return;
  try { sessionStorage.setItem(KEY, path); } catch { /* private mode */ }
}

/** Returns the stored path and clears it, so a stale target can't hijack a later login. */
export function consumeAuthNext(): string | null {
  try {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return isSafeInternalPath(v) ? v : null;
  } catch {
    return null;
  }
}
