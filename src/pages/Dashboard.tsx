import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import {
  LogOut,
  Sparkles,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Dumbbell,
  BarChart3,
  Users,
  GraduationCap,
  Trophy,
  Gauge,
  MessagesSquare,
  Settings,
  Calendar,
  History,
  Activity,
  Utensils,
  Weight,
  Moon,
  BookOpen,
  TrendingUp,
  Star,
  Zap,
  Target,
  Video,
  Ship,
  ArrowLeftRight,
  MessageCircle,
  Medal,
  GitCompare,
  Link2,
  User,
  Bell,
  MessageSquare,
  Bluetooth,
  Globe,
  School,
  Award,
  Users2,
  Radio,
  HeartPulse,
  Wifi,
  MessageCircleMore,
  UserPlus,
  Share2,
  Calculator,
  Swords,
  Kanban,
  Heart,
  Search,
  Mail,
} from "lucide-react";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/PullToRefresh";
import { WorkoutPlanSection } from "@/components/dashboard/WorkoutPlanSection";
import { ProfileSection } from "@/components/dashboard/ProfileSection";
import FriendsSection from "@/components/dashboard/FriendsSection";
import DeviceSection from "@/components/dashboard/DeviceSection";
import HistorySection from "@/components/dashboard/HistorySection";
import TeamsSection from "@/components/dashboard/TeamsSection";
import ErgWorkoutSection from "@/components/dashboard/ErgWorkoutSection";
import MultiSetStrengthForm from "@/components/dashboard/MultiSetStrengthForm";
import PerformanceSection from "@/components/dashboard/PerformanceSection";
import ComparisonSection from "@/components/dashboard/ComparisonSection";
import AwardsSection from "@/components/dashboard/AwardsSection";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import crewsyncLogo from "@/assets/crewsync-logo-icon.jpg";
import MealPlanTab from "@/components/dashboard/MealPlanTab";
import AskSection from "@/components/dashboard/AskSection";
import CritiqueSection from "@/components/dashboard/CritiqueSection";
import TodaysWorkouts from "@/components/dashboard/TodaysWorkouts";
import RecruitmentSection from "@/components/dashboard/RecruitmentSection";
import ForumSection from "@/components/dashboard/forum/ForumSection";
import { LeaderboardSection } from "@/components/dashboard/LeaderboardSection";
import { ErgPredictor } from "@/components/dashboard/ErgPredictor";
import { SplitCalculator } from "@/components/dashboard/SplitCalculator";
import RecoverySection from "@/components/dashboard/RecoverySection";
import MultiPieceSession from "@/components/dashboard/MultiPieceSession";
import LiveErgView from "@/components/dashboard/LiveErgView";
import RaceSection from "@/components/dashboard/RaceSection";
import { PublicProfileSection } from "@/components/dashboard/PublicProfileSection";
import { RecruitingProfileSection } from "@/components/dashboard/RecruitingProfileSection";
import { CollegeTargetsSection } from "@/components/dashboard/CollegeTargetsSection";
import { CoachDirectorySection } from "@/components/dashboard/CoachDirectorySection";
import CombineSection from "@/components/dashboard/CombineSection";
import WeeklyChallengeSection from "@/components/dashboard/WeeklyChallengeSection";
import AthleteComparisonSection from "@/components/dashboard/AthleteComparisonSection";
import AlumniNetworkSection from "@/components/dashboard/AlumniNetworkSection";
import WeeklyChallengeWidget from "@/components/dashboard/WeeklyChallengeWidget";
import { StreakWidget } from "@/components/dashboard/StreakWidget";
import { ReferralSection } from "@/components/dashboard/ReferralSection";
import DirectorySection from "@/components/dashboard/DirectorySection";
import Concept2Section from "@/components/dashboard/Concept2Section";
import { CoachesHub } from "@/components/dashboard/coaches-hub/CoachesHub";
import { RegattasSection } from "@/components/dashboard/regattas/RegattasSection";

// ─── NAV CONFIG ──────────────────────────────────────────────────────────────

interface SubSection {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  coachOnly?: boolean;
}

