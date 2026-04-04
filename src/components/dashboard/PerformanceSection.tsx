import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Dumbbell, Trophy, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { format, subDays, subMonths, parseISO, isAfter } from "date-fns";

interface PerformanceSectionProps {
  profile: any;
}

// Convert interval string to seconds for comparison
const intervalToSeconds = (interval: string | null): number => {
  if (!interval) return 0;
  const str = String(interval).replace(/^00:/, "");
  const parts = str.split(":").map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
};

// Format seconds back to MM:SS
const secondsToTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

// Convert kg to lbs
const kgToLbs = (kg: number) => Math.round(kg * 2.20462);

const PerformanceSection = ({ profile }: PerformanceSectionProps) => {
  const [ergWorkouts, setErgWorkouts] = useState<any[]>([]);
  const [strengthWorkouts, setStrengthWorkouts] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState("30");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile) {
      fetchData();
    }
  }, [profile, dateRange]);

  const fetchData = async () => {
    setLoading(true);
    const daysAgo = parseInt(dateRange);
    const startDate = daysAgo === 365 
      ? subMonths(new Date(), 12).toISOString()
      : subDays(new Date(), daysAgo).toISOString();

    const [ergRes, strengthRes] = await Promise.all([
      supabase
        .from("erg_workouts")
        .select("*")
        .eq("user_id", profile.id)
        .gte("workout_date", startDate.split("T")[0])
        .order("workout_date", { ascending: true }),
      supabase
        .from("strength_workouts")
        .select("*")
        .eq("user_id", profile.id)
        .gte("workout_date", startDate.split("T")[0])
        .order("workout_date", { ascending: true }),
    ]);

    setErgWorkouts(ergRes.data || []);
    setStrengthWorkouts(strengthRes.data || []);
    setLoading(false);
  };

  // Calculate erg PRs
  const ergPRs = useMemo(() => {
    const prs: Record<string, any> = {};
    
    ergWorkouts.forEach((w) => {
      if (!w.distance || !w.avg_split) return;
      
      const splitSeconds = intervalToSeconds(w.avg_split);
      if (splitSeconds === 0) return;

      // Categorize by distance (±5% tolerance)
      let category = "";
      const d = w.distance;
      if (d >= 2000 * 0.95 && d <= 2000 * 1.05) category = "2K";
      else if (d >= 5000 * 0.95 && d <= 5000 * 1.05) category = "5K";
      else if (d >= 6000 * 0.95 && d <= 6000 * 1.05) category = "6K";
      else if (d >= 10000 * 0.95 && d <= 10000 * 1.05) category = "10K";
      
      if (category) {
        if (!prs[category] || splitSeconds < intervalToSeconds(prs[category].avg_split)) {
          prs[category] = w;
        }
      }
    });

    return prs;
  }, [ergWorkouts]);

  // Calculate strength PRs (heaviest weight per exercise)
  const strengthPRs = useMemo(() => {
    const prs: Record<string, any> = {};
    
    strengthWorkouts.forEach((w) => {
      const exercise = w.exercise.toLowerCase();
      if (!prs[exercise] || w.weight > prs[exercise].weight) {
        prs[exercise] = w;
      }
    });

    return Object.entries(prs)
      .sort((a, b) => b[1].weight - a[1].weight)
      .slice(0, 6);
  }, [strengthWorkouts]);

  // Prepare erg chart data
  const ergChartData = useMemo(() => {
    return ergWorkouts
      .filter((w) => w.avg_split)
      .map((w) => ({
        date: format(parseISO(w.workout_date), "MMM d"),
        split: intervalToSeconds(w.avg_split),
        splitDisplay: w.avg_split,
        distance: w.distance || 0,
        type: w.workout_type,
      }));
  }, [ergWorkouts]);

  // Prepare strength chart data (volume = sets * reps * weight)
  const strengthChartData = useMemo(() => {
    const byDate: Record<string, { date: string; volume: number; workouts: number }> = {};
    
    strengthWorkouts.forEach((w) => {
      const dateKey = w.workout_date;
      if (!byDate[dateKey]) {
        byDate[dateKey] = { date: format(parseISO(dateKey), "MMM d"), volume: 0, workouts: 0 };
      }
      byDate[dateKey].volume += w.sets * w.reps * w.weight;
      byDate[dateKey].workouts += 1;
    });

    return Object.values(byDate);
  }, [strengthWorkouts]);

  // Calculate trends
  const calculateTrend = (data: any[], key: string) => {
    if (data.length < 2) return null;
    const recent = data.slice(-5);
    const older = data.slice(0, 5);
    if (recent.length === 0 || older.length === 0) return null;
    
    const recentAvg = recent.reduce((sum, d) => sum + d[key], 0) / recent.length;
    const olderAvg = older.reduce((sum, d) => sum + d[key], 0) / older.length;
    
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
    return change;
  };

  const splitTrend = calculateTrend(ergChartData, "split");
  const volumeTrend = calculateTrend(strengthChartData, "volume");

  const TrendIcon = ({ trend, inverse = false }: { trend: number | null; inverse?: boolean }) => {
    if (trend === null) return <Minus className="h-4 w-4 text-muted-foreground" />;
    const isPositive = inverse ? trend < 0 : trend > 0;
    if (Math.abs(trend) < 1) return <Minus className="h-4 w-4 text-muted-foreground" />;
    return isPositive ? (
      <TrendingUp className="h-4 w-4 text-green-500" />
    ) : (
      <TrendingDown className="h-4 w-4 text-red-500" />
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Card className="animate-pulse">
          <CardContent className="h-64" />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date Range Filter */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Performance Analytics</h2>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 days</SelectItem>
            <SelectItem value="30">30 days</SelectItem>
            <SelectItem value="90">90 days</SelectItem>
            <SelectItem value="365">1 year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* PRs Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Personal Records
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="erg">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="erg">
                <Activity className="h-4 w-4 mr-2" />
                Erg PRs
              </TabsTrigger>
              <TabsTrigger value="strength">
                <Dumbbell className="h-4 w-4 mr-2" />
                Strength PRs
              </TabsTrigger>
            </TabsList>

            <TabsContent value="erg" className="mt-4">
              {Object.keys(ergPRs).length === 0 ? (
                <p className="text-muted-foreground text-center py-6">
                  Log more workouts to track your PRs!
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {Object.entries(ergPRs).map(([distance, workout]) => (
                    <div
                      key={distance}
                      className="p-4 rounded-lg border bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border-yellow-500/20"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-600">
                          {distance}
                        </Badge>
                        <Trophy className="h-4 w-4 text-yellow-500" />
                      </div>
                      <p className="text-2xl font-bold">{workout.avg_split}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(parseISO(workout.workout_date), "MMM d, yyyy")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="strength" className="mt-4">
              {strengthPRs.length === 0 ? (
                <p className="text-muted-foreground text-center py-6">
                  Log strength workouts to track your PRs!
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {strengthPRs.map(([exercise, workout]) => (
                    <div
                      key={exercise}
                      className="p-4 rounded-lg border bg-gradient-to-br from-blue-500/10 to-purple-500/10 border-blue-500/20"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-medium capitalize">{exercise}</h3>
                        <Trophy className="h-4 w-4 text-yellow-500" />
                      </div>
                      <p className="text-2xl font-bold">{kgToLbs(workout.weight)} lbs</p>
                      <p className="text-sm text-muted-foreground">
                        {workout.sets}×{workout.reps} on {format(parseISO(workout.workout_date), "MMM d")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Charts Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Erg Split Chart */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Split Times
              </CardTitle>
              <div className="flex items-center gap-1 text-sm">
                <TrendIcon trend={splitTrend} inverse />
                {splitTrend !== null && (
                  <span className={splitTrend < 0 ? "text-green-500" : splitTrend > 0 ? "text-red-500" : ""}>
                    {Math.abs(splitTrend).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {ergChartData.length === 0 ? (
              <p className="text-muted-foreground text-center py-12">
                No erg data to display
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={ergChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis
                    tickFormatter={(value) => secondsToTime(value)}
                    domain={["dataMin - 5", "dataMax + 5"]}
                    reversed
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-popover border rounded-lg p-3 shadow-lg">
                            <p className="font-medium">{data.date}</p>
                            <p className="text-primary">Split: {secondsToTime(data.split)}</p>
                            {data.distance > 0 && <p className="text-muted-foreground">{data.distance}m</p>}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="split"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))", strokeWidth: 0, r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Strength Volume Chart */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Dumbbell className="h-5 w-5" />
                Training Volume
              </CardTitle>
              <div className="flex items-center gap-1 text-sm">
                <TrendIcon trend={volumeTrend} />
                {volumeTrend !== null && (
                  <span className={volumeTrend > 0 ? "text-green-500" : volumeTrend < 0 ? "text-red-500" : ""}>
                    {Math.abs(volumeTrend).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {strengthChartData.length === 0 ? (
              <p className="text-muted-foreground text-center py-12">
                No strength data to display
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={strengthChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-popover border rounded-lg p-3 shadow-lg">
                            <p className="font-medium">{data.date}</p>
                            <p className="text-primary">Volume: {Math.round(data.volume)} kg</p>
                            <p className="text-muted-foreground">{data.workouts} exercises</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="volume"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stats Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Erg Sessions</p>
              <p className="text-2xl font-bold">{ergWorkouts.length}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Total Distance</p>
              <p className="text-2xl font-bold">
                {(ergWorkouts.reduce((sum, w) => sum + (w.distance || 0), 0) / 1000).toFixed(1)}km
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Strength Sessions</p>
              <p className="text-2xl font-bold">{strengthChartData.length}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Total Volume</p>
              <p className="text-2xl font-bold">
                {(strengthChartData.reduce((sum, d) => sum + d.volume, 0) / 1000).toFixed(0)}t
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PerformanceSection;