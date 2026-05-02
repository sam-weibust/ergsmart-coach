import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Ship, TrendingDown, Activity, Users } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatSplit } from "./constants";

interface Props {
  teamId: string;
  isCoach: boolean;
  boats: any[];
  seasonId?: string | null;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const BoatPerformanceHistory = ({ teamId, isCoach, boats, seasonId }: Props) => {
  const activeBoats = boats.filter((b: any) => b.is_active);
  const [selectedBoatId, setSelectedBoatId] = useState<string>(activeBoats[0]?.id || "");

  const { data: results = [] } = useQuery({
    queryKey: ["boat-perf-results", teamId, selectedBoatId, seasonId],
    queryFn: async () => {
      if (!selectedBoatId) return [];
      let q = supabase
        .from("onwater_results")
        .select("*")
        .eq("team_id", teamId)
        .eq("boat_id", selectedBoatId)
        .order("result_date", { ascending: true });
      if (seasonId) q = q.eq("season_id", seasonId);
      const { data } = await q;
      return data || [];
    },
    enabled: !!selectedBoatId,
  });

  const { data: lineups = [] } = useQuery({
    queryKey: ["boat-perf-lineups", teamId, selectedBoatId, seasonId],
    queryFn: async () => {
      if (!selectedBoatId) return [];
      let q = supabase
        .from("boat_lineups")
        .select("*")
        .eq("team_id", teamId)
        .eq("boat_id", selectedBoatId)
        .not("published_at", "is", null);
      if (seasonId) q = q.eq("season_id", seasonId);
      const { data } = await q;
      return data || [];
    },
    enabled: !!selectedBoatId,
  });

  const { data: attendanceData = [] } = useQuery({
    queryKey: ["boat-perf-attendance", lineups.map((l: any) => l.id)],
    queryFn: async () => {
      const ids = lineups.map((l: any) => l.id);
      if (!ids.length) return [];
      const { data } = await supabase
        .from("practice_attendance")
        .select("*")
        .in("lineup_id", ids);
      return data || [];
    },
    enabled: lineups.length > 0,
  });

  const selectedBoat = boats.find((b: any) => b.id === selectedBoatId);

  // Stats
  const totalPractices = lineups.length;
  const totalMeters = useMemo(() => results.reduce((sum: number, r: any) => sum + (r.distance_meters || 0), 0), [results]);

  // Avg split trend for chart
  const chartData = useMemo(() => {
    return results
      .filter((r: any) => r.avg_split_seconds)
      .map((r: any) => ({
        date: new Date(r.result_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        split: parseFloat(r.avg_split_seconds),
        splitLabel: formatSplit(parseFloat(r.avg_split_seconds)),
      }));
  }, [results]);

  // Best session
  const bestSession = useMemo(() => {
    return results.reduce((best: any, r: any) => {
      if (!r.avg_split_seconds) return best;
      if (!best || r.avg_split_seconds < best.avg_split_seconds) return r;
      return best;
    }, null);
  }, [results]);

  // Most used lineup fingerprint
  const mostUsedLineup = useMemo(() => {
    if (!lineups.length) return null;
    const fpCounts: Record<string, { count: number; names: string }> = {};
    for (const l of lineups) {
      const seats: any[] = Array.isArray(l.seats) ? l.seats : [];
      const fp = seats.filter((s: any) => s.user_id).map((s: any) => s.user_id).sort().join(",");
      const names = seats.filter((s: any) => s.user_id).map((s: any) => s.name || "?").join(", ");
      if (!fpCounts[fp]) fpCounts[fp] = { count: 0, names };
      fpCounts[fp].count++;
    }
    const sorted = Object.values(fpCounts).sort((a, b) => b.count - a.count);
    return sorted[0] || null;
  }, [lineups]);

  // Attendance rate
  const attendanceRate = useMemo(() => {
    if (!attendanceData.length) return null;
    const yes = attendanceData.filter((a: any) => a.status === "yes").length;
    return Math.round((yes / attendanceData.length) * 100);
  }, [attendanceData]);

  // Y axis: invert split (lower = faster)
  const splitMin = chartData.length ? Math.min(...chartData.map(d => d.split)) - 2 : 100;
  const splitMax = chartData.length ? Math.max(...chartData.map(d => d.split)) + 2 : 130;

  if (!isCoach) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          Boat performance history is available to coaches only.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Boat Performance</h2>
          <p className="text-sm text-muted-foreground">Season summary by named boat</p>
        </div>
        {activeBoats.length > 0 && (
          <Select value={selectedBoatId} onValueChange={setSelectedBoatId}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue placeholder="Select boat" />
            </SelectTrigger>
            <SelectContent>
              {activeBoats.map((b: any) => (
                <SelectItem key={b.id} value={b.id}>{b.name} ({b.boat_class})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {activeBoats.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Ship className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No named boats yet. Create boats in Team Settings.</p>
          </CardContent>
        </Card>
      )}

      {selectedBoat && (
        <>
          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs text-muted-foreground">Practices</span>
                </div>
                <p className="text-2xl font-bold">{totalPractices}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs text-muted-foreground">Total Meters</span>
                </div>
                <p className="text-2xl font-bold">{totalMeters >= 1000 ? `${(totalMeters / 1000).toFixed(1)}k` : totalMeters}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Ship className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs text-muted-foreground">Best Split</span>
                </div>
                <p className="text-xl font-bold font-mono">{bestSession ? formatSplit(bestSession.avg_split_seconds) : "—"}</p>
                {bestSession && <p className="text-[10px] text-muted-foreground">{bestSession.result_date}</p>}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs text-muted-foreground">Attendance Rate</span>
                </div>
                <p className="text-2xl font-bold">{attendanceRate !== null ? `${attendanceRate}%` : "—"}</p>
              </CardContent>
            </Card>
          </div>

          {/* Avg split trend chart */}
          {chartData.length > 1 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Avg Split Trend (lower = faster)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis
                      domain={[splitMin, splitMax]}
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v: number) => formatSplit(v)}
                      reversed
                    />
                    <Tooltip
                      formatter={(v: number) => [formatSplit(v), "Avg split"]}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="split"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : chartData.length === 1 ? (
            <Card>
              <CardContent className="py-4 text-center text-sm text-muted-foreground">
                Need at least 2 sessions with data to show split trend.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-4 text-center text-sm text-muted-foreground">
                No on-water results logged for this boat yet.
              </CardContent>
            </Card>
          )}

          {/* Most used lineup */}
          {mostUsedLineup && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Most Used Lineup</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">{mostUsedLineup.count}x</Badge>
                  <span className="text-sm">{mostUsedLineup.names}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Best session splits */}
          {bestSession && Array.isArray(bestSession.splits) && bestSession.splits.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Best Session Splits — {bestSession.result_date}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {bestSession.splits.map((sp: any, i: number) => (
                    <span key={i} className="text-xs font-mono px-1.5 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                      {formatSplit(sp.split_seconds)}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default BoatPerformanceHistory;
