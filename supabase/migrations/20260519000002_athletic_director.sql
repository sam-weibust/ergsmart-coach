-- ── Athletic Director tables ─────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.org_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE, -- nullable, for team-specific ADs
  posted_by uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL,
  body text NOT NULL,
  is_urgent boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  CHECK (org_id IS NOT NULL OR team_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.org_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  athlete_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  alert_type text NOT NULL, -- 'consecutive_absences' | 'low_attendance' | 'performance_decline' | 'no_activity' | 'injury_pattern'
  message text NOT NULL,
  resolved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_athletic_directors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, -- null until accepted
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  invited_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  joined_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (team_id, invited_email)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.org_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_athletic_directors ENABLE ROW LEVEL SECURITY;

-- org_announcements: organizers can insert; team members can read
CREATE POLICY "org_announcements_select" ON public.org_announcements FOR SELECT USING (
  org_id IN (SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid())
  OR org_id IN (SELECT id FROM public.organizations WHERE created_by = auth.uid())
  OR org_id IN (
    SELECT ot.organization_id FROM public.organization_teams ot
    JOIN public.teams t ON t.id = ot.team_id
    WHERE t.coach_id = auth.uid()
      OR t.id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  )
  OR team_id IN (SELECT team_id FROM public.team_athletic_directors WHERE user_id = auth.uid() AND status = 'accepted')
  OR team_id IN (SELECT id FROM public.teams WHERE coach_id = auth.uid())
  OR team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
);

CREATE POLICY "org_announcements_insert" ON public.org_announcements FOR INSERT WITH CHECK (
  posted_by = auth.uid() AND (
    org_id IN (SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid())
    OR org_id IN (SELECT id FROM public.organizations WHERE created_by = auth.uid())
    OR team_id IN (SELECT team_id FROM public.team_athletic_directors WHERE user_id = auth.uid() AND status = 'accepted')
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'organizer')
  )
);

-- org_alerts: org admins and team ADs can read; only service role inserts
CREATE POLICY "org_alerts_select" ON public.org_alerts FOR SELECT USING (
  org_id IN (SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid())
  OR org_id IN (SELECT id FROM public.organizations WHERE created_by = auth.uid())
  OR team_id IN (SELECT team_id FROM public.team_athletic_directors WHERE user_id = auth.uid() AND status = 'accepted')
  OR team_id IN (SELECT id FROM public.teams WHERE coach_id = auth.uid())
);

CREATE POLICY "org_alerts_update" ON public.org_alerts FOR UPDATE USING (
  org_id IN (SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid())
  OR org_id IN (SELECT id FROM public.organizations WHERE created_by = auth.uid())
  OR team_id IN (SELECT team_id FROM public.team_athletic_directors WHERE user_id = auth.uid() AND status = 'accepted')
);

-- team_athletic_directors: coaches can manage their team's ADs; ADs can read own records
CREATE POLICY "tad_select" ON public.team_athletic_directors FOR SELECT USING (
  user_id = auth.uid()
  OR team_id IN (SELECT id FROM public.teams WHERE coach_id = auth.uid())
  OR team_id IN (SELECT team_id FROM public.team_coaches WHERE user_id = auth.uid() AND role = 'head_coach')
);

CREATE POLICY "tad_insert" ON public.team_athletic_directors FOR INSERT WITH CHECK (
  team_id IN (SELECT id FROM public.teams WHERE coach_id = auth.uid())
  OR team_id IN (SELECT team_id FROM public.team_coaches WHERE user_id = auth.uid() AND role = 'head_coach')
);

CREATE POLICY "tad_update" ON public.team_athletic_directors FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "tad_delete" ON public.team_athletic_directors FOR DELETE USING (
  team_id IN (SELECT id FROM public.teams WHERE coach_id = auth.uid())
  OR team_id IN (SELECT team_id FROM public.team_coaches WHERE user_id = auth.uid() AND role = 'head_coach')
);

-- Teams RLS: ADs can SELECT teams they're linked to
CREATE POLICY "tad_team_select" ON public.teams FOR SELECT USING (
  id IN (SELECT team_id FROM public.team_athletic_directors WHERE user_id = auth.uid() AND status = 'accepted')
);

-- team_members RLS: ADs can read roster for their teams
CREATE POLICY "tad_team_members_select" ON public.team_members FOR SELECT USING (
  team_id IN (SELECT team_id FROM public.team_athletic_directors WHERE user_id = auth.uid() AND status = 'accepted')
);

-- erg_workouts RLS: ADs can read for oversight (no wellness details)
CREATE POLICY "tad_erg_workouts_select" ON public.erg_workouts FOR SELECT USING (
  user_id IN (
    SELECT tm.user_id FROM public.team_members tm
    JOIN public.team_athletic_directors tad ON tad.team_id = tm.team_id
    WHERE tad.user_id = auth.uid() AND tad.status = 'accepted'
  )
);

-- attendance_records RLS: ADs can read
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'attendance_records') THEN
    EXECUTE $policy$
      CREATE POLICY "tad_attendance_select" ON public.attendance_records FOR SELECT USING (
        team_id IN (SELECT team_id FROM public.team_athletic_directors WHERE user_id = auth.uid() AND status = 'accepted')
      )
    $policy$;
  END IF;
END $$;
