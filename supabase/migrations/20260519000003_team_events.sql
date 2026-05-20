-- ── Team Events Migration ────────────────────────────────────────────────────

-- Fix team slugs (idempotent)
UPDATE public.teams
SET slug = lower(regexp_replace(name, '[^a-z0-9]+', '-', 'g'))
WHERE slug IS NULL OR slug = '';

-- team_events table
CREATE TABLE IF NOT EXISTS public.team_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  event_type text NOT NULL DEFAULT 'other'
    CHECK (event_type IN ('regatta','team_meal','meeting','erg_testing','strength','rest_day','travel','other')),
  date date NOT NULL,
  start_time time,
  end_time time,
  location text,
  description text,
  visible_to jsonb NOT NULL DEFAULT '{"type":"all"}'::jsonb,
  is_recurring boolean NOT NULL DEFAULT false,
  recurrence_rule text,
  notify_team boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.team_events ENABLE ROW LEVEL SECURITY;

-- Coaches can manage events they created; head coaches can manage all
CREATE POLICY "coaches_manage_own_events" ON public.team_events
  FOR ALL USING (
    coach_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.teams WHERE id = team_id AND coach_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.team_coaches
      WHERE team_id = team_events.team_id
        AND coach_id = auth.uid()
        AND role = 'head_coach'
    )
  );

-- Athletes can view events visible to them (not coaches_only)
CREATE POLICY "athletes_view_events" ON public.team_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = team_events.team_id AND user_id = auth.uid()
    )
    AND (visible_to->>'type' != 'coaches_only')
  );

-- Index for fast queries
CREATE INDEX IF NOT EXISTS team_events_team_date_idx ON public.team_events(team_id, date);
