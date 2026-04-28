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
  Check,
  X,
  ChevronUp,
  Shield,
} from "lucide-react";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/PullToRefresh";
import { WorkoutPlanSection } from "@/components/dashboard/WorkoutPlanSection";
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
import { NotificationSettings } from "@/components/dashboard/NotificationSettings";
import { ThemeToggle } from "@/components/ThemeToggle";
import crewsyncLogo from "@/assets/crewsync-logo-icon.jpg";
import MealPlanTab from "@/components/dashboard/MealPlanTab";
import AskSection from "@/components/dashboard/AskSection";
import CritiqueSection from "@/components/dashboard/CritiqueSection";
import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { AccountSection } from "@/components/dashboard/AccountSection";
import TodaysWorkouts from "@/components/dashboard/TodaysWorkouts";
import RecruitmentSection from "@/components/dashboard/RecruitmentSection";
import ForumSection from "@/components/dashboard/forum/ForumSection";
import { LeaderboardSection } from "@/components/dashboard/LeaderboardSection";
import { ErgPredictor } from "@/components/dashboard/ErgPredictor";
import { SplitCalculator } from "@/components/dashboard/SplitCalculator";
import RecoverySection from "@/components/dashboard/RecoverySection";
import RecoveryDashboard from "@/components/dashboard/RecoveryDashboard";
import MultiPieceSession from "@/components/dashboard/MultiPieceSession";
import LiveErgView from "@/components/dashboard/LiveErgView";
import RaceSection from "@/components/dashboard/RaceSection";
import { PublicProfileSection } from "@/components/dashboard/PublicProfileSection";
import { RecruitingProfileSection } from "@/components/dashboard/RecruitingProfileSection";
import { CollegeTargetsSection } from "@/components/dashboard/CollegeTargetsSection";
import CombineSection from "@/components/dashboard/CombineSection";
import WeeklyChallengeSection from "@/components/dashboard/WeeklyChallengeSection";
import AthleteComparisonSection from "@/components/dashboard/AthleteComparisonSection";
import AlumniNetworkSection from "@/components/dashboard/AlumniNetworkSection";
import { ReferralSection } from "@/components/dashboard/ReferralSection";
import DirectorySection from "@/components/dashboard/DirectorySection";
import Concept2Section from "@/components/dashboard/Concept2Section";
import WhoopConnectSection from "@/components/dashboard/WhoopConnectSection";
import HealthKitConnect from "@/components/dashboard/HealthKitConnect";
import { CoachesHub } from "@/components/dashboard/coaches-hub/CoachesHub";
import { RegattasSection } from "@/components/dashboard/regattas/RegattasSection";
import { CalculatorsSection } from "@/components/dashboard/calculators/CalculatorsSection";
import { getSessionUser } from '@/lib/getUser';
import { getLocalDate } from "@/lib/dateUtils";
import { AppStoreBanner } from "@/components/AppStoreBanner";
import CrossTrainingSection from "@/components/dashboard/CrossTrainingSection";

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
      { id: "cross-training", label: "Cross Training", description: "Log runs, rides, and swims", icon: Activity },
      { id: "nutrition", label: "Nutrition", description: "Track meals and macros", icon: Utensils },
      { id: "recovery", label: "Recovery", description: "Track recovery metrics", icon: Moon },
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
      { id: "technique", label: "Technique", description: "Video critique and analysis", icon: Video },
      { id: "ask", label: "AI Coach", description: "Chat with your AI rowing coach", icon: Sparkles },
    ],
  },
  {
    id: "calculators",
    label: "Calculators",
    icon: Calculator,
    subs: [
      { id: "stroke-watch", label: "Stroke Watch", description: "Tap to measure real-time stroke rate on the water", icon: Radio },
      { id: "split", label: "Split Calculator", description: "Two-way split ↔ total time for any distance", icon: Calculator },
      { id: "predictor-2k", label: "2K Predictor", description: "AI-powered conservative 2K prediction", icon: Zap },
      { id: "weight-adj", label: "Weight Adjustment", description: "Predict 2K time at target body weight", icon: Weight },
      { id: "pace-watts", label: "Pace & Watts", description: "Convert split to watts and back", icon: Gauge },
      { id: "zones", label: "Training Zones", description: "UT2, UT1, AT, TR, AN, SP zones from 2K", icon: Target },
      { id: "stroke-rate", label: "Stroke Rate", description: "Analyze efficiency at your rate and pace", icon: Activity },
      { id: "race-plan", label: "Race Splits Planner", description: "Plan your 2K race 500m by 500m", icon: Trophy },
      { id: "equivalency", label: "Erg Equivalency", description: "Compare RowErg, SkiErg, BikeErg efforts", icon: ArrowLeftRight },
      { id: "wkg", label: "W/kg Ratio", description: "Power-to-weight and performance benchmarks", icon: BarChart3 },
      { id: "timeline", label: "Improvement Timeline", description: "AI roadmap to your goal 2K time", icon: TrendingUp },
    ],
  },
  {
    id: "friends",
    label: "Friends",
    icon: UserPlus,
    subs: [
      { id: "feed", label: "Feed", description: "Social activity feed from friends", icon: Activity },
      { id: "messages", label: "Messages", description: "Direct messages with friends", icon: MessageCircle },
      { id: "find", label: "Find Friends", description: "Search for and add friends", icon: Search },
      { id: "requests", label: "Requests", description: "Pending friend requests", icon: UserPlus },
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
      { id: "public-profile", label: "Profile", description: "View and edit your public-facing profile", icon: User },
      { id: "recruiting-profile", label: "Recruiting Profile", description: "Manage your recruiting information", icon: Target },
      { id: "college-targets", label: "College Targets", description: "Track target schools and coaches", icon: School },
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
    id: "settings",
    label: "Settings",
    icon: Settings,
    subs: [
      { id: "account", label: "Account", description: "Email, password, and account management", icon: User },
      { id: "notifications", label: "Notifications", description: "Manage notification preferences", icon: Bell },
      { id: "connected-apps", label: "Connected Apps", description: "Concept2, Garmin, and integrations", icon: Link2 },
      { id: "billing", label: "Billing", description: "Plan and usage", icon: Star },
    ],
  },
];


