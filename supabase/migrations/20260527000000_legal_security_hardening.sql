-- Legal & Security Hardening Migration

-- ── 1. Terms of Service acceptance ──────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS accepted_terms_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS terms_version text DEFAULT '1.0';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS disclaimer_acknowledged boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS disclaimer_acknowledged_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS h2h_waiver_accepted boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS h2h_waiver_accepted_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS message_transparency_acknowledged boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'free';

-- Minor: leaderboard_opt_in defaults false for new accounts
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS leaderboard_opt_in boolean DEFAULT false;

-- ── 2. Rate limiting table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  count integer DEFAULT 0,
  window_start timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limits_key_idx ON public.rate_limits (key);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role can manage rate limits
CREATE POLICY "Service role manages rate limits"
  ON public.rate_limits FOR ALL
  USING (false);

-- ── 3. Login attempts table (brute force protection) ────────────────────────
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  ip_address text,
  attempted_at timestamptz DEFAULT now(),
  success boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON public.login_attempts (email);
CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON public.login_attempts (ip_address);
CREATE INDEX IF NOT EXISTS login_attempts_attempted_at_idx ON public.login_attempts (attempted_at);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Only service role can access login attempts
CREATE POLICY "Service role manages login attempts"
  ON public.login_attempts FOR ALL
  USING (false);

-- ── 4. RLS on tables not yet covered ────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'push_tokens') THEN
    EXECUTE 'ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY';
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_tokens' AND policyname = 'Users manage own push tokens') THEN
      EXECUTE $p$CREATE POLICY "Users manage own push tokens" ON public.push_tokens FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())$p$;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'concept2_tokens') THEN
    EXECUTE 'ALTER TABLE public.concept2_tokens ENABLE ROW LEVEL SECURITY';
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'concept2_tokens' AND policyname = 'Users manage own concept2 tokens') THEN
      EXECUTE $p$CREATE POLICY "Users manage own concept2 tokens" ON public.concept2_tokens FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())$p$;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'whoop_tokens') THEN
    EXECUTE 'ALTER TABLE public.whoop_tokens ENABLE ROW LEVEL SECURITY';
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'whoop_tokens' AND policyname = 'Users manage own whoop tokens') THEN
      EXECUTE $p$CREATE POLICY "Users manage own whoop tokens" ON public.whoop_tokens FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())$p$;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_response_cache') THEN
    EXECUTE 'ALTER TABLE public.ai_response_cache ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'chat_messages') THEN
    EXECUTE 'ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY';
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chat_messages' AND policyname = 'Users manage own chat messages') THEN
      EXECUTE $p$CREATE POLICY "Users manage own chat messages" ON public.chat_messages FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())$p$;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_goals') THEN
    EXECUTE 'ALTER TABLE public.user_goals ENABLE ROW LEVEL SECURITY';
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_goals' AND policyname = 'Users manage own goals') THEN
      EXECUTE $p$CREATE POLICY "Users manage own goals" ON public.user_goals FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())$p$;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'erg_assignment_results') THEN
    EXECUTE 'ALTER TABLE public.erg_assignment_results ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- ── 5. Minor: leaderboard_opt_in must be false for minors unless parental consent given
-- Enforce via app logic + this function
CREATE OR REPLACE FUNCTION public.minor_can_appear_on_leaderboard(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT NOT is_minor(date_of_birth) OR parental_consent_given
     FROM public.profiles WHERE id = user_id),
    true
  );
$$;
