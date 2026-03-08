import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, Calendar, User, Bluetooth, History, UsersRound, MessageCircle, PlusCircle, BarChart3, GitCompare, Trophy, Sparkles, UtensilsCrossed, MessageSquare, Eye, GraduationCap } from "lucide-react";
import { Separator } from "@/components/ui/separator";
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

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUser();
    
    // Listen for auth state changes (including session expiry)
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
      
      if (error || !user) {
        navigate("/auth");
        return;
      }

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

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      return data;
    },
    enabled: !loading,
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const isCoach = (profile as any)?.user_type === "coach";

  // Check if user is a member of any team (for rowers to see Teams tab)
  const { data: userTeams } = useQuery({
    queryKey: ["user-team-memberships"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id);
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

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header */}
      <header className="border-b border-border bg-card/90 backdrop-blur-xl sticky top-0 z-20 shadow-sm">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img 
              src={crewsyncLogo} 
              alt="CrewSync" 
              className="h-10 w-10 rounded-xl shadow-sm border border-border hover:scale-105 transition-transform cursor-pointer" 
              onClick={() => navigate("/")}
            />
            <span className="font-bold text-lg hidden sm:inline text-gradient">
              CrewSync
            </span>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <NotificationBell />
            <Button onClick={handleLogout} variant="ghost" size="sm" className="gap-2 hover:bg-destructive/10 hover:text-destructive">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 pb-24 md:pb-8 animate-fade-in">
        <Tabs defaultValue="plans" className="space-y-6">
          {/* Tab Navigation */}
          <div className="bg-card rounded-2xl p-2 shadow-card border border-border">
            <TabsList className="w-full justify-start overflow-x-auto flex-nowrap bg-transparent h-auto p-0 gap-1.5">
              <TabsTrigger 
                value="plans" 
                className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
              >
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">Training</span>
                <span className="sm:hidden">Plans</span>
              </TabsTrigger>
              <TabsTrigger 
                value="log" 
                className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Log</span>
              </TabsTrigger>
              <TabsTrigger 
                value="meals" 
                className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
              >
                <UtensilsCrossed className="h-4 w-4" />
                <span>Meals</span>
              </TabsTrigger>
              <TabsTrigger 
                value="history" 
                className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
              >
                <History className="h-4 w-4" />
                <span>History</span>
              </TabsTrigger>
              <TabsTrigger 
                value="stats" 
                className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
              >
                <BarChart3 className="h-4 w-4" />
                <span>Stats</span>
              </TabsTrigger>
              <TabsTrigger 
                value="compare" 
                className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
              >
                <GitCompare className="h-4 w-4" />
                <span>Compare</span>
              </TabsTrigger>
              <TabsTrigger 
                value="awards" 
                className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
              >
                <Trophy className="h-4 w-4" />
                <span>Awards</span>
              </TabsTrigger>
              <TabsTrigger 
                value="profile" 
                className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
              >
                <User className="h-4 w-4" />
                <span>Profile</span>
              </TabsTrigger>
              <TabsTrigger 
                value="friends" 
                className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
              >
                <MessageCircle className="h-4 w-4" />
                <span>Friends</span>
              </TabsTrigger>
              {isOnTeam && (
                <TabsTrigger 
                  value="teams" 
                  className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
                >
                  <UsersRound className="h-4 w-4" />
                  <span>Teams</span>
                </TabsTrigger>
              )}
              <TabsTrigger 
                value="critique" 
                className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
              >
                <Eye className="h-4 w-4" />
                <span>Critique</span>
              </TabsTrigger>
              <TabsTrigger 
                value="ask" 
                className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
              >
                <MessageSquare className="h-4 w-4" />
                <span>Ask</span>
              </TabsTrigger>
              <TabsTrigger 
                value="devices" 
                className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
              >
                <Bluetooth className="h-4 w-4" />
                <span className="hidden sm:inline">Devices</span>
                <span className="sm:hidden">Sync</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Tab Content */}
          <div className="animate-fade-in-up">
            <TabsContent value="plans" className="mt-0">
              <WorkoutPlanSection />
            </TabsContent>

            <TabsContent value="log" className="mt-0">
              <div className="space-y-6">
                <TodaysWorkouts profile={profile} />
                <Separator className="my-2" />
                <h2 className="text-lg font-semibold text-foreground">Custom Workout</h2>
                <ErgWorkoutSection profile={profile} />
                <MultiSetStrengthForm profile={profile} />
              </div>
            </TabsContent>

            <TabsContent value="meals" className="mt-0">
              <MealPlanTab profile={profile} />
            </TabsContent>

            <TabsContent value="history" className="mt-0">
              <HistorySection profile={profile} />
            </TabsContent>

            <TabsContent value="stats" className="mt-0">
              <PerformanceSection profile={profile} />
            </TabsContent>

            <TabsContent value="compare" className="mt-0">
              <ComparisonSection profile={profile} />
            </TabsContent>

            <TabsContent value="awards" className="mt-0">
              <AwardsSection profile={profile} />
            </TabsContent>

            <TabsContent value="profile" className="mt-0">
              <ProfileSection />
            </TabsContent>

            <TabsContent value="friends" className="mt-0">
              <FriendsSection profile={profile} />
            </TabsContent>

            {isOnTeam && (
              <TabsContent value="teams" className="mt-0">
                <TeamsSection profile={profile} isCoach={isCoach} />
              </TabsContent>
            )}

            <TabsContent value="critique" className="mt-0">
              <CritiqueSection />
            </TabsContent>

            <TabsContent value="ask" className="mt-0">
              <AskSection />
            </TabsContent>

            <TabsContent value="devices" className="mt-0">
              <DeviceSection />
            </TabsContent>
          </div>
        </Tabs>
      </main>
    </div>
  );
};

export default Dashboard;