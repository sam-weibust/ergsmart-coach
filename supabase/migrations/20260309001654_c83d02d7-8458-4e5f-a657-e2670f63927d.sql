-- Add C2 logbook integration table
CREATE TABLE public.c2_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  c2_user_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, c2_user_id)
);

-- Enable RLS
ALTER TABLE public.c2_connections ENABLE ROW LEVEL SECURITY;

-- Users can only access their own connections
CREATE POLICY "Users can view their own C2 connections"
ON public.c2_connections
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can create their own C2 connections"
ON public.c2_connections
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own C2 connections"
ON public.c2_connections
FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own C2 connections"
ON public.c2_connections
FOR DELETE
USING (user_id = auth.uid());

-- Add trigger for updated_at
CREATE TRIGGER update_c2_connections_updated_at
  BEFORE UPDATE ON public.c2_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();