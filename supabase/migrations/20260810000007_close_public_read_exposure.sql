-- Fix: close the unauthenticated read exposure on ten tables.
--
-- Every table below shipped with a PERMISSIVE `FOR SELECT USING (true)` policy
-- granted to role `public`, so the anon key alone — no login, no session — dumps
-- the whole table. Verified live against production with only the publishable
-- anon key:
--   whoop_strain            44 rows of biometric data (HR, strain, kilojoules)
--   erg_scores             184 rows across EVERY team, verified or not
--   team_board_posts       private team message board, all teams
--   onwater_results        all teams' practice/race results
-- and, currently empty but equally open: athlete_academics (GPA, SAT/ACT,
-- class rank — minors' data), weekly_load_logs, team_recruitment_targets,
-- whoop_sleep, whoop_recovery, whoop_workouts.
--
-- Several of the policies were named "Team members can view <table>" but their
-- predicate was literally `true`, so the name hid the hole rather than
-- describing it. Each is dropped by its exact shipped name and replaced.
--
-- ── TWO DELIBERATE PUBLIC CARVE-OUTS ─────────────────────────────────────────
-- Two shipped, unauthenticated routes legitimately read two of these tables. A
-- blanket `TO authenticated` lockdown would 0-row both of them, so those two
-- policies stay reachable by anon — but ONLY for the specific opted-in rows the
-- public page actually renders.
--
--   1. erg_scores — /leaderboard is a public route (see PUBLIC_PREFIXES in
--      src/App.tsx) and src/pages/LeaderboardPage.tsx queries erg_scores from a
--      logged-out browser. Every public query there filters
--      `.eq("is_verified", true).eq("to_leaderboard", true)` (the global
--      distance board at line 497 and the Teams tab at line 389), so the anon
--      carve-out is exactly `is_verified AND to_leaderboard` — the rows the
--      athlete themselves flagged for the public board. The signed-in "Your
--      Ranking" own-best query at line 188 filters user_id + is_verified WITHOUT
--      to_leaderboard, so it is covered by the `user_id = auth.uid()` branch,
--      not the public branch. The rank-count query at line 205 uses both flags
--      and rides the public branch.
--
--   2. athlete_academics — /recruit/:slug is a public route and
--      src/pages/RecruitingPortalPage.tsx reads academics at line 77 for the
--      athletes it just resolved at lines 58-66 via athlete_profiles
--      `show_on_team_portal = true AND is_recruiting = true`. The carve-out
--      mirrors that exact opt-in gate — an athlete's GPA/class rank is public
--      only while they are actively advertising themselves to recruiters.
--
-- Note on the EXISTS subqueries below: expressions inside an RLS policy are
-- evaluated as the querying role, so athlete_profiles' and team_members' own
-- RLS still applies inside them. That is intentional and load-bearing here —
-- for anon, athlete_profiles is already limited to `is_public = true`, which is
-- the same set RecruitingPortalPage can see, so the carve-out cannot leak an
-- athlete the portal would not have listed anyway. For a coach, team_members is
-- already limited to `is_team_coach(auth.uid(), team_id)` rows, which is exactly
-- the membership the coach branch needs. Both helpers below
-- (is_team_member / is_team_coach) are pre-existing SECURITY DEFINER functions
-- and are reused, not redefined, so none of this recurses.
--
-- Known intentional narrowing (correct, but a visible behaviour change):
--   * Coach recruiting surfaces (RecruitDiscoverFeed, RecommendedAthletes,
--     FollowedAthletes, RecruitingBoard) read erg_scores for off-team athletes
--     with no is_verified filter; they now see only those athletes'
--     leaderboard-published scores. That is the intended privacy boundary.
--   * The public /athlete/:username page falls back to profiles' stored bests
--     for any score it can no longer read.
--   * PerformanceSection's onwater_results query had no team filter at all; it
--     is now scoped to the viewer's own teams.
--
-- Scope: SELECT only. The equally-loose `auth.uid() IS NOT NULL` write policies
-- on erg_scores / onwater_results / team_recruitment_targets are a separate
-- cross-team write hole and are NOT addressed here.

-- ── erg_scores ──────────────────────────────────────────────────────────────
-- PUBLIC CARVE-OUT: stays available to anon, but only for rows the athlete
-- published to the global leaderboard.
DROP POLICY IF EXISTS "Team members can view erg_scores" ON erg_scores;

CREATE POLICY "erg_scores_select_public_or_team" ON erg_scores
  FOR SELECT USING (
    (is_verified = true AND to_leaderboard = true)
    OR user_id = auth.uid()
    OR is_team_member(auth.uid(), team_id)
    OR is_team_coach(auth.uid(), team_id)
  );

-- ── athlete_academics ───────────────────────────────────────────────────────
-- PUBLIC CARVE-OUT: stays available to anon, but only for athletes who ticked
-- both recruiting-portal opt-ins.
DROP POLICY IF EXISTS "Public read academics" ON athlete_academics;

CREATE POLICY "athlete_academics_select_optin_or_coach" ON athlete_academics
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.athlete_profiles ap
      WHERE ap.user_id = athlete_academics.user_id
        AND ap.show_on_team_portal = true
        AND ap.is_recruiting = true
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.user_id = athlete_academics.user_id
        AND is_team_coach(auth.uid(), tm.team_id)
    )
  );

