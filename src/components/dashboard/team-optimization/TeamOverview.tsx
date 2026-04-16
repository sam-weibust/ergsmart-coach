import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Users, BarChart3, Activity, Ship } from "lucide-react";
import { Leaderboard } from "@/components/dashboard/Leaderboard";
import { TeamGoals } from "@/components/dashboard/TeamGoals";
import { TeamWorkoutPlanSection } from "@/components/dashboard/TeamWorkoutPlanSection";
import { TeamAnalytics } from "@/components/dashboard/TeamAnalytics";

interface Props {
  teamId: string;
  teamName: string;
  teamMembers: any[];
  isCoach: boolean;
  profile: any;
}

const TeamOverview = ({ teamId, teamName, teamMembers, isCoach, profile }: Props) => {
  const { data: recentScores } = useQuery({
    queryKey: ["team-erg-scores-summary", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("erg_scores")
        .select("*")
        .eq("team_id", teamId)
        .eq("test_type", "2k")
        .order("recorded_at", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  const { data: lineups } = useQuery({
    queryKey: ["team-lineups-count", teamId],
    queryFn: async () => {
      const { count } = await supabase
        .from("boat_lineups")
        .select("*", { count: "exact", head: true })
        .eq("team_id", teamId);
      return count || 0;
    },
  });

  const avgWatts = recentScores?.length
    ? (recentScores.reduce((sum, s) => sum + (Number(s.watts) || 0), 0) / recentScores.length).toFixed(0)
    : null;

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Athletes</span>
            </div>
            <p className="text-2xl font-bold">{teamMembers.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Avg 2K Watts</span>
            </div>
            <p className="text-2xl font-bold">{avgWatts || "—"}W</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Ship className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Saved Lineups</span>
            </div>
            <p className="text-2xl font-bold">{lineups ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Erg Scores Logged</span>
            </div>
            <p className="text-2xl font-bold">{recentScores?.length ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Leaderboard teamId={teamId} teamName={teamName} />
        <TeamGoals teamId={teamId} isCoach={isCoach} currentUserId={profile.id} />
      </div>

      <TeamAnalytics teamId={teamId} teamName={teamName} />

      {isCoach && (
        <TeamWorkoutPlanSection teamId={teamId} teamName={teamName} profile={profile} />
      )}
    </div>
  );
};

export default TeamOverview;
