-- SafeSport compliant messaging + Organization features migration

-- ── SafeSport mode on teams ───────────────────────────────────────────────────
ALTER TABLE teams ADD COLUMN IF NOT EXISTS safesport_mode boolean NOT NULL DEFAULT true;

-- ── Coach-athlete transparent messaging (SafeSport compliant) ─────────────────
CREATE TABLE IF NOT EXISTS coach_athlete_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_athlete_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  group_type text NOT NULL DEFAULT 'individual'
    CHECK (group_type IN ('individual', 'boat', 'coxswains', 'all')),
  group_label text,
  content text NOT NULL,
  parent_visible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE coach_athlete_messages ENABLE ROW LEVEL SECURITY;

-- All coaches on the team can read all messages in that team
CREATE POLICY "cam_coaches_select" ON coach_athlete_messages FOR SELECT
  USING (
    team_id IN (
      SELECT id FROM teams WHERE coach_id = auth.uid()
      UNION SELECT team_id FROM team_coaches WHERE user_id = auth.uid()
    )
    OR recipient_athlete_id = auth.uid()
    OR sender_id = auth.uid()
  );

-- Coaches can insert
CREATE POLICY "cam_coaches_insert" ON coach_athlete_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND team_id IN (
      SELECT id FROM teams WHERE coach_id = auth.uid()
      UNION SELECT team_id FROM team_coaches WHERE user_id = auth.uid()
    )
  );

-- Athletes can reply (insert where sender_id = auth.uid and they are the recipient or group member)
CREATE POLICY "cam_athletes_insert" ON coach_athlete_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  );

ALTER PUBLICATION supabase_realtime ADD TABLE coach_athlete_messages;

-- ── Organization extended fields ─────────────────────────────────────────────
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_tier text NOT NULL DEFAULT 'organization'
  CHECK (plan_tier IN ('organization'));

-- ── Equipment inventory ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('shell', 'oar', 'erg', 'launch', 'other')),
  condition smallint NOT NULL DEFAULT 3 CHECK (condition BETWEEN 1 AND 5),
  last_maintenance date,
  next_maintenance date,
  notes text,
  is_flagged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipment_org_select" ON equipment FOR SELECT
  USING (
    org_id IN (
      SELECT id FROM organizations WHERE created_by = auth.uid()
      UNION SELECT organization_id FROM organization_admins WHERE user_id = auth.uid()
    )
    OR org_id IN (
      SELECT ot.organization_id FROM organization_teams ot
      WHERE ot.team_id IN (
        SELECT id FROM teams WHERE coach_id = auth.uid()
        UNION SELECT team_id FROM team_coaches WHERE user_id = auth.uid()
        UNION SELECT team_id FROM team_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "equipment_org_insert" ON equipment FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT id FROM organizations WHERE created_by = auth.uid()
      UNION SELECT organization_id FROM organization_admins WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "equipment_org_update" ON equipment FOR UPDATE
  USING (
    org_id IN (
      SELECT id FROM organizations WHERE created_by = auth.uid()
      UNION SELECT organization_id FROM organization_admins WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "equipment_org_delete" ON equipment FOR DELETE
  USING (
    org_id IN (
      SELECT id FROM organizations WHERE created_by = auth.uid()
      UNION SELECT organization_id FROM organization_admins WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ── Membership tiers ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS membership_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric(10,2) NOT NULL,
  billing_period text NOT NULL DEFAULT 'annual' CHECK (billing_period IN ('annual', 'monthly', 'one_time')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE membership_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tiers_org_select" ON membership_tiers FOR SELECT
  USING (
    org_id IN (
      SELECT id FROM organizations WHERE created_by = auth.uid()
      UNION SELECT organization_id FROM organization_admins WHERE user_id = auth.uid()
      UNION SELECT ot.organization_id FROM organization_teams ot
        WHERE ot.team_id IN (
          SELECT team_id FROM team_members WHERE user_id = auth.uid()
          UNION SELECT id FROM teams WHERE coach_id = auth.uid()
          UNION SELECT team_id FROM team_coaches WHERE user_id = auth.uid()
        )
    )
  );

CREATE POLICY "tiers_org_insert" ON membership_tiers FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT id FROM organizations WHERE created_by = auth.uid()
      UNION SELECT organization_id FROM organization_admins WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "tiers_org_delete" ON membership_tiers FOR DELETE
  USING (
    org_id IN (
      SELECT id FROM organizations WHERE created_by = auth.uid()
      UNION SELECT organization_id FROM organization_admins WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ── Membership payments ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS membership_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tier_id uuid REFERENCES membership_tiers(id) ON DELETE SET NULL,
  amount numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'waived')),
  due_date date,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE membership_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_select" ON membership_payments FOR SELECT
  USING (
    user_id = auth.uid()
    OR org_id IN (
      SELECT id FROM organizations WHERE created_by = auth.uid()
      UNION SELECT organization_id FROM organization_admins WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "payments_insert" ON membership_payments FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT id FROM organizations WHERE created_by = auth.uid()
      UNION SELECT organization_id FROM organization_admins WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "payments_update" ON membership_payments FOR UPDATE
  USING (
    org_id IN (
      SELECT id FROM organizations WHERE created_by = auth.uid()
      UNION SELECT organization_id FROM organization_admins WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ── Volunteer hours ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS volunteer_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  hours numeric(5,2) NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE volunteer_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "volunteer_select" ON volunteer_hours FOR SELECT
  USING (
    user_id = auth.uid()
    OR org_id IN (
      SELECT id FROM organizations WHERE created_by = auth.uid()
      UNION SELECT organization_id FROM organization_admins WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "volunteer_insert" ON volunteer_hours FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT id FROM organizations WHERE created_by = auth.uid()
      UNION SELECT organization_id FROM organization_admins WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "volunteer_delete" ON volunteer_hours FOR DELETE
  USING (
    org_id IN (
      SELECT id FROM organizations WHERE created_by = auth.uid()
      UNION SELECT organization_id FROM organization_admins WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