-- ── whoop_strain ────────────────────────────────────────────────────────────
-- Owner only. No coach-visibility path exists for WHOOP biometrics anywhere in
-- the app — every client read is `.eq("user_id", user.id)` (WhoopSection,
-- RecoveryDashboard, DashboardHome, MeTab) and the sync/analysis edge functions
-- use the service role, which bypasses RLS. Nothing invented here.
DROP POLICY IF EXISTS "Public read whoop strain" ON whoop_strain;

CREATE POLICY "whoop_strain_select_own" ON whoop_strain
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── whoop_sleep ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public read whoop sleep" ON whoop_sleep;

CREATE POLICY "whoop_sleep_select_own" ON whoop_sleep
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── whoop_recovery ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public read whoop recovery" ON whoop_recovery;

CREATE POLICY "whoop_recovery_select_own" ON whoop_recovery
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── whoop_workouts ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public read whoop workouts" ON whoop_workouts;

CREATE POLICY "whoop_workouts_select_own" ON whoop_workouts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── weekly_load_logs ────────────────────────────────────────────────────────
-- Owner, plus coach of the row's team. The coach path is already established,
-- not invented: LoadManagement.tsx builds the coach load heatmap with
-- `.from("weekly_load_logs").eq("team_id", teamId)` and the table carries a
-- team_id column for exactly that. Team-mates are deliberately NOT included —
-- fatigue and soreness scores are wellness data.
DROP POLICY IF EXISTS "Team members can view weekly_load_logs" ON weekly_load_logs;

CREATE POLICY "weekly_load_logs_select_own_or_coach" ON weekly_load_logs
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR is_team_coach(auth.uid(), team_id)
  );

-- ── team_board_posts ────────────────────────────────────────────────────────
-- Private team message board: members and coaches of that team only.
DROP POLICY IF EXISTS "Team members can view team_board_posts" ON team_board_posts;

CREATE POLICY "team_board_posts_select_team" ON team_board_posts
  FOR SELECT TO authenticated USING (
    is_team_member(auth.uid(), team_id) OR is_team_coach(auth.uid(), team_id)
  );

-- ── onwater_results ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Team members can view onwater_results" ON onwater_results;

CREATE POLICY "onwater_results_select_team" ON onwater_results
  FOR SELECT TO authenticated USING (
    is_team_member(auth.uid(), team_id) OR is_team_coach(auth.uid(), team_id)
  );

-- ── team_recruitment_targets ────────────────────────────────────────────────
-- Coaching-staff strategy (which seats/sides/grad years the program is hunting
-- for). Coaches only — athletes on the team should not see it either.
DROP POLICY IF EXISTS "Team members can view recruitment_targets" ON team_recruitment_targets;

CREATE POLICY "team_recruitment_targets_select_coach" ON team_recruitment_targets
  FOR SELECT TO authenticated USING (
    is_team_coach(auth.uid(), team_id)
  );
