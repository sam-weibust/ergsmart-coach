/**
 * Fast auth helper for use inside React Query queryFns.
 *
 * Uses getSession() instead of getUser() — reads the JWT from the in-memory /
 * localStorage cache without a network round-trip. All 50+ queryFns that need
 * the current user ID call this instead of supabase.auth.getUser().
 *
 * getUser() (the old pattern) sends an HTTP request to validate the token on
 * every call. With many simultaneous queries this causes slow loads, silent
 * failures under rate-limits, and empty dashboards that look like data bugs.
 */
import { supabase } from "@/integrations/supabase/client";

export async function getSessionUser() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
}
