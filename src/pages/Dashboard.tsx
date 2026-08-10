import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LogOut, Sparkles, Users, User, Zap, Trophy, Settings, LayoutGrid, X } from "lucide-react";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/PullToRefresh";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import crewsyncLogo from "@/assets/crewsync-logo-icon.jpg";
import { getSessionUser } from '@/lib/getUser';
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getLocalDate } from "@/lib/dateUtils";
import { AppStoreBanner } from "@/components/AppStoreBanner";
import { TourProvider } from "@/components/tour/TourContext";
import { TourOverlay } from "@/components/tour/TourOverlay";
import { WelcomeModal } from "@/components/tour/WelcomeModal";
import { useTeamBranding } from "@/context/TeamBrandingContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import crewsyncLogoFull from "@/assets/crewsync-logo-full.jpg";
import TeamTab from "@/components/dashboard/tabs/TeamTab";
import MeTab from "@/components/dashboard/tabs/MeTab";
import PerformanceTab from "@/components/dashboard/tabs/PerformanceTab";
import CompetitionTab from "@/components/dashboard/tabs/CompetitionTab";
import MoreTab from "@/components/dashboard/tabs/MoreTab";
import SettingsTab from "@/components/dashboard/tabs/SettingsTab";
import type { AthleteTabProps } from "@/components/dashboard/tabs/types";

// ─── ATHLETE 5-TAB SHELL CONSTANTS ───────────────────────────────────────────

type AthleteTabId = "team" | "me" | "performance" | "competition" | "more" | "settings";

const ONBOARDING_COMPLETE_KEY = "onboarding_complete";

/** Team abbreviation: first letter of each word, up to 4 chars, uppercase. */
const teamAbbrev = (name: string | null): string => {
  if (!name) return "Team";
  const letters = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .slice(0, 4)
    .toUpperCase();
  return letters || "Team";
};

/**
 * ─── LEGACY NAV → 5-TAB MAP ──────────────────────────────────────────────────
 *
 * The old sidebar/section navigation (NAV_CONFIG, SectionLanding, BillingTab,
 * hiddenForRole and renderContent) has been deleted: renderContent() was never
 * called — the shell renders renderActiveTab() only — so every section it
 * routed to was unreachable dead code.
 *
 * A few callers still speak the old vocabulary (the product tour's
 * `navTo: { section }` steps, and the `navigate_to_live_erg` event). This map
 * translates those legacy section ids onto the five real tabs so they keep
 * working.
 */
const SECTION_TO_TAB: Record<string, AthleteTabId> = {
  dashboard: "me",
  training: "performance",
  performance: "performance",
  calculators: "performance",
  live: "performance",
  plan: "performance",
  teams: "team",
  friends: "team",
  community: "team",
  "coaches-hub": "team",
  organization: "team",
  recruiting: "more",
  regattas: "more",
  competition: "competition",
  settings: "settings",
  "admin-costs": "settings",
};

// ─── ROLE CONSTANTS & VISIBILITY ─────────────────────────────────────────────

const ROLES = [
  { value: "rower",     label: "Athlete",   description: "I train and compete",           icon: "🚣" },
  { value: "coxswain",  label: "Coxswain",  description: "I steer and call",              icon: "🎙️" },
  { value: "coach",     label: "Coach",     description: "I coach a team",                icon: "📋" },
  { value: "organizer", label: "Organizer", description: "I manage regattas and clubs",   icon: "🏆" },
] as const;

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────

