import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Upload, ShieldCheck } from "lucide-react";
import { GlobalLeaderboard } from "./GlobalLeaderboard";
import { SubmitVerifiedTime } from "./SubmitVerifiedTime";
import { TimeVerificationAdmin } from "./TimeVerificationAdmin";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MySubmissions } from "./MySubmissions";

export const LeaderboardSection = () => {
  // Check if user is admin
  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      return !!data;
    },
  });

  return (
    <div className="space-y-6">
      <Tabs defaultValue="leaderboard" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-flex">
          <TabsTrigger value="leaderboard" className="gap-2">
            <Trophy className="h-4 w-4" />
            <span className="hidden sm:inline">Leaderboard</span>
          </TabsTrigger>
          <TabsTrigger value="submit" className="gap-2">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Submit</span>
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="verify" className="gap-2">
              <ShieldCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Verify</span>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="leaderboard" className="space-y-4">
          <GlobalLeaderboard />
        </TabsContent>

        <TabsContent value="predictor" className="space-y-4">
          <ErgPredictor />
        </TabsContent>

        <TabsContent value="submit" className="space-y-4">
          <SubmitVerifiedTime />
          <MySubmissions />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="verify" className="space-y-4">
            <TimeVerificationAdmin />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};
