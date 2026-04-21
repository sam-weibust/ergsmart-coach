-- ============================================================
-- Technique analyses + CrewTimer schema
-- ============================================================

-- ── technique_analyses ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.technique_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_path text,
  video_url text,
  notes text,
  critique jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.technique_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own analyses" ON public.technique_analyses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_technique_analyses_user_id ON public.technique_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_technique_analyses_created_at ON public.technique_analyses(user_id, created_at DESC);

-- ── Storage bucket for technique videos ─────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'technique-videos',
  'technique-videos',
  false,
  104857600, -- 100MB
  ARRAY['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/*']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload technique videos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'technique-videos');

CREATE POLICY "Users can view own technique videos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'technique-videos' AND owner = auth.uid());

CREATE POLICY "Users can delete own technique videos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'technique-videos' AND owner = auth.uid());

-- ── Add CrewTimer columns to existing regattas table ────────
ALTER TABLE public.regattas
  ADD COLUMN IF NOT EXISTS crewtimer_id text,
  ADD COLUMN IF NOT EXISTS level text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'upcoming',
  ADD COLUMN IF NOT EXISTS raw_data jsonb,
  ADD COLUMN IF NOT EXISTS fetched_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_regattas_crewtimer_id
  ON public.regattas(crewtimer_id)
  WHERE crewtimer_id IS NOT NULL;

-- ── regatta_races ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.regatta_races (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regatta_id uuid NOT NULL REFERENCES public.regattas(id) ON DELETE CASCADE,
  race_name text,
  event_name text,
  level text,
  boat_class text,
  gender text,
  round text,
  scheduled_time text,
  raw_data jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.regatta_races ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view regatta races" ON public.regatta_races FOR SELECT USING (true);
CREATE POLICY "Service role can manage regatta races" ON public.regatta_races
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_regatta_races_regatta_id ON public.regatta_races(regatta_id);
CREATE INDEX IF NOT EXISTS idx_regatta_races_event_name ON public.regatta_races(event_name);

-- ── regatta_entries ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.regatta_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id uuid NOT NULL REFERENCES public.regatta_races(id) ON DELETE CASCADE,
  regatta_id uuid NOT NULL REFERENCES public.regattas(id) ON DELETE CASCADE,
  crew_name text,
  club text,
  athletes jsonb DEFAULT '[]'::jsonb,
  lane text,
  finish_time text,
  finish_time_seconds numeric,
  placement integer,
  delta text,
  split text,
  raw_data jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.regatta_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view regatta entries" ON public.regatta_entries FOR SELECT USING (true);
CREATE POLICY "Service role can manage regatta entries" ON public.regatta_entries
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_regatta_entries_race_id ON public.regatta_entries(race_id);
CREATE INDEX IF NOT EXISTS idx_regatta_entries_regatta_id ON public.regatta_entries(regatta_id);
CREATE INDEX IF NOT EXISTS idx_regatta_entries_club ON public.regatta_entries(club);
CREATE INDEX IF NOT EXISTS idx_regatta_entries_crew_name ON public.regatta_entries(crew_name);
CREATE INDEX IF NOT EXISTS idx_regatta_entries_placement ON public.regatta_entries(placement);
CREATE INDEX IF NOT EXISTS idx_regatta_entries_athletes_gin ON public.regatta_entries USING gin(athletes jsonb_path_ops);

-- ── Update claimed_results to reference entries ──────────────
ALTER TABLE public.claimed_results
  ADD COLUMN IF NOT EXISTS entry_id uuid REFERENCES public.regatta_entries(id) ON DELETE SET NULL;

-- ── pg_cron daily sync (enable in Supabase dashboard if pg_cron is available) ──
-- Once enabled, run this to schedule daily sync at 6 AM UTC:
-- SELECT cron.schedule('fetch-crewtimer-daily', '0 6 * * *',
--   $$ SELECT net.http_post(url := current_setting('app.supabase_url') || '/functions/v1/fetch-crewtimer',
--      headers := json_build_object('Content-Type','application/json','Authorization','Bearer '||current_setting('app.service_role_key'))::jsonb,
--      body := '{"action":"sync"}'::jsonb) $$);
