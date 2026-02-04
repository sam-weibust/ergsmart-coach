import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, Calendar, User, Bluetooth, History, UsersRound, MessageCircle, PlusCircle, BarChart3, GitCompare, Trophy } from "lucide-react";
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <p className="text-muted-foreground animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-20 shadow-sm">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img 
              src={crewsyncLogo} 
              alt="CrewSync" 
              className="h-9 w-9 rounded-lg shadow-sm border border-border" 
            />
            <span className="font-semibold text-lg hidden sm:inline bg-gradient-primary bg-clip-text text-transparent">
              CrewSync
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NotificationBell />
            <Button onClick={handleLogout} variant="ghost" size="sm" className="gap-2">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 pb-24 md:pb-8">
        <Tabs defaultValue="plans" className="space-y-6">
          {/* Tab Navigation */}
          <div className="bg-card rounded-xl p-1.5 shadow-card border border-border">
            <TabsList className="w-full justify-start overflow-x-auto flex-nowrap bg-transparent h-auto p-0 gap-1">
              <TabsTrigger 
                value="plans" 
                className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">Training</span>
                <span className="sm:hidden">Plans</span>
              </TabsTrigger>
              <TabsTrigger 
                value="log" 
                className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Log</span>
              </TabsTrigger>
              <TabsTrigger 
                value="history" 
                className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                <History className="h-4 w-4" />
                <span>History</span>
              </TabsTrigger>
              <TabsTrigger 
                value="stats" 
                className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                <BarChart3 className="h-4 w-4" />
                <span>Stats</span>
              </TabsTrigger>
              <TabsTrigger 
                value="compare" 
                className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                <GitCompare className="h-4 w-4" />
                <span>Compare</span>
              </TabsTrigger>
              <TabsTrigger 
                value="awards" 
                className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                <Trophy className="h-4 w-4" />
                <span>Awards</span>
              </TabsTrigger>
              <TabsTrigger 
                value="profile" 
                className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                <User className="h-4 w-4" />
                <span>Profile</span>
              </TabsTrigger>
              <TabsTrigger 
                value="friends" 
                className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                <MessageCircle className="h-4 w-4" />
                <span>Friends</span>
              </TabsTrigger>
              {isCoach && (
                <TabsTrigger 
                  value="teams" 
                  className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                >
                  <UsersRound className="h-4 w-4" />
                  <span>Teams</span>
                </TabsTrigger>
              )}
              <TabsTrigger 
                value="devices" 
                className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                <Bluetooth className="h-4 w-4" />
                <span className="hidden sm:inline">Devices</span>
                <span className="sm:hidden">Sync</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Tab Content */}
          <div className="animate-fade-in">
            <TabsContent value="plans" className="mt-0">
              <WorkoutPlanSection />
            </TabsContent>

            <TabsContent value="log" className="mt-0">
              <div className="space-y-6">
                <ErgWorkoutSection profile={profile} />
                <MultiSetStrengthForm profile={profile} />
              </div>
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

            {isCoach && (
              <TabsContent value="teams" className="mt-0">
                <TeamsSection profile={profile} isCoach={isCoach} />
              </TabsContent>
            )}

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