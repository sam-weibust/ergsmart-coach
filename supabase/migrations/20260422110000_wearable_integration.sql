-- Wearable provider connections (stores encrypted tokens)
CREATE TABLE IF NOT EXISTS public.wearable_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,          -- 'garmin','whoop','oura','polar','fitbit', etc.
  terra_user_id TEXT,              -- aggregator's internal user ID
  access_token_enc TEXT,           -- AES-GCM encrypted access token
  refresh_token_enc TEXT,          -- AES-GCM encrypted refresh token
  token_expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  error_message TEXT,
  UNIQUE(user_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_wearable_connections_user ON wearable_connections(user_id);
ALTER TABLE public.wearable_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own wearable connections" ON public.wearable_connections
  FOR ALL USING (auth.uid() = user_id);

-- Daily wearable-derived recovery metrics (HRV, resting HR, readiness)
CREATE TABLE IF NOT EXISTS public.recovery_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  hrv NUMERIC(6,2),               -- HRV RMSSD in ms
  resting_hr NUMERIC(5,2),         -- resting heart rate bpm
  recovery_score_input NUMERIC(5,2), -- wearable readiness/recovery 0-100
  steps INTEGER,
  active_calories INTEGER,
  strain NUMERIC(5,2),             -- WHOOP-style strain 0-21
  provider TEXT,                   -- which wearable
  source TEXT DEFAULT 'wearable',  -- 'wearable' | 'manual'
  wearable_updated_at TIMESTAMPTZ, -- when wearable last wrote this row
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_recovery_metrics_user_date ON recovery_metrics(user_id, date DESC);
ALTER TABLE public.recovery_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own recovery metrics" ON public.recovery_metrics
  FOR ALL USING (auth.uid() = user_id);

-- Track which sleep_entries came from a wearable (never overwrite manual with older wearable data)
ALTER TABLE public.sleep_entries ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE public.sleep_entries ADD COLUMN IF NOT EXISTS wearable_updated_at TIMESTAMPTZ;
ALTER TABLE public.sleep_entries ADD COLUMN IF NOT EXISTS provider TEXT;
