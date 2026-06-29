-- AI credit failsafes: per-user daily usage limits + per-function circuit breaker.

-- =====================================================================
-- Failsafe 1: per-user-per-day usage tracking
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.daily_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  total_calls integer DEFAULT 0,
  total_tokens integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS daily_ai_usage_user_date_idx
  ON public.daily_ai_usage (user_id, date);

ALTER TABLE public.daily_ai_usage ENABLE ROW LEVEL SECURITY;

-- Edge functions use the service role key, which bypasses RLS. This policy
-- exists only so the table is not wide open if ever queried with anon key.
DROP POLICY IF EXISTS "Service role manages daily ai usage" ON public.daily_ai_usage;
CREATE POLICY "Service role manages daily ai usage"
  ON public.daily_ai_usage
  USING (false)
  WITH CHECK (false);

-- Read today's usage for a user (returns zeros when no row yet).
CREATE OR REPLACE FUNCTION public.get_daily_ai_usage(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_calls integer := 0;
  v_tokens integer := 0;
BEGIN
  SELECT total_calls, total_tokens
    INTO v_calls, v_tokens
  FROM public.daily_ai_usage
  WHERE user_id = p_user_id AND date = current_date;

  RETURN jsonb_build_object(
    'total_calls', COALESCE(v_calls, 0),
    'total_tokens', COALESCE(v_tokens, 0)
  );
END;
$$;

-- Atomically increment today's usage for a user. Returns the new totals.
CREATE OR REPLACE FUNCTION public.increment_daily_ai_usage(
  p_user_id uuid,
  p_tokens integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_calls integer;
  v_tokens integer;
BEGIN
  INSERT INTO public.daily_ai_usage (user_id, date, total_calls, total_tokens)
  VALUES (p_user_id, current_date, 1, GREATEST(COALESCE(p_tokens, 0), 0))
  ON CONFLICT (user_id, date)
  DO UPDATE SET
    total_calls = public.daily_ai_usage.total_calls + 1,
    total_tokens = public.daily_ai_usage.total_tokens + GREATEST(COALESCE(p_tokens, 0), 0)
  RETURNING total_calls, total_tokens INTO v_calls, v_tokens;

  RETURN jsonb_build_object('total_calls', v_calls, 'total_tokens', v_tokens);
END;
$$;

-- =====================================================================
-- Failsafe 9: per-function circuit breaker (stored in rate_limits)
-- =====================================================================
ALTER TABLE public.rate_limits
  ADD COLUMN IF NOT EXISTS circuit_open boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz;

-- Returns true when the circuit for a function is currently open.
-- Auto-resets the circuit after the 5-minute cooldown window.
CREATE OR REPLACE FUNCTION public.check_ai_circuit(p_function text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_key text := 'circuit:' || p_function;
  v_open boolean;
  v_opened_at timestamptz;
BEGIN
  SELECT circuit_open, opened_at
    INTO v_open, v_opened_at
  FROM public.rate_limits
  WHERE key = v_key;

  IF v_open IS NOT TRUE THEN
    RETURN false;
  END IF;

  -- Reset after 5 minutes.
  IF v_opened_at IS NULL OR v_opened_at < now() - interval '5 minutes' THEN
    UPDATE public.rate_limits
    SET circuit_open = false, count = 0, opened_at = NULL
    WHERE key = v_key;
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- Record a consecutive API error. Opens the circuit at 3 errors in 5 minutes.
CREATE OR REPLACE FUNCTION public.record_ai_error(p_function text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_key text := 'circuit:' || p_function;
  v_count integer;
  v_window_start timestamptz;
BEGIN
  SELECT count, window_start
    INTO v_count, v_window_start
  FROM public.rate_limits
  WHERE key = v_key;

  IF v_count IS NULL THEN
    INSERT INTO public.rate_limits (key, count, window_start, circuit_open)
    VALUES (v_key, 1, now(), false)
    ON CONFLICT (key) DO UPDATE SET count = 1, window_start = now();
    RETURN;
  END IF;

  -- Restart the error window if the last error was more than 5 minutes ago.
  IF v_window_start IS NULL OR v_window_start < now() - interval '5 minutes' THEN
    UPDATE public.rate_limits
    SET count = 1, window_start = now(), circuit_open = false, opened_at = NULL
    WHERE key = v_key;
    RETURN;
  END IF;

  v_count := v_count + 1;

  UPDATE public.rate_limits
  SET count = v_count,
      circuit_open = (v_count >= 3),
      opened_at = CASE WHEN v_count >= 3 THEN now() ELSE opened_at END
  WHERE key = v_key;
END;
$$;

-- Record a successful API call: reset the error counter and close the circuit.
CREATE OR REPLACE FUNCTION public.record_ai_success(p_function text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_key text := 'circuit:' || p_function;
BEGIN
  UPDATE public.rate_limits
  SET count = 0, circuit_open = false, opened_at = NULL, window_start = now()
  WHERE key = v_key;
END;
$$;
