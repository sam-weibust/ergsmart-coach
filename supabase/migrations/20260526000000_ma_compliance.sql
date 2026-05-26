-- Massachusetts 201 CMR 17.00 compliance migration

-- ── 1. RLS enforcement on personal data tables ───────────────────────────────
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.erg_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.erg_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.recovery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.nutrition_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wellness_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.parent_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.athlete_academics ENABLE ROW LEVEL SECURITY;

-- ── 2. Minor data protection ─────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS parental_consent_given boolean DEFAULT false;

-- Default profile_public to false (already false, but enforce for minors)
-- is_minor helper function
CREATE OR REPLACE FUNCTION public.is_minor(dob date)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN dob IS NULL THEN false ELSE (CURRENT_DATE - dob) / 365 < 18 END;
$$;

-- ── 3. Session security ───────────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_active_at timestamptz DEFAULT now();

-- ── 4. Audit logging ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text,
  resource_id uuid,
  ip_address text,
  user_agent text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs (created_at);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON public.audit_logs (action);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Users can read their own audit logs; service role can write
CREATE POLICY "Users read own audit logs"
  ON public.audit_logs FOR SELECT
  USING (user_id = auth.uid());

-- ── 5. Data export request tracking ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.data_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_type text NOT NULL CHECK (request_type IN ('export', 'deletion')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.data_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own data requests"
  ON public.data_requests FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
