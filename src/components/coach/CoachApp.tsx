import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/getUser";
import { useTeamBranding } from "@/context/TeamBrandingContext";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/PullToRefresh";
import CoachTodayView from "@/components/dashboard/team-optimization/CoachTodayView";
import CoachMoreGrid from "./CoachMoreGrid";
import CoachProfile from "./CoachProfile";
import TeamOptimizationDashboard from "@/components/dashboard/team-optimization/TeamOptimizationDashboard";
import { AppStoreBanner } from "@/components/AppStoreBanner";
import { Home, Grid3X3, User } from "lucide-react";
import { format } from "date-fns";
import crewsyncLogo from "@/assets/crewsync-logo-icon.jpg";
import { Loader2 } from "lucide-react";

type CoachTab = "today" | "more" | "profile";

interface Props {
  profile: any;
}

const CoachApp = ({ profile }: Props) => {
  const [activeTab, setActiveTab] = useState<CoachTab>("today");
  const [moreSection, setMoreSection] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { logoUrl, primaryColor, teamName } = useTeamBranding();

  const today = format(new Date(), "EEEE, MMMM d");

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, [queryClient]);

  const { containerRef, pulling, refreshing, progress, threshold } = usePullToRefresh(handleRefresh);

  // Load the coach's primary team
  const { data: coachTeam, isLoading: teamLoading } = useQuery({
    queryKey: ["coach-primary-team", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;
      // First check teams where user is coach_id
      const { data: ownedTeams } = await supabase
        .from("teams")
        .select(`
          *,
          team_members(
            id,
            user_id,
            profile:profiles(id, full_name, email, username, role, is_coxswain, best_2k_seconds, best_2k_date, best_6k_seconds, best_6k_date, years_rowing, cox_years_coxing)
          )
        `)
        .eq("coach_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (ownedTeams && ownedTeams.length > 0) return ownedTeams[0];

      // Fallback: check team_coaches table
      const { data: coachRoles } = await supabase
        .from("team_coaches" as any)
        .select("team_id")
        .eq("user_id", profile.id)
        .limit(1);

      if (!coachRoles || coachRoles.length === 0) return null;

      const { data: team } = await supabase
        .from("teams")
        .select(`
          *,
          team_members(
            id,
            user_id,
            profile:profiles(id, full_name, email, username, role, is_coxswain, best_2k_seconds, best_2k_date, best_6k_seconds, best_6k_date, years_rowing, cox_years_coxing)
          )
        `)
        .eq("id", (coachRoles[0] as any).team_id)
        .maybeSingle();

      return team;
    },
    enabled: !!profile?.id,
  });

  const { data: boats = [] } = useQuery({
    queryKey: ["team-boats", coachTeam?.id],
    queryFn: async () => {
      if (!coachTeam?.id) return [];
      const { data } = await supabase
        .from("team_boats")
        .select("*")
        .eq("team_id", coachTeam.id)
        .order("created_at", { ascending: true });
      return data || [];
    },
    enabled: !!coachTeam?.id,
  });

  const teamMembers = coachTeam?.team_members || [];

  const handleNavigateFromToday = (section: string) => {
    setMoreSection(section);
    setActiveTab("more");
  };

  const handleNavigateFromMore = (section: string) => {
    setMoreSection(section);
  };

  const handleMoreTabClick = () => {
    setMoreSection(null);
    setActiveTab("more");
  };

  const NAV_TABS = [
    { id: "today" as CoachTab, label: "Today", icon: Home },
    { id: "more" as CoachTab, label: "More", icon: Grid3X3 },
    { id: "profile" as CoachTab, label: "Profile", icon: User },
  ];

  const renderContent = () => {
    if (activeTab === "profile") {
      return (
        <CoachProfile
          onNavigateToSettings={() => {
            setMoreSection("settings");
            setActiveTab("more");
          }}
        />
      );
    }

    if (activeTab === "more") {
      if (moreSection && coachTeam) {
        // Render the full TeamOptimizationDashboard at the requested section
        return (
          <TeamOptimizationDashboard
            teamId={coachTeam.id}
            teamName={coachTeam.name}
            teamMembers={teamMembers}
            isCoach={true}
            profile={profile}
            initialSection={moreSection}
          />
        );
      }
      return <CoachMoreGrid onNavigate={handleNavigateFromMore} />;
    }

    // Today tab
    if (teamLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (!coachTeam) {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-4 text-center px-6">
          <p className="text-muted-foreground text-sm">You don't have a team yet.</p>
          <p className="text-xs text-muted-foreground">
            Go to <strong>More → Team Settings</strong> to create your team.
          </p>
        </div>
      );
    }

    return (
      <CoachTodayView
        teamId={coachTeam.id}
        teamName={coachTeam.name}
        teamMembers={teamMembers}
        profile={profile}
        boats={boats}
        seasonId={null}
        onNavigate={handleNavigateFromToday}
      />
    );
  };

  const displayTeamName = teamName || coachTeam?.name || "CrewSync";

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <AppStoreBanner />

      {/* Header */}
      <header
        className="border-b border-white/10 z-20 shadow-sm shrink-0"
        style={{ background: primaryColor }}
      >
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={logoUrl || crewsyncLogo}
              alt={displayTeamName}
              className="h-9 w-9 rounded-xl object-cover shrink-0 border border-white/20 bg-white/10"
            />
            <span className="font-bold text-base text-white truncate">{displayTeamName}</span>
          </div>
          {activeTab === "today" && (
            <span className="text-white/70 text-xs shrink-0">{today}</span>
          )}
        </div>
      </header>

      {/* Content area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto relative"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="h-[3px] w-full shrink-0" style={{ background: primaryColor }} />
        <PullToRefreshIndicator progress={progress} refreshing={refreshing} threshold={threshold} />
        <main
          className="container mx-auto px-4 py-4"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 5rem)",
            transform:
              pulling || refreshing
                ? `translateY(${Math.min(progress, threshold)}px)`
                : undefined,
            transition: refreshing ? "transform 0.2s" : undefined,
          }}
        >
          {renderContent()}
        </main>
      </div>

      {/* Bottom nav */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-lg"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex justify-around items-center h-16 px-1">
          {NAV_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.id === "more") {
                    handleMoreTabClick();
                  } else {
                    setActiveTab(tab.id);
                  }
                }}
                className="flex flex-col items-center justify-center gap-1 flex-1 min-h-[44px] relative transition-colors"
              >
                <Icon
                  className="h-5 w-5"
                  style={{ color: isActive ? primaryColor : undefined }}
                />
                <span
                  className="text-[11px] font-medium"
                  style={isActive ? { color: primaryColor } : { color: "var(--muted-foreground)" }}
                >
                  {tab.label}
                </span>
                {isActive && (
                  <div
                    className="absolute bottom-0 w-8 h-[2px] rounded-t-full"
                    style={{ background: primaryColor }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CoachApp;