interface NavSection {
  id: string;
  label: string;
  icon: React.ElementType;
  subs: SubSection[];
  coachOnly?: boolean;
}

const NAV_CONFIG: NavSection[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    subs: [],
  },
  {
    id: "training",
    label: "Training",
    icon: Dumbbell,
    subs: [
      { id: "plan", label: "Plan", description: "View and manage your training plan", icon: Calendar },
      { id: "history", label: "History", description: "Review your past workouts", icon: History },
      { id: "erg", label: "Erg Workout", description: "Log an erg session", icon: Activity },
      { id: "strength", label: "Strength", description: "Log strength training sets", icon: Weight },
      { id: "nutrition", label: "Nutrition", description: "Track meals and macros", icon: Utensils },
      { id: "recovery", label: "Recovery", description: "Track recovery metrics", icon: Moon },
      { id: "schedule", label: "Schedule", description: "Today's scheduled workouts", icon: Calendar },
      { id: "library", label: "Library", description: "Browse workout templates", icon: BookOpen },
    ],
  },
  {
    id: "performance",
    label: "Performance",
    icon: BarChart3,
    subs: [
      { id: "analytics", label: "Analytics", description: "Deep-dive performance analytics", icon: BarChart3 },
      { id: "trends", label: "Trends", description: "Compare and track trends over time", icon: TrendingUp },
      { id: "predictions", label: "Predictions", description: "Predict race times and splits", icon: Zap },
      { id: "pacing", label: "Pacing", description: "Calculate and plan splits", icon: Calculator },
      { id: "technique", label: "Technique", description: "Video critique and analysis", icon: Video },
    ],
  },
  {
    id: "teams",
    label: "Teams",
    icon: Users,
    subs: [
      { id: "messages", label: "Messages", description: "Team message board", icon: MessageCircle },
      { id: "lineups", label: "Lineups", description: "View boat lineups", icon: Ship },
      { id: "roster", label: "Roster", description: "View and manage team roster", icon: Users, coachOnly: true },
      { id: "seat-racing", label: "Seat Racing", description: "Analyze seat racing results", icon: ArrowLeftRight, coachOnly: true },
      { id: "race-optimizer", label: "Race Optimizer", description: "Optimize race lineups", icon: Target, coachOnly: true },
      { id: "leaderboard", label: "Leaderboard", description: "Team erg leaderboard", icon: Medal, coachOnly: true },
      { id: "comparison", label: "Athlete Compare", description: "Compare athletes side by side", icon: GitCompare, coachOnly: true },
      { id: "plan-gen", label: "Plan Generator", description: "Generate team training plans", icon: Calendar, coachOnly: true },
      { id: "load-mgmt", label: "Load Management", description: "Manage athlete training loads", icon: Activity, coachOnly: true },
      { id: "recruiting-gaps", label: "Recruiting Gaps", description: "Identify recruiting needs", icon: GraduationCap, coachOnly: true },
    ],
  },
  {
    id: "coaches-hub",
    label: "Coaches Hub",
    icon: Kanban,
    coachOnly: true,
    subs: [
      { id: "discover", label: "Discover", description: "Find and score recruiting prospects", icon: Search },
      { id: "board", label: "Recruiting Board", description: "Kanban board to track recruits", icon: Kanban },
      { id: "following", label: "Following", description: "Athletes you are following", icon: Heart },
      { id: "recommended", label: "Recommended", description: "AI-powered roster gap recommendations", icon: Sparkles },
      { id: "contacts", label: "Contact History", description: "Log of outreach to recruits", icon: Mail },
      { id: "program", label: "My Program", description: "Your program profile and recruiting targets", icon: School },
    ],
  },
  {
    id: "recruiting",
    label: "Recruiting",
    icon: GraduationCap,
    subs: [
      { id: "my-profile", label: "My Profile", description: "View your public athlete profile", icon: User },
      { id: "public-profile", label: "Public Profile", description: "Edit your public-facing profile", icon: Globe },
      { id: "recruiting-profile", label: "Recruiting Profile", description: "Manage your recruiting information", icon: Target },
      { id: "college-targets", label: "College Targets", description: "Track target schools and coaches", icon: School },
      { id: "coach-directory", label: "Coach Directory", description: "Find and contact college coaches", icon: Users2 },
      { id: "combine", label: "Virtual Combine", description: "Participate in virtual combines", icon: Award },
      { id: "alumni", label: "Alumni Network", description: "Connect with alumni athletes", icon: GraduationCap },
    ],
  },
  {
    id: "regattas",
    label: "Regattas",
    icon: Trophy,
    subs: [
      { id: "search", label: "Search", description: "Find regattas and view results", icon: Search },
      { id: "upcoming", label: "Upcoming", description: "Upcoming regattas in the next 90 days", icon: Calendar },
      { id: "my", label: "My Regattas", description: "Your claimed results and racing history", icon: Trophy },
      { id: "clubs", label: "Clubs", description: "Find rowing clubs", icon: Users },
      { id: "team", label: "Team Regattas", description: "Your team's regatta results", icon: Users2, coachOnly: true },
    ],
  },
  {
    id: "competition",
    label: "Competition",
    icon: Medal,
    subs: [
      { id: "leaderboard", label: "Leaderboard", description: "Global erg rankings", icon: Medal },
      { id: "h2h", label: "Head-to-Head", description: "Race against other athletes", icon: Swords },
      { id: "challenges", label: "Challenges", description: "Weekly community challenges", icon: Zap },
      { id: "achievements", label: "Achievements", description: "View your awards and badges", icon: Trophy },
      { id: "rankings", label: "Rankings", description: "Official event rankings", icon: Star },
    ],
  },
  {
    id: "live",
    label: "Live",
    icon: Gauge,
    subs: [
      { id: "erg", label: "Live Erg", description: "Real-time erg session monitor", icon: Gauge },
      { id: "hr", label: "Heart Rate", description: "Live heart rate monitoring", icon: HeartPulse },
      { id: "devices", label: "Devices", description: "Connect and manage BLE devices", icon: Bluetooth },
    ],
  },
  {
    id: "community",
    label: "Community",
    icon: MessagesSquare,
    subs: [
      { id: "forum", label: "Forum", description: "Community discussion boards", icon: MessageCircleMore },
      { id: "directory", label: "Directory", description: "Find clubs and programs", icon: Globe },
      { id: "friends", label: "Friends", description: "Connect with other athletes", icon: UserPlus },
      { id: "referrals", label: "Referrals", description: "Invite friends to CrewSync", icon: Share2 },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    subs: [
      { id: "profile", label: "Profile", description: "Edit your account and profile", icon: User },
      { id: "notifications", label: "Notifications", description: "Manage notification preferences", icon: Bell },
      { id: "ask-ai", label: "Ask AI Coach", description: "Chat with your AI coach", icon: MessageSquare },
      { id: "concept2", label: "Concept2", description: "Concept2 logbook integration", icon: Link2 },
    ],
  },
];

