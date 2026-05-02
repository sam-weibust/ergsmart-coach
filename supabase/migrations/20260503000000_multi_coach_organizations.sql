-- ── Multiple coaches per team ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_coaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'assistant_coach'
    CHECK (role IN ('head_coach', 'assistant_coach', 'volunteer_coach')),
  invited_by uuid REFERENCES auth.users(id),
  joined_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);

ALTER TABLE team_coaches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_coaches_select"
  ON team_coaches FOR SELECT
  USING (
    auth.uid() = user_id
    OR team_id IN (SELECT id FROM teams WHERE coach_id = auth.uid())
    OR team_id IN (SELECT team_id FROM team_coaches WHERE user_id = auth.uid())
    OR team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  );

CREATE POLICY "team_coaches_insert"
  ON team_coaches FOR INSERT
  WITH CHECK (
    team_id IN (SELECT id FROM teams WHERE coach_id = auth.uid())
    OR team_id IN (SELECT team_id FROM team_coaches WHERE user_id = auth.uid() AND role = 'head_coach')
  );

CREATE POLICY "team_coaches_update"
  ON team_coaches FOR UPDATE
  USING (
    team_id IN (SELECT id FROM teams WHERE coach_id = auth.uid())
    OR team_id IN (SELECT team_id FROM team_coaches WHERE user_id = auth.uid() AND role = 'head_coach')
  );

CREATE POLICY "team_coaches_delete"
  ON team_coaches FOR DELETE
  USING (
    team_id IN (SELECT id FROM teams WHERE coach_id = auth.uid())
    OR team_id IN (SELECT team_id FROM team_coaches WHERE user_id = auth.uid() AND role = 'head_coach')
  );

-- Coach invitations (pending)
CREATE TABLE IF NOT EXISTS coach_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'assistant_coach'
    CHECK (role IN ('assistant_coach', 'volunteer_coach')),
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE coach_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach_invites_select" ON coach_invites FOR SELECT USING (true);

CREATE POLICY "coach_invites_insert"
  ON coach_invites FOR INSERT
  WITH CHECK (
    team_id IN (SELECT id FROM teams WHERE coach_id = auth.uid())
    OR team_id IN (SELECT team_id FROM team_coaches WHERE user_id = auth.uid() AND role = 'head_coach')
  );

CREATE POLICY "coach_invites_update" ON coach_invites FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "coach_invites_delete"
  ON coach_invites FOR DELETE
  USING (
    team_id IN (SELECT id FROM teams WHERE coach_id = auth.uid())
    OR team_id IN (SELECT team_id FROM team_coaches WHERE user_id = auth.uid() AND role = 'head_coach')
  );

-- Add join_code to teams
ALTER TABLE teams ADD COLUMN IF NOT EXISTS join_code text UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex');
UPDATE teams SET join_code = encode(gen_random_bytes(6), 'hex') WHERE join_code IS NULL;

-- ── Organizations ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  logo_url text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS organization_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

ALTER TABLE organization_admins ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS organization_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, team_id)
);

ALTER TABLE organization_teams ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS org_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE org_messages ENABLE ROW LEVEL SECURITY;

-- RLS for organizations
CREATE POLICY "orgs_select"
  ON organizations FOR SELECT
  USING (
    created_by = auth.uid()
    OR id IN (SELECT organization_id FROM organization_admins WHERE user_id = auth.uid())
    OR id IN (
      SELECT ot.organization_id FROM organization_teams ot
      JOIN teams t ON t.id = ot.team_id
      WHERE t.coach_id = auth.uid()
         OR t.id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
         OR t.id IN (SELECT team_id FROM team_coaches WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "orgs_insert"
  ON organizations FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "orgs_update"
  ON organizations FOR UPDATE
  USING (
    created_by = auth.uid()
    OR id IN (SELECT organization_id FROM organization_admins WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "orgs_delete"
  ON organizations FOR DELETE
  USING (created_by = auth.uid());

-- RLS for organization_admins
CREATE POLICY "org_admins_select"
  ON organization_admins FOR SELECT
  USING (
    user_id = auth.uid()
    OR organization_id IN (SELECT id FROM organizations WHERE created_by = auth.uid())
    OR organization_id IN (SELECT organization_id FROM organization_admins WHERE user_id = auth.uid())
  );

CREATE POLICY "org_admins_insert"
  ON organization_admins FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT id FROM organizations WHERE created_by = auth.uid())
  );

CREATE POLICY "org_admins_delete"
  ON organization_admins FOR DELETE
  USING (
    organization_id IN (SELECT id FROM organizations WHERE created_by = auth.uid())
  );

-- RLS for organization_teams
CREATE POLICY "org_teams_select"
  ON organization_teams FOR SELECT
  USING (
    organization_id IN (SELECT id FROM organizations WHERE created_by = auth.uid())
    OR organization_id IN (SELECT organization_id FROM organization_admins WHERE user_id = auth.uid())
    OR team_id IN (SELECT id FROM teams WHERE coach_id = auth.uid())
    OR team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
    OR team_id IN (SELECT team_id FROM team_coaches WHERE user_id = auth.uid())
  );

CREATE POLICY "org_teams_insert"
  ON organization_teams FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT id FROM organizations WHERE created_by = auth.uid())
    OR organization_id IN (SELECT organization_id FROM organization_admins WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "org_teams_delete"
  ON organization_teams FOR DELETE
  USING (
    organization_id IN (SELECT id FROM organizations WHERE created_by = auth.uid())
    OR organization_id IN (SELECT organization_id FROM organization_admins WHERE user_id = auth.uid() AND role = 'admin')
  );

-- RLS for org_messages
CREATE POLICY "org_messages_select"
  ON org_messages FOR SELECT
  USING (
    organization_id IN (SELECT id FROM organizations WHERE created_by = auth.uid())
    OR organization_id IN (SELECT organization_id FROM organization_admins WHERE user_id = auth.uid())
    OR organization_id IN (
      SELECT ot.organization_id FROM organization_teams ot
      JOIN teams t ON t.id = ot.team_id
      WHERE t.coach_id = auth.uid()
         OR t.id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
         OR t.id IN (SELECT team_id FROM team_coaches WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "org_messages_insert"
  ON org_messages FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND (
      organization_id IN (SELECT id FROM organizations WHERE created_by = auth.uid())
      OR organization_id IN (SELECT organization_id FROM organization_admins WHERE user_id = auth.uid())
      OR organization_id IN (
        SELECT ot.organization_id FROM organization_teams ot
        JOIN teams t ON t.id = ot.team_id
        WHERE t.coach_id = auth.uid()
           OR t.id IN (SELECT team_id FROM team_coaches WHERE user_id = auth.uid())
      )
    )
  );

CREATE POLICY "org_messages_delete"
  ON org_messages FOR DELETE
  USING (
    user_id = auth.uid()
    OR organization_id IN (SELECT id FROM organizations WHERE created_by = auth.uid())
    OR organization_id IN (SELECT organization_id FROM organization_admins WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ── Organizer profile fields ─────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS org_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS org_title text;

-- ── Lineup created_by for "Posted by" display ────────────────────────────────
ALTER TABLE boat_lineups ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- ── Update new user trigger to capture role from signup metadata ─────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'athlete')
  )
  ON CONFLICT (id) DO UPDATE
    SET
      full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
      role = COALESCE(EXCLUDED.role, profiles.role);
  RETURN NEW;
END;
$$;
