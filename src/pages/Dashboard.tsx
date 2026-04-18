import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { LogOut, Calendar, User, Bluetooth, History, UsersRound, MessageCircle, PlusCircle, BarChart3, GitCompare, Trophy, Sparkles, UtensilsCrossed, MessageSquare, Eye, GraduationCap, MessagesSquare, Medal, Calculator, HeartPulse, MoreHorizontal, ChevronRight, Gauge, Swords, Globe, Target, School, Award, Zap } from "lucide-react";
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

const Dashboard = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("plans");
  const [moreOpen, setMoreOpen] = useState(false);

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, [queryClient]);

  const { containerRef, pulling, refreshing, progress, threshold } = usePullToRefresh(handleRefresh);

  useEffect(() => {
    checkUser();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' && !session) {
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

  const isCoach = (profile as any)?.user_type === "coach";

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

  const isOnTeam = isCoach || (userTeams && userTeams.length > 0);

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

  const mobileNavItems = [
    { value: "plans", icon: Calendar, label: "Training" },
    { value: "log", icon: PlusCircle, label: "Log" },
    { value: "live", icon: Gauge, label: "Live Erg" },
    { value: "history", icon: History, label: "History" },
  ];

  const moreTabGroups = [
    {
      label: "Workouts",
      items: [
        { value: "ask", icon: MessageSquare, label: "Ask AI Coach" },
        { value: "meals", icon: UtensilsCrossed, label: "Meals" },
        { value: "stats", icon: BarChart3, label: "Stats" },
        { value: "compare", icon: GitCompare, label: "Compare" },
        { value: "awards", icon: Trophy, label: "Awards" },
        { value: "predictor", icon: Calculator, label: "Predictor" },
        { value: "recovery", icon: HeartPulse, label: "Recovery" },
        { value: "critique", icon: Eye, label: "Video Critique" },
      ],
    },
    {
      label: "Race",
      items: [
        { value: "race", icon: Swords, label: "Head-to-Head Race" },
        { value: "combine", icon: Award, label: "Virtual Combine" },
        { value: "challenges", icon: Zap, label: "Weekly Challenges" },
        { value: "leaderboard", icon: Medal, label: "Rankings" },
      ],
    },
    {
      label: "Recruiting",
      items: [
        { value: "recruit", icon: GraduationCap, label: "Recruitment" },
        { value: "public-profile", icon: Globe, label: "My Public Profile" },
        { value: "recruiting", icon: Target, label: "Recruiting Profile" },
        { value: "college-targets", icon: School, label: "College List" },
        { value: "coaches", icon: UsersRound, label: "Coach Directory" },
      ],
    },
    {
      label: "Community",
      items: [
        { value: "directory", icon: Globe, label: "Club Directory" },
        { value: "forum", icon: MessagesSquare, label: "Forum" },
        { value: "friends", icon: MessageCircle, label: "Friends" },
        ...(isOnTeam ? [{ value: "teams", icon: UsersRound, label: "Teams" }] : []),
      ],
    },
    {
      label: "Settings",
      items: [
        { value: "profile", icon: User, label: "Profile" },
        { value: "devices", icon: Bluetooth, label: "Devices & BLE" },
        { value: "referral", icon: Sparkles, label: "Refer Friends" },
      ],
    },
    ...(isCoach ? [{
      label: "Coach Tools",
      items: [
        { value: "team-compare", icon: GitCompare, label: "Athlete Compare" },
        { value: "alumni", icon: GraduationCap, label: "Alumni Network" },
      ],
    }] : []),
  ];

  const allMoreItems = moreTabGroups.flatMap(g => g.items);
  const isMoreTabActive = allMoreItems.some(t => t.value === activeTab);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0a1628] sticky top-0 z-20 shadow-sm">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img
              src={crewsyncLogo}
              alt="CrewSync"
              className="h-10 w-10 rounded-xl shadow-sm border border-white/20 hover:scale-105 transition-transform cursor-pointer"
              onClick={() => navigate("/dashboard")}
            />
            <span className="font-bold text-lg hidden sm:inline text-white">
              CrewSync
            </span>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <NotificationBell />
            <Button onClick={handleLogout} variant="ghost" size="sm" className="gap-2 text-white/80 hover:text-white hover:bg-white/10">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      <div
        ref={containerRef}
        className="relative overflow-y-auto flex-1"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <PullToRefreshIndicator progress={progress} refreshing={refreshing} threshold={threshold} />
      <main
        className="container mx-auto px-4 py-6 pb-20 md:pb-8 animate-fade-in"
        style={{ transform: pulling || refreshing ? `translateY(${Math.min(progress, threshold)}px)` : undefined, transition: refreshing ? "transform 0.2s" : undefined }}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Desktop Tab Navigation - hidden on mobile */}
          <div className="hidden md:block bg-card rounded-2xl p-2 shadow-card border border-border">
            <TabsList className="w-full justify-start overflow-x-auto flex-nowrap bg-transparent h-auto p-0 gap-1.5">
              <TabsTrigger value="plans" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <Calendar className="h-4 w-4" /><span>Training</span>
              </TabsTrigger>
              <TabsTrigger value="log" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <PlusCircle className="h-4 w-4" /><span>Log</span>
              </TabsTrigger>
              <TabsTrigger value="meals" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <UtensilsCrossed className="h-4 w-4" /><span>Meals</span>
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <History className="h-4 w-4" /><span>History</span>
              </TabsTrigger>
              <TabsTrigger value="stats" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <BarChart3 className="h-4 w-4" /><span>Stats</span>
              </TabsTrigger>
              <TabsTrigger value="compare" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <GitCompare className="h-4 w-4" /><span>Compare</span>
              </TabsTrigger>
              <TabsTrigger value="awards" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <Trophy className="h-4 w-4" /><span>Awards</span>
              </TabsTrigger>
              <TabsTrigger value="predictor" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <Calculator className="h-4 w-4" /><span>Predictor</span>
              </TabsTrigger>
              <TabsTrigger value="leaderboard" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <Medal className="h-4 w-4" /><span>Rankings</span>
              </TabsTrigger>
              <TabsTrigger value="recruit" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <GraduationCap className="h-4 w-4" /><span>Recruit</span>
              </TabsTrigger>
              <TabsTrigger value="public-profile" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <Globe className="h-4 w-4" /><span>My Profile</span>
              </TabsTrigger>
              <TabsTrigger value="recruiting" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <Target className="h-4 w-4" /><span>Recruiting</span>
              </TabsTrigger>
              <TabsTrigger value="college-targets" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <School className="h-4 w-4" /><span>Colleges</span>
              </TabsTrigger>
              <TabsTrigger value="coaches" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <UsersRound className="h-4 w-4" /><span>Coaches</span>
              </TabsTrigger>
              <TabsTrigger value="profile" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <User className="h-4 w-4" /><span>Profile</span>
              </TabsTrigger>
              <TabsTrigger value="friends" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <MessageCircle className="h-4 w-4" /><span>Friends</span>
              </TabsTrigger>
              {isOnTeam && (
                <TabsTrigger value="teams" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                  <UsersRound className="h-4 w-4" /><span>Teams</span>
                </TabsTrigger>
              )}
              <TabsTrigger value="critique" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <Eye className="h-4 w-4" /><span>Critique</span>
              </TabsTrigger>
              <TabsTrigger value="ask" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <MessageSquare className="h-4 w-4" /><span>Ask</span>
              </TabsTrigger>
              <TabsTrigger value="forum" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <MessagesSquare className="h-4 w-4" /><span>Forum</span>
              </TabsTrigger>
              <TabsTrigger value="directory" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <Globe className="h-4 w-4" /><span>Directory</span>
              </TabsTrigger>
              <TabsTrigger value="devices" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <Bluetooth className="h-4 w-4" /><span>Devices</span>
              </TabsTrigger>
              <TabsTrigger value="recovery" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <HeartPulse className="h-4 w-4" /><span>Recovery</span>
              </TabsTrigger>
              <TabsTrigger value="live" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <Gauge className="h-4 w-4" /><span>Live Erg</span>
              </TabsTrigger>
              <TabsTrigger value="race" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <Swords className="h-4 w-4" /><span>Race</span>
              </TabsTrigger>
              <TabsTrigger value="combine" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <Award className="h-4 w-4" /><span>Combine</span>
              </TabsTrigger>
              <TabsTrigger value="challenges" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <Zap className="h-4 w-4" /><span>Challenges</span>
              </TabsTrigger>
              {isCoach && (
                <TabsTrigger value="team-compare" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                  <GitCompare className="h-4 w-4" /><span>Compare</span>
                </TabsTrigger>
              )}
              {isCoach && (
                <TabsTrigger value="alumni" className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                  <GraduationCap className="h-4 w-4" /><span>Alumni</span>
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* Tab Content */}
          <div className="animate-fade-in-up">
            <TabsContent value="plans" className="mt-0">
              <div className="space-y-4">
                <StreakWidget />
                <WeeklyChallengeWidget onNavigate={setActiveTab} />
                <WorkoutPlanSection />
              </div>
            </TabsContent>
            <TabsContent value="log" className="mt-0">
              <div className="space-y-6">
                <TodaysWorkouts profile={profile} />
                <Separator className="my-2" />
                <h2 className="text-lg font-semibold text-foreground">Custom Workout</h2>
                <ErgWorkoutSection profile={profile} />
                <MultiPieceSession profile={profile} />
                <MultiSetStrengthForm profile={profile} />
              </div>
            </TabsContent>
            <TabsContent value="meals" className="mt-0"><MealPlanTab profile={profile} /></TabsContent>
            <TabsContent value="history" className="mt-0"><HistorySection profile={profile} /></TabsContent>
            <TabsContent value="stats" className="mt-0"><PerformanceSection profile={profile} /></TabsContent>
            <TabsContent value="compare" className="mt-0"><ComparisonSection profile={profile} /></TabsContent>
            <TabsContent value="awards" className="mt-0"><AwardsSection profile={profile} /></TabsContent>
            <TabsContent value="recruit" className="mt-0"><RecruitmentSection profile={profile} /></TabsContent>
            <TabsContent value="public-profile" className="mt-0"><PublicProfileSection /></TabsContent>
            <TabsContent value="recruiting" className="mt-0"><RecruitingProfileSection /></TabsContent>
            <TabsContent value="college-targets" className="mt-0"><CollegeTargetsSection /></TabsContent>
            <TabsContent value="coaches" className="mt-0"><CoachDirectorySection profile={profile} /></TabsContent>
            <TabsContent value="predictor" className="mt-0">
              <div className="space-y-6"><ErgPredictor /><SplitCalculator /></div>
            </TabsContent>
            <TabsContent value="leaderboard" className="mt-0"><LeaderboardSection /></TabsContent>
            <TabsContent value="profile" className="mt-0"><ProfileSection /></TabsContent>
            <TabsContent value="friends" className="mt-0"><FriendsSection profile={profile} /></TabsContent>
            <TabsContent value="teams" className="mt-0"><TeamsSection profile={profile} isCoach={isCoach} /></TabsContent>
            <TabsContent value="critique" className="mt-0"><CritiqueSection /></TabsContent>
            <TabsContent value="ask" className="mt-0"><AskSection /></TabsContent>
            <TabsContent value="forum" className="mt-0"><ForumSection /></TabsContent>
            <TabsContent value="devices" className="mt-0"><DeviceSection /></TabsContent>
            <TabsContent value="recovery" className="mt-0"><RecoverySection profile={profile} /></TabsContent>
            <TabsContent value="live" className="mt-0 -mx-4 -mb-20 md:-mx-0 md:-mb-8"><LiveErgView /></TabsContent>
            <TabsContent value="race" className="mt-0 -mx-4 -mb-20 md:-mx-0 md:-mb-8"><RaceSection /></TabsContent>
            <TabsContent value="combine" className="mt-0"><CombineSection /></TabsContent>
            <TabsContent value="challenges" className="mt-0"><WeeklyChallengeSection /></TabsContent>
            {isCoach && <TabsContent value="team-compare" className="mt-0"><AthleteComparisonSection /></TabsContent>}
            {isCoach && <TabsContent value="alumni" className="mt-0"><AlumniNetworkSection /></TabsContent>}
            <TabsContent value="referral" className="mt-0"><ReferralSection profile={profile} /></TabsContent>
            <TabsContent value="directory" className="mt-0"><DirectorySection /></TabsContent>
          </div>
        </Tabs>
      </main>
      </div>

      {/* Mobile Bottom Nav */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-card border-t border-border shadow-lg" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="flex justify-around items-center h-16 px-1">
          {mobileNavItems.map((item) => (
            <button
              key={item.value}
              onClick={() => setActiveTab(item.value)}
              className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors ${
                activeTab === item.value ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          ))}
          {/* More button */}
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors ${
                  isMoreTabActive ? "text-primary" : "text-muted-foreground"
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
                {moreTabGroups.map((group) => (
                  <div key={group.label}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 mb-1">{group.label}</p>
                    <div className="space-y-0.5">
                      {group.items.map((item) => (
                        <button
                          key={item.value}
                          onClick={() => { setActiveTab(item.value); setMoreOpen(false); }}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left transition-colors ${
                            activeTab === item.value
                              ? "bg-primary/10 text-primary"
                              : "text-foreground hover:bg-muted"
                          }`}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span className="flex-1 font-medium text-sm">{item.label}</span>
                          {activeTab === item.value && <div className="h-1.5 w-1.5 rounded-full bg-primary" />}
                        </button>
                      ))}
                    </div>
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