// ─── DASHBOARD OVERVIEW ───────────────────────────────────────────────────────

function DashboardOverview({ navTo }: { navTo: (s: string, sub?: string) => void }) {
  const quickActions = [
    { label: "Log Erg", section: "training", sub: "erg", icon: Activity },
    { label: "View Plan", section: "training", sub: "plan", icon: Calendar },
    { label: "Analytics", section: "performance", sub: "analytics", icon: BarChart3 },
    { label: "Live Erg", section: "live", sub: "erg", icon: Gauge },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StreakWidget />
        <WeeklyChallengeWidget onNavigate={(tab) => {
          if (tab === "challenges") navTo("competition", "challenges");
        }} />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.sub}
              onClick={() => navTo(action.section, action.sub)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-card hover:bg-primary/5 hover:border-primary/30 transition-all text-sm font-medium text-foreground"
            >
              <action.icon className="h-5 w-5 text-primary" />
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── SECTION LANDING PAGE ─────────────────────────────────────────────────────

function SectionLanding({
  section,
  navTo,
  isCoach,
}: {
  section: NavSection;
  navTo: (s: string, sub?: string) => void;
  isCoach: boolean;
}) {
  const visibleSubs = section.subs.filter((s) => !s.coachOnly || isCoach);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{section.label}</h1>
        <p className="text-muted-foreground mt-1">Select a section to get started</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {visibleSubs.map((sub) => (
          <button
            key={sub.id}
            onClick={() => navTo(section.id, sub.id)}
            className="flex items-start gap-4 p-4 rounded-xl border border-border bg-card hover:bg-primary/5 hover:border-primary/30 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
              <sub.icon className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground text-sm">{sub.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{sub.description}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────

const Dashboard = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState("dashboard");
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const navTo = (s: string, sub?: string) => {
    setActiveSection(s);
    setActiveSub(sub ?? null);
    setMoreOpen(false);
  };

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, [queryClient]);

  const { containerRef, pulling, refreshing, progress, threshold } = usePullToRefresh(handleRefresh);

  useEffect(() => {
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (event === "TOKEN_REFRESHED" && !session)) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const checkUser = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) { navigate("/auth"); return; }
      setLoading(false);
    } catch (error) {
      console.error("Auth error:", error);
      navigate("/auth");
    }
  };

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
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

  const { data: coachTeams } = useQuery({
    queryKey: ["coach-teams"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase.from("teams").select("id").eq("coach_id", user.id);
      return data || [];
    },
    enabled: !loading,
  });

  // Coach = user_type is "coach" OR they have created a team
  // Only evaluate after both queries have settled (not undefined)
  const isCoach =
    profile != null &&
    ((profile as any)?.user_type === "coach" || (Array.isArray(coachTeams) && coachTeams.length > 0));

  const { data: userTeams } = useQuery({
    queryKey: ["user-team-memberships"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase.from("team_members").select("team_id").eq("user_id", user.id);
      return data || [];
    },
    enabled: !loading,
  });

  // kept for reference, teams now always visible
  const _isOnTeam = isCoach || (userTeams && userTeams.length > 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
            <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-primary animate-pulse-soft" />
          </div>
          <p className="text-muted-foreground font-medium">Loading your training...</p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    const section = NAV_CONFIG.find((s) => s.id === activeSection);

    // Dashboard always shows overview
    if (activeSection === "dashboard") {
      return <DashboardOverview navTo={navTo} />;
    }

    // Coaches Hub — manages its own internal tabs
    if (activeSection === "coaches-hub") {
      if (!isCoach) return null;
      return <CoachesHub initialTab={activeSub ?? undefined} />;
    }

    // Regattas — manages its own internal tabs
    if (activeSection === "regattas") {
      return <RegattasSection profile={profile} isCoach={isCoach} initialTab={activeSub ?? undefined} />;
    }

    // Section with no sub selected → landing grid
    if (!activeSub && section && section.subs.length > 0) {
      return <SectionLanding section={section} navTo={navTo} isCoach={isCoach} />;
    }

    // ── Training ──────────────────────────────────────────────────────────────
    if (activeSection === "training") {
      switch (activeSub) {
        case "plan":
          return (
            <div className="space-y-4">
              <TodaysWorkouts profile={profile} />
              <WorkoutPlanSection />
            </div>
          );
        case "history":
          return <HistorySection profile={profile} />;
        case "erg":
          return (
            <div className="space-y-6">
              <ErgWorkoutSection profile={profile} />
              <MultiPieceSession profile={profile} />
            </div>
          );
        case "strength":
          return <MultiSetStrengthForm profile={profile} />;
        case "nutrition":
          return <MealPlanTab profile={profile} />;
        case "recovery":
          return <RecoverySection profile={profile} />;
        case "schedule":
          return <TodaysWorkouts profile={profile} />;
        case "library":
          return <WorkoutPlanSection />;
        default:
          return null;
      }
    }

    // ── Performance ───────────────────────────────────────────────────────────
    if (activeSection === "performance") {
      switch (activeSub) {
        case "analytics":
          return <PerformanceSection profile={profile} />;
        case "trends":
          return <ComparisonSection profile={profile} />;
        case "predictions":
          return (
            <div className="space-y-6">
              <ErgPredictor />
              <SplitCalculator />
            </div>
          );
        case "pacing":
          return <SplitCalculator />;
        case "technique":
          return <CritiqueSection />;
        default:
          return null;
      }
    }

    // ── Teams ─────────────────────────────────────────────────────────────────
    if (activeSection === "teams") {
      switch (activeSub) {
        case "roster":
          return <TeamsSection profile={profile} isCoach={isCoach} />;
        case "lineups":
          return <TeamsSection profile={profile} isCoach={isCoach} />;
        case "seat-racing":
          return <TeamsSection profile={profile} isCoach={isCoach} />;
        case "race-optimizer":
          return <TeamsSection profile={profile} isCoach={isCoach} />;
        case "messages":
          return <TeamsSection profile={profile} isCoach={isCoach} />;
        case "leaderboard":
          return <TeamsSection profile={profile} isCoach={isCoach} />;
        case "comparison":
          return <AthleteComparisonSection />;
        case "plan-gen":
          return isCoach ? <TeamsSection profile={profile} isCoach={isCoach} /> : null;
        case "load-mgmt":
          return isCoach ? <TeamsSection profile={profile} isCoach={isCoach} /> : null;
        case "recruiting-gaps":
          return isCoach ? <TeamsSection profile={profile} isCoach={isCoach} /> : null;
        default:
          return null;
      }
    }

    // ── Recruiting ────────────────────────────────────────────────────────────
    if (activeSection === "recruiting") {
      switch (activeSub) {
        case "my-profile":
          return <PublicProfileSection />;
        case "public-profile":
          return <PublicProfileSection />;
        case "recruiting-profile":
          return <RecruitingProfileSection />;
        case "college-targets":
          return <CollegeTargetsSection />;
        case "coach-directory":
          return <CoachDirectorySection profile={profile} />;
        case "combine":
          return <CombineSection />;
        case "alumni":
          return <AlumniNetworkSection />;
        default:
          return null;
      }
    }

    // ── Competition ───────────────────────────────────────────────────────────
    if (activeSection === "competition") {
      switch (activeSub) {
        case "leaderboard":
          return <LeaderboardSection />;
        case "h2h":
          return <RaceSection />;
        case "challenges":
          return <WeeklyChallengeSection />;
        case "achievements":
          return <AwardsSection profile={profile} />;
        case "rankings":
          return <LeaderboardSection />;
        default:
          return null;
      }
    }

    // ── Live ──────────────────────────────────────────────────────────────────
    if (activeSection === "live") {
      switch (activeSub) {
        case "erg":
          return <LiveErgView />;
        case "hr":
          return <DeviceSection />;
        case "devices":
          return <DeviceSection />;
        default:
          return null;
      }
    }

    // ── Community ─────────────────────────────────────────────────────────────
    if (activeSection === "community") {
      switch (activeSub) {
        case "forum":
          return <ForumSection />;
        case "directory":
          return <DirectorySection />;
        case "friends":
          return <FriendsSection profile={profile} />;
        case "referrals":
          return <ReferralSection profile={profile} />;
        default:
          return null;
      }
    }

    // ── Settings ──────────────────────────────────────────────────────────────
    if (activeSection === "settings") {
      switch (activeSub) {
        case "profile":
          return <ProfileSection />;
        case "notifications":
          return <ProfileSection />;
        case "ask-ai":
          return <AskSection />;
        case "concept2":
          return <Concept2Section />;
        default:
          return null;
      }
    }

    return null;
  };

  // Mobile bottom nav sections
  const mobileBottomNav = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "training", label: "Training", icon: Dumbbell },
    { id: "teams", label: "Teams", icon: Users },
    { id: "performance", label: "Performance", icon: BarChart3 },
  ];

  const moreNavSections = NAV_CONFIG.filter(
    (s) => !["dashboard", "training", "teams", "performance"].includes(s.id) && (!s.coachOnly || isCoach)
  );

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="border-b border-white/10 bg-[#0a1628] z-20 shadow-sm shrink-0">
        <div className="px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img
              src={crewsyncLogo}
              alt="CrewSync"
              className="h-10 w-10 rounded-xl shadow-sm border border-white/20 hover:scale-105 transition-transform cursor-pointer"
              onClick={() => navTo("dashboard")}
            />
            <span className="font-bold text-lg hidden sm:inline text-white">CrewSync</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
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
        {/* ── Sidebar (desktop only) ────────────────────────────────────────── */}
        <aside className="hidden md:flex flex-col w-60 shrink-0 bg-[#0a1628] border-r border-white/10 overflow-y-auto">
          <nav className="flex-1 px-3 py-4 space-y-0.5">
            {NAV_CONFIG.filter((s) => !s.coachOnly || isCoach).map((section) => (
              <div key={section.id}>
                <button
                  onClick={() => navTo(section.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
                    ${activeSection === section.id
                      ? "bg-[#2d6be4] text-white"
                      : "text-white/70 hover:bg-white/10 hover:text-white"}`}
                >
                  <section.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{section.label}</span>
                  {section.subs.length > 0 && (
                    activeSection === section.id
                      ? <ChevronDown className="h-3.5 w-3.5" />
                      : <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
                {activeSection === section.id && section.subs.length > 0 && (
                  <div className="ml-4 mt-1 space-y-0.5">
                    {section.subs.filter((s) => !s.coachOnly || isCoach).map((sub) => (
                      <button
                        key={sub.id}
                        onClick={() => navTo(section.id, sub.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors
                          ${activeSub === sub.id
                            ? "bg-white/15 text-white font-semibold"
                            : "text-white/55 hover:bg-white/10 hover:text-white/90"}`}
                      >
                        <div
                          className={`w-1 h-1 rounded-full ${
                            activeSub === sub.id ? "bg-[#2d6be4]" : "bg-white/30"
                          }`}
                        />
                        {sub.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>

          {/* User info + logout at bottom */}
          <div className="px-3 py-4 border-t border-white/10 space-y-2">
            {profile && (
              <div className="flex items-center gap-2 px-3 py-2">
                <div className="w-7 h-7 rounded-full bg-[#2d6be4] flex items-center justify-center shrink-0">
                  <User className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">
                    {(profile as any)?.full_name || (profile as any)?.username || "Athlete"}
                  </p>
                  <p className="text-[10px] text-white/50 capitalize">
                    {(profile as any)?.user_type || "athlete"}
                  </p>
                </div>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </aside>

        {/* ── Content Area ────────────────────────────────────────────────── */}
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto relative"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <PullToRefreshIndicator progress={progress} refreshing={refreshing} threshold={threshold} />
          <main
            className="container mx-auto px-4 py-6 pb-24 md:pb-8 animate-fade-in"
            style={{
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
      </div>

      {/* ── Mobile Bottom Nav ───────────────────────────────────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-card border-t border-border shadow-lg"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex justify-around items-center h-16 px-1">
          {mobileBottomNav.map((item) => (
            <button
              key={item.id}
              onClick={() => navTo(item.id)}
              className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors ${
                activeSection === item.id ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          ))}

          {/* More sheet */}
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors ${
                  moreNavSections.some((s) => s.id === activeSection)
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              >
                <MoreHorizontal className="h-5 w-5" />
                <span className="text-[10px] font-medium">More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85vh] flex flex-col">
              <SheetHeader className="shrink-0 pb-2">
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <div className="overflow-y-auto flex-1 pb-4 space-y-4">
                {moreNavSections.map((section) => (
                  <div key={section.id}>
                    <button
                      onClick={() => navTo(section.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left transition-colors font-semibold text-sm ${
                        activeSection === section.id
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-muted"
                      }`}
                    >
                      <section.icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{section.label}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                    {activeSection === section.id && section.subs.length > 0 && (
                      <div className="ml-4 mt-1 space-y-0.5">
                        {section.subs.filter((s) => !s.coachOnly || isCoach).map((sub) => (
                          <button
                            key={sub.id}
                            onClick={() => navTo(section.id, sub.id)}
                            className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-left text-sm transition-colors ${
                              activeSub === sub.id
                                ? "bg-primary/10 text-primary font-semibold"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                          >
                            <sub.icon className="h-3.5 w-3.5 shrink-0" />
                            {sub.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
