-- Allow users to read their own Concept2 connection status (not tokens)
CREATE POLICY "Users can read their own c2 connection status"
ON public.concept2_tokens
FOR SELECT
USING (auth.uid() = user_id);

-- Add last_sync_at to concept2_tokens for display
ALTER TABLE public.concept2_tokens ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE;
