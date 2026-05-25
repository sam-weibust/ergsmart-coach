-- AI response cache table — stores Anthropic API results to reduce cost
CREATE TABLE IF NOT EXISTS public.ai_response_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  response text NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz -- null = permanent
);

CREATE INDEX IF NOT EXISTS ai_response_cache_key_idx ON public.ai_response_cache (cache_key);
CREATE INDEX IF NOT EXISTS ai_response_cache_expires_idx ON public.ai_response_cache (expires_at) WHERE expires_at IS NOT NULL;

-- Service role only — edge functions use service role key
ALTER TABLE public.ai_response_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON public.ai_response_cache
  USING (true)
  WITH CHECK (true);