const Dashboard = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { logoUrl: teamLogo, primaryColor: teamColor, teamName, teamId: branding_teamId } = useTeamBranding();
  const [loading, setLoading] = useState(true);
  // ── New athlete/coxswain 5-tab shell state ────────────────────────────────
  const [activeTab, setActiveTab] = useState<AthleteTabId>("team");
  const [tabInitialized, setTabInitialized] = useState(false);
  const [showJoinOnboarding, setShowJoinOnboarding] = useState(false);
  const [onboardingJoinCode, setOnboardingJoinCode] = useState("");
  const [onboardingJoinError, setOnboardingJoinError] = useState<string | null>(null);
  const [onboardingJoining, setOnboardingJoining] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [onboardingProfile, setOnboardingProfile] = useState<{
    full_name: string | null;
    experience_level: string | null;
    goals: string | null;
  } | null>(null);

  /**
   * Legacy section navigation, mapped onto the 5-tab shell.
   *
   * Kept because TourProvider steps and the `navigate_to_live_erg` event still
   * address the app by old section id. Unknown ids fall back to the Me tab
   * rather than silently doing nothing (which is what the removed
   * renderContent() path did).
   */
  const navTo = useCallback((section: string, _sub?: string) => {
    setActiveTab(SECTION_TO_TAB[section] ?? "me");
  }, []);

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, [queryClient]);

  const { containerRef, pulling, refreshing, progress, threshold } = usePullToRefresh(handleRefresh);

  useEffect(() => {
    // Use getSession() (reads localStorage cache, no network call) so the
    // dashboard unblocks immediately on page load / navigation after login.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { navigate("/auth"); return; }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (event === "TOKEN_REFRESHED" && !session)) {
        navigate("/auth");
        queryClient.clear();
      }
      // On SIGNED_IN / INITIAL_SESSION: ensure loading is cleared and queries
      // are refetched so stale-while-revalidate data is fresh after login.
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
        setLoading(false);
        queryClient.invalidateQueries();
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, queryClient]);

  // ── First-time onboarding check ────────────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    (async () => {
      try {
        const dismissed = localStorage.getItem("onboardingDismissed");
        if (dismissed && Date.now() - parseInt(dismissed) < 24 * 60 * 60 * 1000) return;

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        const { data: p } = await supabase
          .from("profiles")
          .select("full_name, age, weight, height, experience_level, goals")
          .eq("id", session.user.id)
          .maybeSingle();

        if (!p) return;
        const incomplete = !p.full_name || !p.experience_level || !p.goals;
        if (incomplete) {
          setOnboardingProfile({ full_name: p.full_name, experience_level: p.experience_level, goals: p.goals });
          setShowOnboarding(true);
        }
      } catch {}
    })();
  }, [loading]);

  // ── Navigate-to-live-erg event (from erg assignment "Log with PM5") ────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.assignmentId) {
        sessionStorage.setItem("pending_erg_assignment", detail.assignmentId);
        sessionStorage.setItem("pending_erg_pieces", JSON.stringify(detail.pieces || []));
      }
      navTo("live", "erg");
    };
    window.addEventListener("navigate_to_live_erg", handler);
    return () => window.removeEventListener("navigate_to_live_erg", handler);
  }, []);

  // ── Midnight date-change detector ─────────────────────────────────────────
  useEffect(() => {
    let lastDate = getLocalDate();
    const id = setInterval(() => {
      const current = getLocalDate();
      if (current === lastDate) return;
      lastDate = current;
      // Invalidate all time-sensitive queries so the new day's data loads
      queryClient.invalidateQueries({ queryKey: ["recovery-score"] });
      queryClient.invalidateQueries({ queryKey: ["recovery-score-home"] });
      queryClient.invalidateQueries({ queryKey: ["today-plan-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["weekly-challenge-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["sleep-entries"] });
      queryClient.invalidateQueries({ queryKey: ["water-entries"] });
      queryClient.invalidateQueries({ queryKey: ["weight-entries"] });
      queryClient.invalidateQueries({ queryKey: ["ai-insights"] });
      queryClient.invalidateQueries({ queryKey: ["recent-workouts-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-regattas"] });
      queryClient.invalidateQueries({ queryKey: ["workout-dates-streak"] });
    }, 60_000);
    return () => clearInterval(id);
  }, [queryClient]);

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      return data;
    },
    enabled: !loading,
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const userRole: string | null = (profile as any)?.user_type ?? null;

  const isCox =
    profile != null &&
    (
      (profile as any)?.role === "coxswain" ||
      userRole === "coxswain" ||
      (profile as any)?.is_coxswain === true
    );

  // Redirect coaches to the dedicated coach experience
  useEffect(() => {
    if (!profile) return;
    const role = (profile as any)?.user_type || (profile as any)?.role;
    if (role === "coach" || role === "head_coach") {
      navigate("/teams/today", { replace: true });
    }
  }, [profile, navigate]);

  // Accept coach invite from URL token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get("accept_coach_invite");
    if (!inviteToken || !profile) return;

    // Drop the token from the URL up front, so it is gone on both the success
    // and the failure path. The old code only cleared it after a successful
    // insert, so a failing invite re-attempted on every re-render. Clearing
    // before the await also means a re-run of this effect (profile refetch,
    // StrictMode double-invoke) reads no token and bails instead of firing a
    // second, now-guaranteed-to-fail accept.
    const url = new URL(window.location.href);
    url.searchParams.delete("accept_coach_invite");
    window.history.replaceState({}, "", url.toString());

    (async () => {
      // Single SECURITY DEFINER RPC. The old flow (select invite → read
      // profiles.email → self-insert team_coaches → stamp accepted_at) could
      // never succeed: team_coaches_insert requires the caller to already be
      // head coach of the team, and the `if (!error)` guard meant the invite
      // was never marked accepted, so the link silently no-opped forever.
      // The RPC validates the token, checks the caller's email against
      // auth.users, inserts idempotently and stamps accepted_at.
      // Cast: types.ts has not been regenerated with the new RPC yet.
      const { data, error } = await (supabase as any).rpc("accept_coach_invite", {
        p_token: inviteToken,
      });

      if (error) {
        toast.error("Could not accept coach invite", { description: error.message });
        return;
      }

      // RETURNS TABLE → data is an array of { team_id, team_name }.
      const result = (data as { team_id: string; team_name: string }[] | null)?.[0];
      if (!result) {
        toast.error("Could not accept coach invite", {
          description: "Invite not found, already accepted, or expired",
        });
        return;
      }

      toast.success("Welcome to the coaching staff!", {
        description: `You now have coach access to ${result.team_name}.`,
      });
    })();
  }, [profile]);

  // Accept AD invite from URL token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const adToken = params.get("accept_ad_invite");
    if (!adToken || !profile) return;

    (async () => {
      const user = await getSessionUser();
      if (!user) return;

      const { data: invite } = await supabase
        .from("team_athletic_directors" as any)
        .select("*")
        .eq("token", adToken)
        .eq("status", "pending")
        .maybeSingle();

      if (!invite) return;

      // Update invite record to accepted
      const { error } = await supabase
        .from("team_athletic_directors" as any)
        .update({ user_id: user.id, status: "accepted", joined_at: new Date().toISOString() })
        .eq("id", (invite as any).id);

      if (!error) {
        // Ensure user has organizer role
        await supabase.from("profiles").update({ user_type: "organizer" }).eq("id", user.id);

        const url = new URL(window.location.href);
        url.searchParams.delete("accept_ad_invite");
        window.history.replaceState({}, "", url.toString());

        queryClient.invalidateQueries({ queryKey: ["profile"] });
        toast.success("Athletic Director access granted!", { description: "You now have oversight access to this team." });
      }
    })();
  }, [profile]);

  const { data: userTeams } = useQuery({
    queryKey: ["user-team-memberships"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return [];
      const { data } = await supabase.from("team_members").select("team_id").eq("user_id", user.id);
      return data || [];
    },
    enabled: !loading,
  });

  // ── Athlete 5-tab shell: team membership + onboarding ─────────────────────
  // userTeams is undefined while loading; treat membership as "unknown" then.
  const teamsLoaded = userTeams !== undefined;
  const hasTeam = teamsLoaded && Array.isArray(userTeams) && userTeams.length > 0;
  const onboardingComplete =
    (() => {
      try { return localStorage.getItem(ONBOARDING_COMPLETE_KEY) === "true"; }
      catch { return false; }
    })();

  // teamId / teamName / teamColor come from TeamBrandingContext (single source
  // of truth, populated for both coach-owned and member teams).
  const shellTeamId = branding_teamId;
  const shellTeamName = teamName ?? null;
  const shellTeamColor = teamColor;

  // Pick the default tab once team membership is known.
  useEffect(() => {
    if (tabInitialized || !teamsLoaded || !profile) return;
    if (hasTeam) {
      setActiveTab("team");
    } else if (!onboardingComplete) {
      setShowJoinOnboarding(true);
      // active tab is irrelevant while the onboarding card is shown
    } else {
      setActiveTab("performance");
    }
    setTabInitialized(true);
  }, [tabInitialized, teamsLoaded, profile, hasTeam, onboardingComplete]);

  const completeOnboarding = useCallback(() => {
    try { localStorage.setItem(ONBOARDING_COMPLETE_KEY, "true"); } catch {}
    setShowJoinOnboarding(false);
  }, []);

  // Join a team from the onboarding card (mirrors TeamsSection JoinTeamCard).
  const handleOnboardingJoin = useCallback(async () => {
    const trimmed = onboardingJoinCode.trim();
    if (!trimmed) { setOnboardingJoinError("Enter a join code"); return; }
    const uid = (profile as any)?.id;
    if (!uid) return;
    setOnboardingJoining(true);
    setOnboardingJoinError(null);
    try {
      // Single SECURITY DEFINER RPC. The old lookup+insert pair could never
      // work for a prospective member: RLS hides teams you are not on from the
      // `teams` SELECT policy, and `team_members` INSERT requires a coach.
      // The RPC raises "No team found with that code" / "You are already on
      // this team" itself, so just surface error.message.
      // Cast: types.ts has not been regenerated with the new RPC yet.
      const { data, error } = await (supabase as any).rpc("join_team_by_code", {
        p_code: trimmed,
      });
      if (error) throw new Error(error.message);
      // RETURNS TABLE → data is an array of { team_id, team_name }.
      const team = (data as { team_id: string; team_name: string }[] | null)?.[0];
      if (!team) throw new Error("No team found with that code. Check the code and try again.");
      // Success: mark onboarding complete, reload team data, switch to Team tab.
      try { localStorage.setItem(ONBOARDING_COMPLETE_KEY, "true"); } catch {}
      queryClient.invalidateQueries({ queryKey: ["teams", uid] });
      queryClient.invalidateQueries({ queryKey: ["user-team-memberships"] });
      queryClient.invalidateQueries({ queryKey: ["teams-member-only", uid] });
      queryClient.invalidateQueries({ queryKey: ["global-team-branding"] });
      setShowJoinOnboarding(false);
      setOnboardingJoinCode("");
      setActiveTab("team");
      toast.success(`Joined ${team.team_name}!`);
    } catch (e: any) {
      setOnboardingJoinError(e?.message || "Could not join team");
    } finally {
      setOnboardingJoining(false);
    }
  }, [onboardingJoinCode, profile, queryClient]);

  // Whole-shell refresh handed to tab components (mirrors pull-to-refresh).
  const handleTabRefresh = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, [queryClient]);

  const athleteTabProps: AthleteTabProps = {
    userId: (profile as any)?.id ?? "",
    profile,
    teamId: shellTeamId,
    teamName: shellTeamName,
    teamColor: shellTeamColor,
    isCoxswain: !!isCox,
    onRefresh: handleTabRefresh,
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div
              className="w-16 h-16 rounded-full border-4 animate-spin"
              style={{ borderColor: `${teamColor}30`, borderTopColor: teamColor }}
            />
            <Sparkles
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-6 w-6 animate-pulse-soft"
              style={{ color: teamColor }}
            />
          </div>
          <p className="text-muted-foreground font-medium">Loading your training...</p>
        </div>
      </div>
    );
  }

  // ── New athlete/coxswain 5-tab bar ────────────────────────────────────────
  const athleteTabs: { id: AthleteTabId; label: string; icon: React.ElementType }[] = [
    { id: "team", label: hasTeam ? teamAbbrev(shellTeamName) : "Team", icon: Users },
    { id: "me", label: "Me", icon: User },
    { id: "performance", label: "Performance", icon: Zap },
    { id: "competition", label: "Compete", icon: Trophy },
    { id: "more", label: "More", icon: LayoutGrid },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  const renderActiveTab = () => {
    switch (activeTab) {
      case "team":
        return <TeamTab {...athleteTabProps} />;
      case "me":
        return <MeTab {...athleteTabProps} />;
      case "performance":
        return <PerformanceTab {...athleteTabProps} />;
      case "competition":
        return <CompetitionTab {...athleteTabProps} />;
      case "more":
        return <MoreTab {...athleteTabProps} />;
      case "settings":
        return <SettingsTab {...athleteTabProps} />;
      default:
        return null;
    }
  };

  // ── Full-screen no-team onboarding card ───────────────────────────────────
  if (showJoinOnboarding) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="w-full max-w-sm shadow-lg">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-5">
            <img src={crewsyncLogoFull} alt="CrewSync" className="h-20 w-20 rounded-2xl shadow-sm object-cover" />
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-bold text-foreground">Welcome to CrewSync</h2>
              <p className="text-sm text-muted-foreground">
                Join your team to get started or explore the app on your own.
              </p>
            </div>
            <div className="w-full space-y-3">
              <Input
                placeholder="Enter join code"
                value={onboardingJoinCode}
                onChange={(e) => {
                  setOnboardingJoinCode(e.target.value);
                  if (onboardingJoinError) setOnboardingJoinError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && handleOnboardingJoin()}
                className="text-center text-lg font-mono tracking-widest uppercase"
                autoCapitalize="characters"
              />
              {onboardingJoinError && (
                <p className="text-xs text-destructive text-center">{onboardingJoinError}</p>
              )}
              <Button
                className="w-full"
                onClick={handleOnboardingJoin}
                disabled={onboardingJoining || !onboardingJoinCode.trim()}
              >
                <Users className="h-4 w-4 mr-2" />
                {onboardingJoining ? "Joining…" : "Enter Join Code"}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  completeOnboarding();
                  setActiveTab("performance");
                }}
              >
                Explore the App
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <TourProvider profile={profile} onNavTo={navTo}>
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <WelcomeModal />
      <TourOverlay />
      <AppStoreBanner />

      {/* ── First-time onboarding dialog ─────────────────────────────────── */}
      <Dialog open={showOnboarding}>
        <DialogContent
          className="sm:max-w-md"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Welcome to CrewSync 🚣</DialogTitle>
            <DialogDescription>
              Complete your profile so your AI coach can personalize your training plans, meal plans, and feedback.
            </DialogDescription>
          </DialogHeader>

          {/* Step 1: Role selection */}
          <div className="space-y-2">
            <p className="text-sm font-medium">I am a…</p>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((role) => (
                <button
                  key={role.value}
                  type="button"
                  onClick={() => setSelectedRole(role.value)}
                  className={cn(
                    "cursor-pointer rounded-xl border-2 p-4 text-center transition-all",
                    selectedRole === role.value
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <div className="text-2xl mb-1">{role.icon}</div>
                  <p className="text-sm font-semibold">{role.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Missing profile fields */}
          <div className="space-y-2 py-1">
            <p className="text-sm text-muted-foreground">Your profile also needs:</p>
            <ul className="text-sm space-y-1">
              {!onboardingProfile?.full_name && (
                <li className="flex items-center gap-2">
                  <X className="h-3 w-3 text-destructive" /> Name
                </li>
              )}
              {!onboardingProfile?.experience_level && (
                <li className="flex items-center gap-2">
                  <X className="h-3 w-3 text-destructive" /> Experience level
                </li>
              )}
              {!onboardingProfile?.goals && (
                <li className="flex items-center gap-2">
                  <X className="h-3 w-3 text-destructive" /> Training goals
                </li>
              )}
            </ul>
          </div>

          <Button
            className="w-full"
            disabled={!selectedRole}
            onClick={async () => {
              if (!selectedRole) return;
              try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                  await supabase.from("profiles").upsert({ id: session.user.id, user_type: selectedRole });
                }
              } catch {}
              setShowOnboarding(false);
              navTo("settings", "profile");
            }}
          >
            Set Up My Profile
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              setShowOnboarding(false);
              try { localStorage.setItem("onboardingDismissed", Date.now().toString()); } catch {}
            }}
          >
            Remind me later
          </Button>
        </DialogContent>
      </Dialog>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header
        className="border-b border-white/10 z-20 shadow-sm shrink-0"
        style={{ background: teamColor, paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img
              src={teamLogo || crewsyncLogo}
              alt={teamName || "CrewSync"}
              className="h-10 w-10 rounded-xl shadow-sm border border-white/20 hover:scale-105 transition-transform cursor-pointer object-cover bg-white/10"
              onClick={() => navTo("dashboard")}
            />
            <span className="font-bold text-lg hidden sm:inline text-white">
              {teamName || "CrewSync"}
            </span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <NotificationBell />
            <Button
              onClick={handleLogout}
              variant="ghost"
              size="sm"
              className="gap-2 text-white/80 hover:text-white hover:bg-white/10"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Below Header: Sidebar + Content ────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Content Area ────────────────────────────────────────────────── */}
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto relative"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {/* Team color accent bar */}
          <div className="h-[3px] w-full shrink-0" style={{ background: teamColor }} />
          <PullToRefreshIndicator progress={progress} refreshing={refreshing} threshold={threshold} />
          <main
            className="container mx-auto px-4 py-6 md:pb-8 animate-fade-in"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 5rem)",
              transform:
                pulling || refreshing
                  ? `translateY(${Math.min(progress, threshold)}px)`
                  : undefined,
              transition: refreshing ? "transform 0.2s" : undefined,
            }}
          >
            {/* New 5-tab athlete/coxswain layout — renders on all breakpoints. */}
            <div className="max-w-2xl mx-auto w-full">{renderActiveTab()}</div>
          </main>
        </div>
      </div>

      {/* ── Bottom Nav — athlete/coxswain 5-tab bar (all breakpoints) ───────── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-lg"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex justify-around items-center h-16 px-0.5 max-w-2xl mx-auto">
          {athleteTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                data-tour-id={`tour-tab-${tab.id}`}
                className="relative flex flex-col items-center justify-center gap-1 flex-1 min-w-0 min-h-[44px] transition-colors"
                style={{ color: isActive ? teamColor : undefined }}
              >
                <tab.icon
                  className={`h-5 w-5 ${isActive ? "" : "text-muted-foreground"}`}
                  style={isActive ? { color: teamColor } : undefined}
                />
                <span
                  className={`text-[10px] leading-none max-w-full truncate px-0.5 font-medium ${isActive ? "font-semibold" : "text-muted-foreground"}`}
                  style={isActive ? { color: teamColor } : undefined}
                >
                  {tab.label}
                </span>
                {isActive && (
                  <div className="absolute bottom-0 w-8 h-[2px] rounded-t-full" style={{ background: teamColor }} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
    </TourProvider>
  );
};

export default Dashboard;
