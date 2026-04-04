import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Users, Trophy, TrendingUp, ArrowUp, ArrowDown, Minus, Eye, EyeOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface ComparisonSectionProps {
  profile: any;
}

const parseIntervalToSeconds = (interval: string | null): number => {
  if (!interval) return 0;
  const match = interval.toString().match(/(\d+):(\d+(?:\.\d+)?)/);
  if (match) {
    return parseInt(match[1]) * 60 + parseFloat(match[2]);
  }
  return 0;
};

const formatTime = (seconds: number): string => {
  if (!seconds) return "-";
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return `${mins}:${secs.padStart(4, "0")}`;
};

export const ComparisonSection = ({ profile }: ComparisonSectionProps) => {
  const [comparisonType, setComparisonType] = useState<"friends" | "team">("friends");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [dateRange, setDateRange] = useState<"7" | "30" | "90" | "365">("30");
  const [showComparison, setShowComparison] = useState(true);

  const isCoach = profile?.user_type === "coach";

  // Bug fix #5: fetch friendships in both directions
  const { data: friends } = useQuery({
    queryKey: ["friends-for-comparison"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Fetch both directions
      const [res1, res2] = await Promise.all([
        supabase
          .from("friendships")
          .select("*, friend:profiles!friendships_friend_id_fkey(id, full_name, email)")
          .eq("user_id", user.id)
          .eq("status", "accepted"),
        supabase
          .from("friendships")
          .select("*, friend:profiles!friendships_user_id_fkey(id, full_name, email)")
          .eq("friend_id", user.id)
          .eq("status", "accepted"),
      ]);

      const allFriends = [...(res1.data || []), ...(res2.data || [])];
      // Deduplicate by friend id
      const seen = new Set<string>();
      return allFriends.filter(f => {
        const friendId = f.friend?.id;
        if (!friendId || seen.has(friendId)) return false;
        seen.add(friendId);
        return true;
      });
    },
  });

  // Get teams (for coaches)
  const { data: teams } = useQuery({
    queryKey: ["teams-for-comparison"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data } = await supabase
        .from("teams")
        .select("*, team_members(user_id, profiles:profiles(id, full_name, email))")
        .eq("coach_id", user.id);

      return data || [];
    },
    enabled: isCoach,
  });

  // Get comparison data
  const { data: comparisonData, isLoading } = useQuery({
    queryKey: ["comparison-data", comparisonType, selectedTeamId, dateRange, profile?.id],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(dateRange));

      let userIds: string[] = [user.id];
      let users: { id: string; name: string }[] = [{ id: user.id, name: "You" }];

      if (comparisonType === "friends" && friends) {
        friends.forEach((f: any) => {
          if (f.friend) {
            userIds.push(f.friend.id);
            users.push({ id: f.friend.id, name: f.friend.full_name || f.friend.email });
          }
        });
      } else if (comparisonType === "team" && selectedTeamId) {
        const team = teams?.find((t: any) => t.id === selectedTeamId);
        if (team?.team_members) {
          team.team_members.forEach((m: any) => {
            if (m.profiles && m.user_id !== user.id) {
              userIds.push(m.user_id);
              users.push({ id: m.user_id, name: m.profiles.full_name || m.profiles.email });
            }
          });
        }
      }

      const { data: ergWorkouts } = await supabase
        .from("erg_workouts")
        .select("*")
        .in("user_id", userIds)
        .gte("workout_date", startDate.toISOString().split("T")[0])
        .order("workout_date", { ascending: true });

      const { data: strengthWorkouts } = await supabase
        .from("strength_workouts")
        .select("*")
        .in("user_id", userIds)
        .gte("workout_date", startDate.toISOString().split("T")[0])
        .order("workout_date", { ascending: true });

      const { data: goals } = await supabase
        .from("user_goals")
        .select("*")
        .in("user_id", userIds);

      const userStats = users.map((u) => {
        const userErg = ergWorkouts?.filter((w) => w.user_id === u.id) || [];
        const userStrength = strengthWorkouts?.filter((w) => w.user_id === u.id) || [];
        const userGoal = goals?.find((g) => g.user_id === u.id);

        const testWorkouts = userErg.filter((w) => w.workout_type === "test");
        const best2kSeconds = testWorkouts.reduce((best, w) => {
          const seconds = parseIntervalToSeconds(w.avg_split as string);
          return seconds && (best === 0 || seconds < best) ? seconds : best;
        }, 0);

        const totalMeters = userErg.reduce((sum, w) => sum + (w.distance || 0), 0);
        const totalWorkouts = userErg.length + userStrength.length;
        const weeksInRange = parseInt(dateRange) / 7;
        const avgWeeklyWorkouts = totalWorkouts / weeksInRange;

        const current2k = userGoal?.current_2k_time 
          ? parseIntervalToSeconds(userGoal.current_2k_time as string) 
          : best2kSeconds;

        return {
          name: u.name,
          userId: u.id,
          totalMeters,
          totalWorkouts,
          avgWeeklyWorkouts: Math.round(avgWeeklyWorkouts * 10) / 10,
          best2k: best2kSeconds,
          current2k,
          ergWorkouts: userErg.length,
          strengthWorkouts: userStrength.length,
        };
      });

      const weeklyData: any[] = [];
      const weeksCount = Math.ceil(parseInt(dateRange) / 7);
      
      for (let i = 0; i < weeksCount; i++) {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - parseInt(dateRange) + (i * 7));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        
        const weekData: any = { week: `Week ${i + 1}` };
        
        users.forEach((u) => {
          const weekErg = ergWorkouts?.filter((w) => {
            const workoutDate = new Date(w.workout_date);
            return w.user_id === u.id && 
                   workoutDate >= weekStart && 
                   workoutDate < weekEnd;
          }) || [];
          weekData[u.name] = weekErg.reduce((sum, w) => sum + (w.distance || 0), 0);
        });
        
        weeklyData.push(weekData);
      }

      return { userStats, weeklyData, users };
    },
    enabled: !!profile?.id && (comparisonType === "friends" || (comparisonType === "team" && !!selectedTeamId)),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Performance Comparison
              </CardTitle>
              <CardDescription>
                Compare your progress with friends or teammates
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="show-comparison" className="text-sm text-muted-foreground">
                {showComparison ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Label>
              <Switch
                id="show-comparison"
                checked={showComparison}
                onCheckedChange={setShowComparison}
              />
            </div>
          </div>
        </CardHeader>
        {showComparison && (
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Select value={comparisonType} onValueChange={(v: "friends" | "team") => setComparisonType(v)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="friends">Friends</SelectItem>
                {isCoach && <SelectItem value="team">Team</SelectItem>}
              </SelectContent>
            </Select>

            {comparisonType === "team" && teams && teams.length > 0 && (
              <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team: any) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={dateRange} onValueChange={(v: any) => setDateRange(v)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 Days</SelectItem>
                <SelectItem value="30">30 Days</SelectItem>
                <SelectItem value="90">90 Days</SelectItem>
                <SelectItem value="365">1 Year</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          )}

          {!isLoading && comparisonData && (
            <Tabs defaultValue="leaderboard" className="space-y-4">
              <TabsList>
                <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
                <TabsTrigger value="volume">Volume Chart</TabsTrigger>
              </TabsList>

              <TabsContent value="leaderboard">
                <div className="space-y-4">
                  <div className="border rounded-lg p-4">
                    <h4 className="font-semibold flex items-center gap-2 mb-3">
                      <Trophy className="h-4 w-4 text-primary" />
                      2K Split Leaderboard
                    </h4>
                    <div className="space-y-2">
                      {[...comparisonData.userStats]
                        .filter((u) => u.current2k > 0)
                        .sort((a, b) => a.current2k - b.current2k)
                        .map((user, idx) => (
                          <div
                            key={user.userId}
                            className={`flex items-center justify-between p-2 rounded ${
                              idx === 0 ? "bg-primary/10 border border-primary/30" : "bg-muted/50"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Badge variant={idx === 0 ? "default" : "secondary"} className="w-6 h-6 rounded-full p-0 flex items-center justify-center">
                                {idx + 1}
                              </Badge>
                              <span className={user.name === "You" ? "font-semibold" : ""}>{user.name}</span>
                            </div>
                            <span className="font-mono">{formatTime(user.current2k)}/500m</span>
                          </div>
                        ))}
                      {comparisonData.userStats.filter((u) => u.current2k > 0).length === 0 && (
                        <p className="text-muted-foreground text-sm text-center py-4">
                          No 2K times recorded yet
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h4 className="font-semibold flex items-center gap-2 mb-3">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      Training Volume (Last {dateRange} Days)
                    </h4>
                    <div className="space-y-2">
                      {[...comparisonData.userStats]
                        .sort((a, b) => b.totalMeters - a.totalMeters)
                        .map((user, idx) => (
                          <div
                            key={user.userId}
                            className={`flex items-center justify-between p-2 rounded ${
                              idx === 0 ? "bg-primary/10 border border-primary/30" : "bg-muted/50"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Badge variant={idx === 0 ? "default" : "secondary"} className="w-6 h-6 rounded-full p-0 flex items-center justify-center">
                                {idx + 1}
                              </Badge>
                              <span className={user.name === "You" ? "font-semibold" : ""}>{user.name}</span>
                            </div>
                            <div className="text-right">
                              <div className="font-mono">{(user.totalMeters / 1000).toFixed(1)}km</div>
                              <div className="text-xs text-muted-foreground">
                                {user.totalWorkouts} workouts ({user.avgWeeklyWorkouts}/wk)
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="volume">
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={comparisonData.weeklyData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="week" className="text-xs" />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}km`} className="text-xs" />
                      <Tooltip
                        formatter={(value: number) => [`${(value / 1000).toFixed(1)}km`, ""]}
                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                      />
                      <Legend />
                      {comparisonData.users.map((u, idx) => (
                        <Bar
                          key={u.id}
                          dataKey={u.name}
                          fill={idx === 0 ? "hsl(var(--primary))" : `hsl(${idx * 60}, 70%, 50%)`}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>
            </Tabs>
          )}

          {!isLoading && (!friends?.length || (comparisonType === "team" && !selectedTeamId)) && (
            <div className="text-center py-8 text-muted-foreground">
              {comparisonType === "friends" 
                ? "Add friends to compare your progress"
                : "Select a team to compare performance"
              }
            </div>
          )}
        </CardContent>
        )}
      </Card>
    </div>
  );
};

export default ComparisonSection;
