import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, Calendar, User, Users, Bluetooth, History, UsersRound } from "lucide-react";
import { WorkoutPlanSection } from "@/components/dashboard/WorkoutPlanSection";
import { ProfileSection } from "@/components/dashboard/ProfileSection";
import FriendsSection from "@/components/dashboard/FriendsSection";
import DeviceSection from "@/components/dashboard/DeviceSection";
import HistorySection from "@/components/dashboard/HistorySection";
import TeamsSection from "@/components/dashboard/TeamsSection";
import crewsyncLogo from "@/assets/crewsync-logo-full.jpg";

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      navigate("/auth");
      return;
    }

    setLoading(false);
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
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img src={crewsyncLogo} alt="CrewSync" className="h-10 rounded-md" />
          </div>
          <Button onClick={handleLogout} variant="outline" size="sm">
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="plans" className="space-y-6">
          <TabsList className="flex-wrap">
            <TabsTrigger value="plans" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Training Plans
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              History
            </TabsTrigger>
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="friends" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Friends
            </TabsTrigger>
            {isCoach && (
              <TabsTrigger value="teams" className="flex items-center gap-2">
                <UsersRound className="h-4 w-4" />
                Teams
              </TabsTrigger>
            )}
            <TabsTrigger value="devices" className="flex items-center gap-2">
              <Bluetooth className="h-4 w-4" />
              Devices
            </TabsTrigger>
          </TabsList>

          <TabsContent value="plans">
            <WorkoutPlanSection />
          </TabsContent>

          <TabsContent value="history">
            <HistorySection profile={profile} />
          </TabsContent>

          <TabsContent value="profile">
            <ProfileSection />
          </TabsContent>

          <TabsContent value="friends">
            <FriendsSection profile={profile} />
          </TabsContent>

          {isCoach && (
            <TabsContent value="teams">
              <TeamsSection profile={profile} isCoach={isCoach} />
            </TabsContent>
          )}

          <TabsContent value="devices">
            <DeviceSection />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Dashboard;