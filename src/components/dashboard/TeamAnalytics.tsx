import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy, Medal, Award, Target, TrendingUp, Activity, Calendar, CheckCircle } from "lucide-react";

interface TeamAnalyticsProps {
  teamId: string;
  teamName: string;
}

const formatInterval = (interval: string | null): string => {
  if (!interval) return "-";
  const match = interval.match(/(\d+):(\d+):(\d+\.?\d*)/);
  if (match) {
    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const seconds = parseFloat(match[3]);
    const totalMinutes = hours * 60 + minutes;
    return `${totalMinutes}:${seconds.toFixed(1).padStart(4, "0")}`;
  }
  return interval;
};

const timeToSeconds = (timeString: string): number => {
  const match = timeString.match(/(\d+):(\d+\.?\d*)/);
  if (match) {
    const minutes = parseInt(match[1]);
    const seconds = parseFloat(match[2]);
    return minutes * 60 + seconds;
  }
  return Infinity;
};

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

export const TeamAnalytics = ({ teamId, teamName }: TeamAnalyticsProps) => {
  const [selectedPeriod, setSelectedPeriod] = useState("30");

  const { data: teamStats } = useQuery({
    queryKey: ["team-analytics", teamId, selectedPeriod],
    queryFn: async () => {
      const daysAgo = parseInt(selectedPeriod);
      const cutoffDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

      // Get team members
      const { data: members } = await supabase
        .from("team_members")
        .select("user_id, profile:profiles(id, full_name, username)")
        .eq("team_id", teamId);

      if (!members?.length) return null;

      const memberIds = members.map((m: any) => m.user_id);

      // Get recent workouts
      const { data: ergWorkouts } = await supabase
        .from("erg_workouts")
        .select("*")
        .in("user_id", memberIds)
        .gte("created_at", cutoffDate);

      const { data: strengthWorkouts } = await supabase
        .from("strength_workouts")
        .select("*")
        .in("user_id", memberIds)
        .gte("created_at", cutoffDate);

      // Get goals for all members
      const { data: goals } = await supabase
        .from("user_goals")
        .select("*")
        .in("user_id", memberIds);

      // Calculate member stats
      const memberStats = members.map((member: any) => {
        const userGoals = goals?.find((g: any) => g.user_id === member.user_id);
        const userErgWorkouts = ergWorkouts?.filter(w => w.user_id === member.user_id) || [];
        const userStrengthWorkouts = strengthWorkouts?.filter(w => w.user_id === member.user_id) || [];

        const totalWorkouts = userErgWorkouts.length + userStrengthWorkouts.length;
        const avgWorkoutsPerWeek = totalWorkouts / (daysAgo / 7);

        // Calculate 2K progress (if any 2K workouts)
        const twokWorkouts = userErgWorkouts.filter(w => w.distance === 2000 && w.duration);
        const bestRecent2K = twokWorkouts.length > 0 
          ? Math.min(...twokWorkouts.map(w => timeToSeconds(formatInterval(w.duration))))
          : null;
        
        const current2K = userGoals?.current_2k_time 
          ? timeToSeconds(formatInterval(userGoals.current_2k_time))
          : null;

        const improvement = bestRecent2K && current2K && bestRecent2K < current2K;

        return {
          ...member,
          totalWorkouts,
          avgWorkoutsPerWeek,
          hasGoals: !!userGoals,
          time2k: userGoals?.current_2k_time,
          time5k: userGoals?.current_5k_time,
          time6k: userGoals?.current_6k_time,
          bestRecent2K,
          improvement,
          ergWorkouts: userErgWorkouts.length,
          strengthWorkouts: userStrengthWorkouts.length,
        };
      });

      // Calculate team averages
      const activeMembersCount = memberStats.filter(m => m.totalWorkouts > 0).length;
      const avgWorkoutsPerMember = memberStats.reduce((sum, m) => sum + m.totalWorkouts, 0) / members.length;
      
      const times2k = memberStats
        .map(m => m.time2k)
        .filter(Boolean)
        .map(time => timeToSeconds(formatInterval(time)))
        .filter(time => time !== Infinity);

      const teamAvg2K = times2k.length > 0 ? times2k.reduce((a, b) => a + b, 0) / times2k.length : null;
      
      return {
        members: memberStats,
        totalMembers: members.length,
        activeMembers: activeMembersCount,
        activityRate: (activeMembersCount / members.length) * 100,
        avgWorkoutsPerMember,
        teamAvg2K,
        improvingMembers: memberStats.filter(m => m.improvement).length,
        totalWorkouts: ergWorkouts?.length + strengthWorkouts?.length || 0,
      };
    },
  });

  const formatSecondsToTime = (seconds: number | null): string => {
    if (!seconds) return "-";
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toFixed(1).padStart(4, "0")}`;
  };

  if (!teamStats) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No team data available
        </CardContent>
      </Card>
    );
  }

  // Sort members by activity
  const sortedMembers = teamStats.members.slice().sort((a, b) => b.totalWorkouts - a.totalWorkouts);

  return (
    <div className="space-y-4">
      {/* Team Overview */}
      <Card className="shadow-card border-border">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-5 w-5 text-primary" />
                {teamName} Analytics
              </CardTitle>
              <CardDescription>Team performance insights</CardDescription>
            </div>
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-primary/5 rounded-xl border border-primary/20">
              <div className="text-2xl font-bold text-primary">{teamStats.activeMembers}</div>
              <div className="text-sm text-muted-foreground">Active Athletes</div>
              <div className="text-xs text-muted-foreground mt-1">
                {teamStats.activityRate.toFixed(0)}% of team
              </div>
            </div>
            
            <div className="text-center p-4 bg-green-500/5 rounded-xl border border-green-500/20">
              <div className="text-2xl font-bold text-green-600">{teamStats.totalWorkouts}</div>
              <div className="text-sm text-muted-foreground">Total Workouts</div>
              <div className="text-xs text-muted-foreground mt-1">
                {teamStats.avgWorkoutsPerMember.toFixed(1)} per member
              </div>
            </div>
            
            <div className="text-center p-4 bg-blue-500/5 rounded-xl border border-blue-500/20">
              <div className="text-2xl font-bold text-blue-600">
                {formatSecondsToTime(teamStats.teamAvg2K)}
              </div>
              <div className="text-sm text-muted-foreground">Avg 2K Time</div>
              <div className="text-xs text-muted-foreground mt-1">Team average</div>
            </div>
            
            <div className="text-center p-4 bg-amber-500/5 rounded-xl border border-amber-500/20">
              <div className="text-2xl font-bold text-amber-600">{teamStats.improvingMembers}</div>
              <div className="text-sm text-muted-foreground">Improving</div>
              <div className="text-xs text-muted-foreground mt-1">Recent PRs</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Member Performance */}
      <Card className="shadow-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-5 w-5 text-primary" />
            Member Activity Rankings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="grid grid-cols-6 gap-2 text-xs font-medium text-muted-foreground px-2 pb-2 border-b">
              <span>Rank</span>
              <span className="col-span-2">Athlete</span>
              <span className="text-center">Workouts</span>
              <span className="text-center">2K Time</span>
              <span className="text-center">Status</span>
            </div>
            
            {sortedMembers.map((member, index) => (
              <div
                key={member.user_id}
                className={`grid grid-cols-6 gap-2 items-center p-2 rounded-lg ${
                  index === 0 ? "bg-yellow-500/10" : index < 3 ? "bg-muted/50" : ""
                }`}
              >
                <div className="flex items-center justify-center">
                  {getRankIcon(index)}
                </div>
                <div className="col-span-2">
                  <div className="text-sm font-medium truncate">
                    {member.profile?.full_name || member.profile?.username || "Unknown"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {member.avgWorkoutsPerWeek.toFixed(1)}/week
                  </div>
                </div>
                <div className="text-center">
                  <Badge variant={member.totalWorkouts > 0 ? "default" : "secondary"}>
                    {member.totalWorkouts}
                  </Badge>
                </div>
                <div className="text-center text-sm font-mono">
                  {formatInterval(member.time2k)}
                </div>
                <div className="text-center">
                  {member.improvement ? (
                    <TrendingUp className="h-4 w-4 text-green-500 mx-auto" />
                  ) : member.hasGoals ? (
                    <Target className="h-4 w-4 text-blue-500 mx-auto" />
                  ) : (
                    <Calendar className="h-4 w-4 text-muted-foreground mx-auto" />
                  )}
                </div>
              </div>
            ))}
            
            {sortedMembers.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-4">
                No member data available for this period.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};