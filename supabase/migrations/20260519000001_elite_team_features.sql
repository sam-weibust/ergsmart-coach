-- ── Elite Team Features Migration ──────────────────────────────────────────

-- 1. Extend teams table with branding + portal columns
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#0a1628',
  ADD COLUMN IF NOT EXISTS portal_public boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_description text;

-- Auto-generate slugs for existing teams
UPDATE public.teams
SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
        || '-' || substr(id::text, 1, 6)
WHERE slug IS NULL;

ALTER TABLE public.teams ADD CONSTRAINT teams_slug_unique UNIQUE (slug);

-- 2. Parent contacts
CREATE TABLE IF NOT EXISTS public.parent_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_name text NOT NULL,
  parent_email text NOT NULL,
  relationship text DEFAULT 'Guardian',
  opted_in boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(team_id, athlete_id, parent_email)
);

-- 3. Parent email settings (one row per team)
CREATE TABLE IF NOT EXISTS public.parent_email_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  enabled boolean DEFAULT false,
  send_day text DEFAULT 'Sunday',
  send_hour integer DEFAULT 18,
  team_note text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(team_id)
);

-- 4. Per-athlete weekly coach notes
CREATE TABLE IF NOT EXISTS public.parent_email_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.profiles(id),
  week_of date NOT NULL,
  individual_note text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(team_id, athlete_id, week_of)
);

-- 5. Recruiting portal views (for analytics)
CREATE TABLE IF NOT EXISTS public.recruit_portal_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  viewed_at timestamptz DEFAULT now(),
  viewer_ip text
);

-- 6. Opt-in to appear on team recruiting portal
ALTER TABLE public.athlete_profiles
  ADD COLUMN IF NOT EXISTS show_on_team_portal boolean DEFAULT false;

-- 7. Coach AI chat messages (per coach per team)
CREATE TABLE IF NOT EXISTS public.coach_ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ── Storage bucket policy for team-logos ─────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('team-logos', 'team-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "coaches_upload_team_logos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'team-logos'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "public_read_team_logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'team-logos');

CREATE POLICY "coaches_delete_team_logos" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'team-logos'
    AND auth.role() = 'authenticated'
  );

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.parent_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_email_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruit_portal_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_ai_messages ENABLE ROW LEVEL SECURITY;

-- parent_contacts: coach manages, athletes can view own
CREATE POLICY "coach_manage_parent_contacts" ON public.parent_contacts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND coach_id = auth.uid())
  );
CREATE POLICY "athlete_view_own_parent_contact" ON public.parent_contacts
  FOR SELECT USING (athlete_id = auth.uid());

-- parent_email_settings: coach only
CREATE POLICY "coach_manage_parent_email_settings" ON public.parent_email_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND coach_id = auth.uid())
  );

-- parent_email_notes: coach only
CREATE POLICY "coach_manage_parent_email_notes" ON public.parent_email_notes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND coach_id = auth.uid())
  );

-- recruit_portal_views: public insert, coach select
CREATE POLICY "public_insert_recruit_portal_views" ON public.recruit_portal_views
  FOR INSERT WITH CHECK (true);
CREATE POLICY "coach_view_recruit_portal_views" ON public.recruit_portal_views
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND coach_id = auth.uid())
  );

-- coach_ai_messages: coach only (own messages)
CREATE POLICY "coach_manage_ai_messages" ON public.coach_ai_messages
  FOR ALL USING (coach_id = auth.uid());
