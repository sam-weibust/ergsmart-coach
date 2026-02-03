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
        <div className="animate-pulse text-primary">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile-optimized header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-3 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <img src={crewsyncLogo} alt="CrewSync" className="h-8 w-8 rounded-md" />
            <span className="font-semibold text-lg hidden sm:inline">CrewSync</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NotificationBell />
            <Button onClick={handleLogout} variant="outline" size="sm">
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 py-4 pb-20 md:pb-8">
        <Tabs defaultValue="plans" className="space-y-4">
          {/* Mobile-friendly tabs - scrollable horizontally on mobile */}
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
            <TabsTrigger value="plans" className="flex items-center gap-1.5 text-xs sm:text-sm px-3">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Training</span>
              <span className="sm:hidden">Plans</span>
            </TabsTrigger>
            <TabsTrigger value="log" className="flex items-center gap-1.5 text-xs sm:text-sm px-3">
              <PlusCircle className="h-4 w-4" />
              <span>Log</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1.5 text-xs sm:text-sm px-3">
              <History className="h-4 w-4" />
              <span>History</span>
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex items-center gap-1.5 text-xs sm:text-sm px-3">
              <BarChart3 className="h-4 w-4" />
              <span>Stats</span>
            </TabsTrigger>
            <TabsTrigger value="compare" className="flex items-center gap-1.5 text-xs sm:text-sm px-3">
              <GitCompare className="h-4 w-4" />
              <span>Compare</span>
            </TabsTrigger>
            <TabsTrigger value="awards" className="flex items-center gap-1.5 text-xs sm:text-sm px-3">
              <Trophy className="h-4 w-4" />
              <span>Awards</span>
            </TabsTrigger>
            <TabsTrigger value="profile" className="flex items-center gap-1.5 text-xs sm:text-sm px-3">
              <User className="h-4 w-4" />
              <span>Profile</span>
            </TabsTrigger>
            <TabsTrigger value="friends" className="flex items-center gap-1.5 text-xs sm:text-sm px-3">
              <MessageCircle className="h-4 w-4" />
              <span>Friends</span>
            </TabsTrigger>
            {isCoach && (
              <TabsTrigger value="teams" className="flex items-center gap-1.5 text-xs sm:text-sm px-3">
                <UsersRound className="h-4 w-4" />
                <span>Teams</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="devices" className="flex items-center gap-1.5 text-xs sm:text-sm px-3">
              <Bluetooth className="h-4 w-4" />
              <span className="hidden sm:inline">Devices</span>
              <span className="sm:hidden">Sync</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="plans" className="mt-4">
            <WorkoutPlanSection />
          </TabsContent>

          <TabsContent value="log" className="mt-4">
            <div className="space-y-6">
              <ErgWorkoutSection profile={profile} />
              <MultiSetStrengthForm profile={profile} />
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <HistorySection profile={profile} />
          </TabsContent>

          <TabsContent value="stats" className="mt-4">
            <PerformanceSection profile={profile} />
          </TabsContent>

          <TabsContent value="compare" className="mt-4">
            <ComparisonSection profile={profile} />
          </TabsContent>

          <TabsContent value="awards" className="mt-4">
            <AwardsSection profile={profile} />
          </TabsContent>

          <TabsContent value="profile" className="mt-4">
            <ProfileSection />
          </TabsContent>

          <TabsContent value="friends" className="mt-4">
            <FriendsSection profile={profile} />
          </TabsContent>

          {isCoach && (
            <TabsContent value="teams" className="mt-4">
              <TeamsSection profile={profile} isCoach={isCoach} />
            </TabsContent>
          )}

          <TabsContent value="devices" className="mt-4">
            <DeviceSection />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Dashboard;
