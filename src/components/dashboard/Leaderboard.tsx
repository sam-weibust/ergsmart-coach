import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Award } from "lucide-react";

interface LeaderboardProps {
  teamId: string;
  teamName: string;
}

export const Leaderboard = ({ teamId, teamName }: LeaderboardProps) => {
  const { data: leaderboard } = useQuery({
    queryKey: ["leaderboard", teamId],
    queryFn: async () => {
      // Get team members
      const { data: members } = await supabase
        .from("team_members")
        .select("user_id, profile:profiles(id, full_name, username)")
        .eq("team_id", teamId);

      if (!members?.length) return [];

      const memberIds = members.map((m: any) => m.user_id);

      // Get goals for all members
      const { data: goals } = await supabase
        .from("user_goals")
        .select("*")
        .in("user_id", memberIds);

      // Get coach
      const { data: team } = await supabase
        .from("teams")
        .select("coach_id, coach:profiles!teams_coach_id_fkey(id, full_name, username)")
        .eq("id", teamId)
        .single();

      // Build leaderboard
      const entries = members.map((m: any) => {
        const userGoals = goals?.find((g: any) => g.user_id === m.user_id);
        return {
          userId: m.user_id,
          name: m.profile?.full_name || m.profile?.username || "Unknown",
          time2k: userGoals?.current_2k_time,
          time5k: userGoals?.current_5k_time,
          time6k: userGoals?.current_6k_time,
        };
      });

      // Add coach if has goals
      if (team?.coach) {
        const coachGoals = goals?.find((g: any) => g.user_id === team.coach_id);
        if (coachGoals) {
          entries.push({
            userId: team.coach_id,
            name: `${team.coach.full_name || team.coach.username} (Coach)`,
            time2k: coachGoals.current_2k_time,
            time5k: coachGoals.current_5k_time,
            time6k: coachGoals.current_6k_time,
          });
        }
      }

      // Sort by 2K time (fastest first)
      return entries.sort((a, b) => {
        if (!a.time2k && !b.time2k) return 0;
        if (!a.time2k) return 1;
        if (!b.time2k) return -1;
        return String(a.time2k).localeCompare(String(b.time2k));
      });
    },
  });

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Trophy className="h-5 w-5 text-yellow-500" />;
      case 1:
        return <Medal className="h-5 w-5 text-gray-400" />;
      case 2:
        return <Award className="h-5 w-5 text-amber-600" />;
      default:
        return <span className="w-5 text-center font-bold text-muted-foreground">{index + 1}</span>;
    }
  };

  const formatTime = (time: any) => {
    if (!time) return "-";
    return String(time);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-5 w-5 text-primary" />
          {teamName} Leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {/* Header */}
          <div className="grid grid-cols-5 gap-2 text-xs font-medium text-muted-foreground px-2 pb-2 border-b">
            <span className="col-span-2">Athlete</span>
            <span className="text-center">2K</span>
            <span className="text-center">5K</span>
            <span className="text-center">6K</span>
          </div>
          
          {leaderboard?.map((entry, index) => (
            <div
              key={entry.userId}
              className={`grid grid-cols-5 gap-2 items-center p-2 rounded-lg ${
                index === 0 ? "bg-yellow-500/10" : index < 3 ? "bg-muted/50" : ""
              }`}
            >
              <div className="col-span-2 flex items-center gap-2">
                {getRankIcon(index)}
                <span className="text-sm font-medium truncate">{entry.name}</span>
              </div>
              <Badge variant="outline" className="text-xs justify-center">
                {formatTime(entry.time2k)}
              </Badge>
              <Badge variant="outline" className="text-xs justify-center">
                {formatTime(entry.time5k)}
              </Badge>
              <Badge variant="outline" className="text-xs justify-center">
                {formatTime(entry.time6k)}
              </Badge>
            </div>
          ))}
          
          {(!leaderboard || leaderboard.length === 0) && (
            <p className="text-center text-muted-foreground text-sm py-4">
              No members with recorded times yet.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
