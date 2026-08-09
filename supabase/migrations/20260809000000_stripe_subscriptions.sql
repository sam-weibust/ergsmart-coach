-- Stripe billing: subscription state mirrored from Stripe webhooks.
--
-- profiles.stripe_customer_id already exists (20260527000000). This adds the
-- subscription row itself plus the tier column the app reads for gating.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'free';

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id                 uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  stripe_customer_id      text NOT NULL,
  stripe_subscription_id  text NOT NULL UNIQUE,
  plan_id                 text NOT NULL,          -- pro | elite | team_pro | elite_team | org
  tier                    text NOT NULL,          -- pro | elite | free
  team_size               text,                   -- 30 | 75 | 150 | unlimited (team plans)
  status                  text NOT NULL,          -- active | trialing | past_due | canceled | …
  current_period_end      timestamptz,
  cancel_at_period_end    boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx  ON public.subscriptions (user_id);
CREATE INDEX IF NOT EXISTS subscriptions_team_id_idx  ON public.subscriptions (team_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx   ON public.subscriptions (status);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Read-only for the owner. Every write goes through the webhook, which runs on
-- the service role key and bypasses RLS — the client must never be able to
-- grant itself a tier.
DROP POLICY IF EXISTS "subscriptions_select_own" ON public.subscriptions;
CREATE POLICY "subscriptions_select_own"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Athletes on a team whose coach pays inherit the team tier; let them see that
-- the team subscription exists so the UI can explain why they have Pro.
DROP POLICY IF EXISTS "subscriptions_select_team" ON public.subscriptions;
CREATE POLICY "subscriptions_select_team"
  ON public.subscriptions FOR SELECT
  USING (
    team_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = subscriptions.team_id
        AND tm.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.touch_subscriptions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscriptions_touch_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_touch_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_subscriptions_updated_at();
