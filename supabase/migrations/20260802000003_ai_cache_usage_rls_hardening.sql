-- ============================================================================
-- Security hardening for the AI response cache and API usage log.
--
-- FINDING (critical, confirmed against the live table with the anon key):
--   20260525000000_ai_response_cache.sql:16-19 and
--   20260527000001_api_cost_tracking.sql:26-29 both declare
--
--     CREATE POLICY "..." ON <table> USING (true) WITH CHECK (true);
--
--   with no FOR clause and no TO clause. Postgres defaults those to
--   FOR ALL TO PUBLIC, so the policies grant every role -- including the
--   anonymous `anon` role that ships in the browser bundle -- full SELECT,
--   INSERT, UPDATE and DELETE on both tables. The comment above each policy
--   says "service role only"; the SQL says the opposite.
--
--   Impact:
--     * ai_response_cache holds cached training plans, workout analyses and
--       athlete summaries -> world-readable AND world-writable. A third party
--       could read other athletes' data, or poison cache entries so other
--       users are served attacker-controlled "AI" output.
--     * api_usage_log holds user_id + per-user spend -> world-readable
--       (privacy leak) and world-deletable (destroys billing history).
--
--   A later migration (20260629000000_ai_credit_failsafes.sql:24-27) already
--   uses the correct deny-all shape for daily_ai_usage. These two tables
--   simply predate that pattern.
--
-- SECOND FINDING: get_cached_response / set_cached_response and the credit
--   failsafe functions are SECURITY DEFINER, which BYPASSES RLS entirely, and
--   Postgres grants EXECUTE to PUBLIC by default. Fixing the table policies
--   alone would leave the cache fully readable and writable by anon through
--   the RPCs. They also lack `SET search_path`, a privilege-escalation vector
--   in a SECURITY DEFINER function.
--
-- Edge functions are unaffected: every one of them builds its client with
-- SUPABASE_SERVICE_ROLE_KEY (verified across all 34 AI functions), and the
-- service role both bypasses RLS and is granted EXECUTE below.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. ai_response_cache -- service role only, no public access at all.
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_response_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.ai_response_cache;

CREATE POLICY "ai_response_cache service role full access"
  ON public.ai_response_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Nothing in the frontend reads this table; no anon/authenticated policy.
REVOKE ALL ON public.ai_response_cache FROM anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. api_usage_log -- service role writes; admins may read.
--
-- The admin cost dashboard (src/pages/AdminPage.tsx,
-- src/components/dashboard/ApiCostDashboard.tsx) queries this table directly
-- with the signed-in user's JWT, so a service-role-only policy would break it.
-- Today that dashboard is gated ONLY by a hardcoded client-side email list,
-- which any user can bypass by calling PostgREST directly. The SELECT policy
-- below moves that check server-side using the existing has_role() predicate.
-- ---------------------------------------------------------------------------
ALTER TABLE public.api_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on usage log" ON public.api_usage_log;

CREATE POLICY "api_usage_log service role full access"
  ON public.api_usage_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "api_usage_log admin read"
  ON public.api_usage_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

REVOKE ALL ON public.api_usage_log FROM anon, authenticated;
GRANT SELECT ON public.api_usage_log TO authenticated; -- still filtered by the policy above

-- Preserve the existing admin's access: the dashboard's hardcoded allowlist is
-- a single address. Seed the matching server-side role so the dashboard keeps
-- working after this migration. Idempotent, and a no-op if the user is absent.
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) = 'sam.weibust@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 3. Cost-accounting columns.
-- Cache-write and cache-read input tokens are billed at different rates
-- (1.25x and 0.1x of the base input rate), so they must be stored separately
-- from ordinary input tokens for cost reporting to be correct.
-- ---------------------------------------------------------------------------
ALTER TABLE public.api_usage_log
  ADD COLUMN IF NOT EXISTS cache_creation_input_tokens integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cache_read_input_tokens integer DEFAULT 0;


-- ---------------------------------------------------------------------------
-- 4. Lock down the SECURITY DEFINER RPCs and pin their search_path.
-- None of these are called from the frontend (verified: zero references in
-- src/). Only edge functions, which authenticate as service_role, invoke them.
-- ---------------------------------------------------------------------------
-- Resolved from the catalogue rather than by hardcoded signature, so a
-- signature drift cannot abort the migration. Covers the cache RPCs and the
-- AI credit failsafes from 20260629000000 — the latter matter because an
-- anon-reachable increment_daily_ai_usage lets a user defeat the per-user
-- daily spend cap by resetting or inflating their own counters.
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_cached_response',
        'set_cached_response',
        'get_daily_ai_usage',
        'increment_daily_ai_usage',
        'check_ai_circuit',
        'record_ai_error',
        'record_ai_success'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', fn.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
  END LOOP;
END $$;
