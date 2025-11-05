import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { LogOut, Target, Dumbbell, UtensilsCrossed, Users, History } from "lucide-react";
import GoalsSection from "@/components/dashboard/GoalsSection";
import ErgWorkoutSection from "@/components/dashboard/ErgWorkoutSection";
import StrengthWorkoutSection from "@/components/dashboard/StrengthWorkoutSection";
import MealPlanSection from "@/components/dashboard/MealPlanSection";
import FriendsSection from "@/components/dashboard/FriendsSection";
import HistorySection from "@/components/dashboard/HistorySection";

const Dashboard = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
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

    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    setProfile(profileData);
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

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
          <h1 className="text-2xl font-bold gradient-text">Rowing AI Coach</h1>
          <Button onClick={handleLogout} variant="outline" size="sm">
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="today" className="space-y-8">
          <TabsList className="grid grid-cols-4 lg:grid-cols-6 gap-2 bg-card/50 backdrop-blur-sm p-2">
            <TabsTrigger value="today" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              <span className="hidden sm:inline">Today</span>
            </TabsTrigger>
            <TabsTrigger value="goals" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              <span className="hidden sm:inline">Goals</span>
            </TabsTrigger>
            <TabsTrigger value="erg" className="flex items-center gap-2">
              <Dumbbell className="h-4 w-4" />
              <span className="hidden sm:inline">Erg</span>
            </TabsTrigger>
            <TabsTrigger value="strength" className="flex items-center gap-2">
              <Dumbbell className="h-4 w-4" />
              <span className="hidden sm:inline">Strength</span>
            </TabsTrigger>
            <TabsTrigger value="meals" className="flex items-center gap-2">
              <UtensilsCrossed className="h-4 w-4" />
              <span className="hidden sm:inline">Meals</span>
            </TabsTrigger>
            <TabsTrigger value="friends" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Friends</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2 col-span-4 lg:col-span-1">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">History</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="today" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <ErgWorkoutSection profile={profile} />
              <StrengthWorkoutSection profile={profile} />
            </div>
            <MealPlanSection profile={profile} />
          </TabsContent>

          <TabsContent value="goals">
            <GoalsSection profile={profile} />
          </TabsContent>

          <TabsContent value="erg">
            <ErgWorkoutSection profile={profile} fullView />
          </TabsContent>

          <TabsContent value="strength">
            <StrengthWorkoutSection profile={profile} fullView />
          </TabsContent>

          <TabsContent value="meals">
            <MealPlanSection profile={profile} fullView />
          </TabsContent>

          <TabsContent value="friends">
            <FriendsSection profile={profile} />
          </TabsContent>

          <TabsContent value="history">
            <HistorySection profile={profile} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Dashboard;