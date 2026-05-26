-- Add tracking columns to ai_response_cache
ALTER TABLE public.ai_response_cache
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS input_tokens integer,
  ADD COLUMN IF NOT EXISTS output_tokens integer,
  ADD COLUMN IF NOT EXISTS hit_count integer DEFAULT 0;

-- API usage log for cost monitoring
CREATE TABLE IF NOT EXISTS public.api_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  function_name text,
  model text,
  input_tokens integer,
  output_tokens integer,
  cache_hit boolean DEFAULT false,
  cost_usd numeric(10,6),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_usage_log_created_idx ON public.api_usage_log (created_at DESC);
CREATE INDEX IF NOT EXISTS api_usage_log_function_idx ON public.api_usage_log (function_name);
CREATE INDEX IF NOT EXISTS api_usage_log_user_idx ON public.api_usage_log (user_id);

ALTER TABLE public.api_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on usage log"
  ON public.api_usage_log
  USING (true)
  WITH CHECK (true);

-- Function to get cached response and increment hit count
CREATE OR REPLACE FUNCTION get_cached_response(p_cache_key text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_response text;
BEGIN
  UPDATE public.ai_response_cache
  SET hit_count = hit_count + 1
  WHERE cache_key = p_cache_key
    AND (expires_at IS NULL OR expires_at > now())
  RETURNING response INTO v_response;

  RETURN v_response;
END;
$$;

-- Function to upsert cached response
CREATE OR REPLACE FUNCTION set_cached_response(
  p_cache_key text,
  p_response text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.ai_response_cache (cache_key, response, model, input_tokens, output_tokens, expires_at)
  VALUES (p_cache_key, p_response, p_model, p_input_tokens, p_output_tokens, p_expires_at)
  ON CONFLICT (cache_key)
  DO UPDATE SET
    response = EXCLUDED.response,
    model = EXCLUDED.model,
    input_tokens = EXCLUDED.input_tokens,
    output_tokens = EXCLUDED.output_tokens,
    expires_at = EXCLUDED.expires_at,
    hit_count = 0;
END;
$$;
