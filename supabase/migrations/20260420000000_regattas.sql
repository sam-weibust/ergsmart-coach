-- ============================================================
-- REGATTAS FEATURE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.regattas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text UNIQUE,
  name text NOT NULL,
  event_date date,
  end_date date,
  location text,
  state text,
  host_club text,
  event_type text CHECK (event_type IN ('sprint', 'head_race', 'other')),
  rc_url text,
  events jsonb DEFAULT '[]'::jsonb,
  cached_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regattas_event_date ON public.regattas(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_regattas_state ON public.regattas(state);
CREATE INDEX IF NOT EXISTS idx_regattas_name ON public.regattas USING gin(to_tsvector('english', name));

ALTER TABLE public.regattas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view regattas" ON public.regattas FOR SELECT USING (true);
CREATE POLICY "Service role can manage regattas" ON public.regattas FOR ALL USING (auth.role() = 'service_role');

-- ── regatta_results ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.regatta_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regatta_id uuid NOT NULL REFERENCES public.regattas(id) ON DELETE CASCADE,
  event_name text,
  boat_class text,
  placement integer,
  finish_time text,
  club text,
  crew jsonb DEFAULT '[]'::jsonb,
  raw_data jsonb,
  cached_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regatta_results_regatta_id ON public.regatta_results(regatta_id);

ALTER TABLE public.regatta_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view regatta results" ON public.regatta_results FOR SELECT USING (true);
CREATE POLICY "Service role can manage regatta results" ON public.regatta_results FOR ALL USING (auth.role() = 'service_role');

-- ── claimed_results ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.claimed_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  regatta_id uuid NOT NULL REFERENCES public.regattas(id) ON DELETE CASCADE,
  result_id uuid REFERENCES public.regatta_results(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  placement integer,
  finish_time text,
  crew jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, regatta_id, event_name)
);

CREATE INDEX IF NOT EXISTS idx_claimed_results_user_id ON public.claimed_results(user_id);
CREATE INDEX IF NOT EXISTS idx_claimed_results_regatta_id ON public.claimed_results(regatta_id);

ALTER TABLE public.claimed_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own claimed results" ON public.claimed_results
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Anyone can view claimed results" ON public.claimed_results FOR SELECT USING (true);

-- ── regatta_attendees ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.regatta_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  regatta_id uuid NOT NULL REFERENCES public.regattas(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, regatta_id)
);

ALTER TABLE public.regatta_attendees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own attendance" ON public.regatta_attendees
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Anyone can view attendees" ON public.regatta_attendees FOR SELECT USING (true);

-- ── clubs ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text UNIQUE,
  name text NOT NULL,
  location text,
  state text,
  club_type text CHECK (club_type IN ('high_school', 'club', 'collegiate', 'masters', 'other')),
  rc_url text,
  cached_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clubs_state ON public.clubs(state);
CREATE INDEX IF NOT EXISTS idx_clubs_name ON public.clubs USING gin(to_tsvector('english', name));

ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view clubs" ON public.clubs FOR SELECT USING (true);
CREATE POLICY "Service role can manage clubs" ON public.clubs FOR ALL USING (auth.role() = 'service_role');
