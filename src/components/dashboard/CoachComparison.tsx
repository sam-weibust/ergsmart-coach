import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Award, Users, TrendingUp, BarChart3, Target } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

export const CoachComparison = () => {
  const [selectedDistance, setSelectedDistance] = useState("2000");

  // Get all teams for comparison
  const { data: allTeams, isLoading } = useQuery({
    queryKey: ["all-teams-comparison"],
    queryFn: async () => {
      const { data: teams, error } = await supabase
        .from("teams")
        .select(`
          id,
          name,
          coach:profiles!teams_coach_id_fkey(full_name, username),
          team_members(
            user_id,
            profile:profiles(full_name, username)
          )
        `);

      if (error) throw error;

      // Get user goals for all team members
      const allMemberIds = teams?.flatMap(team => 
        team.team_members.map((member: any) => member.user_id)
      ) || [];

      const { data: goals } = await supabase
        .from("user_goals")
        .select("*")
        .in("user_id", allMemberIds);

      // Calculate team averages
      const teamsWithStats = teams?.map(team => {
        const memberGoals = team.team_members.map((member: any) => 
          goals?.find(goal => goal.user_id === member.user_id)
        ).filter(Boolean);

        const times2k = memberGoals
          .map(goal => goal?.current_2k_time)
          .filter(Boolean)
          .map(time => timeToSeconds(formatInterval(time)))
          .filter(time => time !== Infinity);

        const times5k = memberGoals
          .map(goal => goal?.current_5k_time)
          .filter(Boolean)
          .map(time => timeToSeconds(formatInterval(time)))
          .filter(time => time !== Infinity);

        const times6k = memberGoals
          .map(goal => goal?.current_6k_time)
          .filter(Boolean)
          .map(time => timeToSeconds(formatInterval(time)))
          .filter(time => time !== Infinity);

        return {
          ...team,
          memberCount: team.team_members.length,
          activeMembers: memberGoals.length,
          avg2k: times2k.length > 0 ? times2k.reduce((a, b) => a + b, 0) / times2k.length : null,
          avg5k: times5k.length > 0 ? times5k.reduce((a, b) => a + b, 0) / times5k.length : null,
          avg6k: times6k.length > 0 ? times6k.reduce((a, b) => a + b, 0) / times6k.length : null,
          best2k: times2k.length > 0 ? Math.min(...times2k) : null,
          best5k: times5k.length > 0 ? Math.min(...times5k) : null,
          best6k: times6k.length > 0 ? Math.min(...times6k) : null,
        };
      }) || [];

      return teamsWithStats;
    },
  });

  // Team rankings based on average times
  const teamRankings = allTeams?.map(team => {
    const avgTime = selectedDistance === "2000" ? team.avg2k : 
                   selectedDistance === "5000" ? team.avg5k : team.avg6k;
    const bestTime = selectedDistance === "2000" ? team.best2k : 
                    selectedDistance === "5000" ? team.best5k : team.best6k;
    
    return {
      ...team,
      avgTime,
      bestTime,
    };
  })
  .filter(team => team.avgTime !== null)
  .sort((a, b) => (a.avgTime || Infinity) - (b.avgTime || Infinity)) || [];

  // Team depth rankings (based on number of active members)
  const depthRankings = allTeams?.slice()
    .sort((a, b) => b.activeMembers - a.activeMembers) || [];

  const formatSecondsToTime = (seconds: number | null): string => {
    if (!seconds) return "-";
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toFixed(1).padStart(4, "0")}`;
  };

  const getDistanceLabel = (meters: string): string => {
    const labels: Record<string, string> = {
      "2000": "2K",
      "5000": "5K", 
      "6000": "6K",
    };
    return labels[meters] || `${meters}m`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <div className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Loading team comparison...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-card border-border">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Team Comparison Dashboard
              </CardTitle>
              <CardDescription>
                Compare team performance and coaching effectiveness
              </CardDescription>
            </div>
            <Select value={selectedDistance} onValueChange={setSelectedDistance}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2000">2K Times</SelectItem>
                <SelectItem value="5000">5K Times</SelectItem>
                <SelectItem value="6000">6K Times</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="performance" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="depth">Team Depth</TabsTrigger>
              <TabsTrigger value="improvement">Progress</TabsTrigger>
            </TabsList>

            <TabsContent value="performance">
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[60px]">Rank</TableHead>
                      <TableHead>Team</TableHead>
                      <TableHead>Coach</TableHead>
                      <TableHead>Avg {getDistanceLabel(selectedDistance)}</TableHead>
                      <TableHead>Best {getDistanceLabel(selectedDistance)}</TableHead>
                      <TableHead>Active Athletes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamRankings.length > 0 ? (
                      teamRankings.map((team, index) => (
                        <TableRow 
                          key={team.id}
                          className={index < 3 ? "bg-primary/5" : ""}
                        >
                          <TableCell>
                            <div className="flex items-center justify-center">
                              {getRankIcon(index)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{team.name}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-muted-foreground">
                              {team.coach?.full_name || team.coach?.username || "Unknown"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-mono font-bold">
                              {formatSecondsToTime(team.avgTime)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-mono text-sm text-green-600">
                              {formatSecondsToTime(team.bestTime)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {team.activeMembers}/{team.memberCount}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No teams with recorded {getDistanceLabel(selectedDistance)} times yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="depth">
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[60px]">Rank</TableHead>
                      <TableHead>Team</TableHead>
                      <TableHead>Coach</TableHead>
                      <TableHead>Total Members</TableHead>
                      <TableHead>Active Members</TableHead>
                      <TableHead>Activity Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {depthRankings.map((team, index) => {
                      const activityRate = team.memberCount > 0 
                        ? (team.activeMembers / team.memberCount) * 100 
                        : 0;
                      
                      return (
                        <TableRow 
                          key={team.id}
                          className={index < 3 ? "bg-primary/5" : ""}
                        >
                          <TableCell>
                            <div className="flex items-center justify-center">
                              {index < 3 ? getRankIcon(index) : (
                                <span className="w-5 text-center font-bold text-muted-foreground">
                                  {index + 1}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{team.name}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-muted-foreground">
                              {team.coach?.full_name || team.coach?.username || "Unknown"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              <Users className="h-3 w-3 mr-1" />
                              {team.memberCount}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              <Target className="h-3 w-3 mr-1" />
                              {team.activeMembers}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-muted rounded-full h-2">
                                <div 
                                  className="bg-primary h-2 rounded-full transition-all"
                                  style={{ width: `${activityRate}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium w-12">
                                {activityRate.toFixed(0)}%
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="improvement">
              <div className="text-center py-8 text-muted-foreground">
                <TrendingUp className="h-12 w-12 mx-auto mb-2" />
                <p>Team progress tracking coming soon!</p>
                <p className="text-sm">Track improvement rates, goal achievement, and training consistency.</p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};