// ─── BILLING TAB ─────────────────────────────────────────────────────────────

function BillingTab() {
  const navigate = useNavigate();
  const [annual, setAnnual] = useState(false);

  const plans = [
    {
      name: "Free",
      price: 0,
      annualPrice: 0,
      betaPrice: 0,
      betaAnnual: 0,
      color: "border-border",
      badge: null,
      features: ["Workout logging", "Basic analytics", "Community access", "3 AI queries/month"],
    },
    {
      name: "Pro",
      price: 10,
      annualPrice: 8,
      betaPrice: 8,
      betaAnnual: 6.40,
      color: "border-blue-500",
      badge: "Most Popular",
      features: ["Everything in Free", "Unlimited AI Coach", "Advanced analytics", "Training zones", "Split calculator"],
    },
    {
      name: "Elite",
      price: 15,
      annualPrice: 12,
      betaPrice: 12,
      betaAnnual: 9.60,
      color: "border-purple-500",
      badge: null,
      features: ["Everything in Pro", "Video critique", "Recruiting profile", "Regatta tracking", "Priority support"],
    },
    {
      name: "Elite+",
      price: 25,
      annualPrice: 20,
      betaPrice: 20,
      betaAnnual: 16,
      color: "border-amber-500",
      badge: "Best Value",
      features: ["Everything in Elite", "Head-to-Head racing", "Force curve analysis", "College targeting", "Early feature access"],
    },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Beta banner */}
      <div className="rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 p-4 text-white">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="h-4 w-4" />
          <span className="font-bold text-sm">Beta Pricing — 20% Off For Life</span>
        </div>
        <p className="text-xs text-white/80">
          Lock in your rate now. Early backers keep this discount forever — even after we raise prices.
          No coupon needed.
        </p>
      </div>

      {/* Billing toggle */}
      <div className="flex items-center gap-3">
        <span className={`text-sm font-medium ${!annual ? "text-foreground" : "text-muted-foreground"}`}>Monthly</span>
        <button
          onClick={() => setAnnual(!annual)}
          className={`relative w-11 h-6 rounded-full transition-colors ${annual ? "bg-primary" : "bg-muted"}`}
        >
          <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${annual ? "translate-x-5" : ""}`} />
        </button>
        <span className={`text-sm font-medium ${annual ? "text-foreground" : "text-muted-foreground"}`}>
          Annual <span className="text-green-600 font-semibold text-xs">Save 20%</span>
        </span>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {plans.map((plan) => {
          const display = annual ? plan.betaAnnual : plan.betaPrice;
          const original = annual ? plan.annualPrice : plan.price;
          const isFree = plan.price === 0;

          return (
            <div key={plan.name} className={`rounded-xl border-2 ${plan.color} bg-card p-5 space-y-4 relative`}>
              {plan.badge && (
                <div className="absolute -top-3 left-4">
                  <span className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full">
                    {plan.badge}
                  </span>
                </div>
              )}
              <div>
                <h3 className="font-bold text-lg">{plan.name}</h3>
                {isFree ? (
                  <p className="text-2xl font-bold mt-1">Free</p>
                ) : (
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-primary">${display.toFixed(display % 1 === 0 ? 0 : 2)}/mo</span>
                    {original !== display && (
                      <span className="text-sm text-muted-foreground line-through">${original}/mo</span>
                    )}
                  </div>
                )}
                {!isFree && (
                  <div className="mt-1 flex items-center gap-1">
                    <Shield className="h-3 w-3 text-green-600" />
                    <span className="text-xs text-green-600 font-medium">Early Backer — 20% off for life</span>
                  </div>
                )}
              </div>
              <ul className="space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                variant={plan.name === "Pro" ? "default" : "outline"}
                className="w-full"
                size="sm"
                onClick={() => navigate("/pricing")}
              >
                {isFree ? "Current Plan" : "Get Started"}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="text-center">
        <button
          onClick={() => navigate("/pricing")}
          className="text-sm text-primary hover:underline font-medium"
        >
          View full pricing, team plans & feature comparison →
        </button>
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

  const { data: coachTeams } = useQuery({
    queryKey: ["coach-teams"],
    queryFn: async () => {
      const user = await getSessionUser();
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
      const user = await getSessionUser();
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

    // Dashboard always shows home
    if (activeSection === "dashboard") {
      return <DashboardHome profile={profile} navTo={navTo} />;
    }

    // Calculators — manages its own internal tabs
    if (activeSection === "calculators") {
      return <CalculatorsSection initialTab={activeSub ?? undefined} profile={profile} />;
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
        case "cross-training":
          return <CrossTrainingSection profile={profile} />;
        case "nutrition":
          return <MealPlanTab profile={profile} />;
        case "recovery":
          return <RecoveryDashboard profile={profile} />;
        case "schedule":
          return <TodaysWorkouts profile={profile} />;
        case "library":
          return <WorkoutPlanSection />;
        default:
          return null;
      }
    }

    // ── Friends ───────────────────────────────────────────────────────────────
    if (activeSection === "friends") {
      return <FriendsSection profile={profile} />;
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
        case "ask":
          return <AskSection />;
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
        case "account":
          return <AccountSection />;
        case "notifications":
          return <NotificationSettings />;
        case "connected-apps":
          return (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h2 className="text-xl font-semibold">Connected Apps</h2>
                <p className="text-sm text-muted-foreground mt-1">Manage your third-party integrations.</p>
              </div>
              <Concept2Section />
              <WhoopConnectSection />
              <HealthKitConnect />
            </div>
          );
        case "billing":
          return <BillingTab />;
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
      <AppStoreBanner />
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
              className={`flex flex-col items-center justify-center gap-1 flex-1 min-h-[44px] transition-colors ${
                activeSection === item.id ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[11px] font-medium">{item.label}</span>
            </button>
          ))}

          {/* More sheet */}
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                className={`flex flex-col items-center justify-center gap-1 flex-1 min-h-[44px] transition-colors ${
                  moreNavSections.some((s) => s.id === activeSection)
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              >
                <MoreHorizontal className="h-5 w-5" />
                <span className="text-[11px] font-medium">More</span>
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
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors font-semibold text-sm min-h-[44px] ${
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
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm transition-colors min-h-[44px] ${
                              activeSub === sub.id
                                ? "bg-primary/10 text-primary font-semibold"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                          >
                            <sub.icon className="h-4 w-4 shrink-0" />
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
