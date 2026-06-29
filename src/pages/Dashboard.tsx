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
  Building2,
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
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getLocalDate } from "@/lib/dateUtils";
import { AppStoreBanner } from "@/components/AppStoreBanner";
import CrossTrainingSection from "@/components/dashboard/CrossTrainingSection";
import StrengthProgramSection from "@/components/dashboard/StrengthProgramSection";
import OrganizationSection from "@/components/dashboard/OrganizationSection";
import AthleticDirectorDashboard from "@/components/dashboard/AthleticDirectorDashboard";
import { ProfileSection } from "@/components/dashboard/ProfileSection";
import { ApiCostDashboard } from "@/components/dashboard/ApiCostDashboard";
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
import SettingsTab from "@/components/dashboard/tabs/SettingsTab";
import type { AthleteTabProps } from "@/components/dashboard/tabs/types";

// ─── ATHLETE 5-TAB SHELL CONSTANTS ───────────────────────────────────────────

type AthleteTabId = "team" | "me" | "performance" | "competition" | "settings";

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
  orgOnly?: boolean;
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
      { id: "strength-program", label: "Strength Program", description: "View and follow the rowing strength program", icon: Dumbbell },
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
    id: "organization",
    label: "Organization",
    icon: Building2,
    coachOnly: true,
    subs: [],
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
  {
    id: "admin-costs",
    label: "API Costs",
    icon: BarChart3,
    coachOnly: false,
    subs: [],
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
      price: 8,
      annualPrice: 6.40,
      betaPrice: 6.40,
      betaAnnual: 6.40,
      color: "border-blue-500",
      badge: "Most Popular",
      features: ["Everything in Free", "Unlimited AI Coach", "Advanced analytics", "Training zones", "Split calculator"],
    },
    {
      name: "Elite",
      price: 14,
      annualPrice: 11.20,
      betaPrice: 11.20,
      betaAnnual: 11.20,
      color: "border-purple-500",
      badge: "Best Value",
      features: ["Everything in Pro", "Unlimited AI requests", "Dedicated AI coaching assistant", "Advanced recovery modeling", "Multi-season tracking", "API access", "Early feature access"],
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

// ─── ROLE CONSTANTS & VISIBILITY ─────────────────────────────────────────────

const ROLES = [
  { value: "rower",     label: "Athlete",   description: "I train and compete",           icon: "🚣" },
  { value: "coxswain",  label: "Coxswain",  description: "I steer and call",              icon: "🎙️" },
  { value: "coach",     label: "Coach",     description: "I coach a team",                icon: "📋" },
  { value: "organizer", label: "Organizer", description: "I manage regattas and clubs",   icon: "🏆" },
] as const;

/** Returns true when the section/sub should be hidden for the given role. */
const hiddenForRole = (sectionId: string, subId: string | null, role: string | null): boolean => {
  if (!role || role === "rower") return false;

  if (role === "organizer") {
    if (!["dashboard", "organization", "teams", "competition", "performance", "settings"].includes(sectionId)) return true;
    if (sectionId === "performance" && subId && subId !== "ask") return true;
    if (sectionId === "competition" && subId && subId !== "leaderboard") return true;
    return false;
  }

  if (role === "coxswain") {
    if (["recruiting", "live", "calculators", "coaches-hub"].includes(sectionId)) return true;
    if (sectionId === "training" && subId && ["erg", "nutrition", "cross-training"].includes(subId)) return true;
    if (sectionId === "performance" && subId === "technique") return true;
    if (sectionId === "competition" && subId && !["leaderboard", "achievements"].includes(subId)) return true;
    return false;
  }

  return false;
};

// ─── SECTION LANDING PAGE ─────────────────────────────────────────────────────

function SectionLanding({
  section,
  navTo,
  isCoach,
  userRole,
}: {
  section: NavSection;
  navTo: (s: string, sub?: string) => void;
  isCoach: boolean;
  userRole: string | null;
}) {
  const visibleSubs = section.subs.filter(
    (s) => (!s.coachOnly || isCoach) && !hiddenForRole(section.id, s.id, userRole)
  );
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
  const { logoUrl: teamLogo, primaryColor: teamColor, teamName, teamId: branding_teamId } = useTeamBranding();
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState("dashboard");
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
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

  const userRole: string | null = (profile as any)?.user_type ?? null;

  // Coach = role/user_type is "coach" OR they have created a team
  const isCoach =
    profile != null &&
    (
      (profile as any)?.role === "coach" ||
      userRole === "coach" ||
      (Array.isArray(coachTeams) && coachTeams.length > 0)
    );

  const isCox =
    profile != null &&
    (
      (profile as any)?.role === "coxswain" ||
      userRole === "coxswain" ||
      (profile as any)?.is_coxswain === true
    );

  const isOrganizer =
    profile != null &&
    ((profile as any)?.role === "organizer" || userRole === "organizer");

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

    (async () => {
      const user = await getSessionUser();
      if (!user) return;

      const { data: invite } = await supabase
        .from("coach_invites")
        .select("*")
        .eq("token", inviteToken)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (!invite) return;

      const { data: userProfile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", user.id)
        .maybeSingle();

      if (!userProfile?.email || userProfile.email.toLowerCase() !== invite.email.toLowerCase()) return;

      // Add to team_coaches
      const { error } = await supabase.from("team_coaches").insert({
        team_id: invite.team_id,
        user_id: user.id,
        role: invite.role,
        invited_by: invite.invited_by,
        joined_at: new Date().toISOString(),
      });

      if (!error) {
        await supabase
          .from("coach_invites")
          .update({ accepted_at: new Date().toISOString() })
          .eq("id", invite.id);

        const url = new URL(window.location.href);
        url.searchParams.delete("accept_coach_invite");
        window.history.replaceState({}, "", url.toString());

        toast({ title: "Welcome to the coaching staff!", description: "You now have coach access to this team." });
      }
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
        toast({ title: "Athletic Director access granted!", description: "You now have oversight access to this team." });
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

  // kept for reference, teams now always visible
  const _isOnTeam = isCoach || (userTeams && userTeams.length > 0);

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
      const { data: team } = await supabase
        .from("teams")
        .select("id, name")
        .ilike("join_code", trimmed)
        .maybeSingle();
      if (!team) throw new Error("No team found with that code. Check the code and try again.");
      const { error: insertError } = await supabase.from("team_members").insert({
        team_id: team.id,
        user_id: uid,
      });
      if (insertError) {
        if (insertError.code === "23505") throw new Error("You are already on this team.");
        throw insertError;
      }
      // Success: mark onboarding complete, reload team data, switch to Team tab.
      try { localStorage.setItem(ONBOARDING_COMPLETE_KEY, "true"); } catch {}
      queryClient.invalidateQueries({ queryKey: ["teams", uid] });
      queryClient.invalidateQueries({ queryKey: ["user-team-memberships"] });
      queryClient.invalidateQueries({ queryKey: ["teams-member-only", uid] });
      queryClient.invalidateQueries({ queryKey: ["global-team-branding"] });
      setShowJoinOnboarding(false);
      setOnboardingJoinCode("");
      setActiveTab("team");
      toast({ title: `Joined ${team.name}!` });
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

    // Organization dashboard
    if (activeSection === "organization") {
      if (!isCoach && !isOrganizer) return null;
      if (isOrganizer) return <AthleticDirectorDashboard profile={profile} />;
      return <OrganizationSection profile={profile} />;
    }

    // Admin cost dashboard
    if (activeSection === "admin-costs") {
      if (!(profile as any)?.is_admin) return null;
      return <ApiCostDashboard />;
    }

    // Regattas — manages its own internal tabs
    if (activeSection === "regattas") {
      return <RegattasSection profile={profile} isCoach={isCoach} initialTab={activeSub ?? undefined} />;
    }

    // Teams — always render TeamsSection; it manages its own internal navigation
    if (activeSection === "teams") {
      return <TeamsSection profile={profile} isCoach={isCoach} />;
    }

    // Section with no sub selected → landing grid
    if (!activeSub && section && section.subs.length > 0) {
      return <SectionLanding section={section} navTo={navTo} isCoach={isCoach} userRole={userRole} />;
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
        case "strength-program":
          return <StrengthProgramSection profile={profile} />;
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
        case "profile":
          return <ProfileSection />;
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

  const isAdmin = !!(profile as any)?.is_admin;
  const navVisible = (s: NavSection) =>
    (!s.coachOnly || isCoach || isOrganizer) &&
    !hiddenForRole(s.id, null, userRole) &&
    (s.id !== "admin-costs" || isAdmin);

  // ── New athlete/coxswain 5-tab bar ────────────────────────────────────────
  const athleteTabs: { id: AthleteTabId; label: string; icon: React.ElementType }[] = [
    { id: "team", label: hasTeam ? teamAbbrev(shellTeamName) : "Team", icon: Users },
    { id: "me", label: "Me", icon: User },
    { id: "performance", label: "Performance", icon: Zap },
    { id: "competition", label: "Competition", icon: Trophy },
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
        <aside
          className="hidden flex-col w-60 shrink-0 border-r border-white/10 overflow-y-auto"
          style={{ background: teamColor }}
        >
          <nav className="flex-1 px-3 py-4 space-y-0.5">
            {NAV_CONFIG.filter(navVisible).map((section) => (
              <div key={section.id}>
                <button
                  onClick={() => navTo(section.id)}
                  data-tour-id={`tour-nav-${section.id}`}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
                    ${activeSection === section.id
                      ? "text-white"
                      : "text-white/70 hover:bg-white/10 hover:text-white"}`}
                  style={activeSection === section.id ? { background: "rgba(255,255,255,0.2)" } : undefined}
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
                    {section.subs
                      .filter((s) => (!s.coachOnly || isCoach || isOrganizer) && !hiddenForRole(section.id, s.id, userRole))
                      .map((sub) => (
                      <button
                        key={sub.id}
                        onClick={() => navTo(section.id, sub.id)}
                        data-tour-id={`tour-nav-${section.id}-${sub.id}`}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors
                          ${activeSub === sub.id
                            ? "bg-white/15 text-white font-semibold"
                            : "text-white/55 hover:bg-white/10 hover:text-white/90"}`}
                      >
                        <div
                          className="w-1 h-1 rounded-full"
                          style={{ background: activeSub === sub.id ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)" }}
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
                <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center shrink-0">
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
        <div className="flex justify-around items-center h-16 px-1 max-w-2xl mx-auto">
          {athleteTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                data-tour-id={`tour-tab-${tab.id}`}
                className="relative flex flex-col items-center justify-center gap-1 flex-1 min-h-[44px] transition-colors"
                style={{ color: isActive ? teamColor : undefined }}
              >
                <tab.icon
                  className={`h-5 w-5 ${isActive ? "" : "text-muted-foreground"}`}
                  style={isActive ? { color: teamColor } : undefined}
                />
                <span
                  className={`text-[11px] font-medium ${isActive ? "font-semibold" : "text-muted-foreground"}`}
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
