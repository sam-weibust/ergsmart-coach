import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Trophy, TrendingUp, TrendingDown, Minus, Brain, Loader2, RefreshCw, Scale, AlertCircle } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar,
} from "recharts";
import { format, subDays, subMonths, parseISO, startOfWeek } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface PerformanceSectionProps {
  profile: any;
}

function formatSplitSeconds(seconds: number): string {
  if (!seconds || seconds <= 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function splitToWatts(splitSeconds: number): number {
  return 2.80 / Math.pow(splitSeconds / 500, 3);
}

const CACHE_KEY_PREFIX = "perf_analysis_";
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

interface CachedAnalysis {
  sections: Record<string, string>;
  cachedAt: number;
  lastWorkoutDate: string;
}

function getCachedAnalysis(userId: string): CachedAnalysis | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + userId);
    if (!raw) return null;
    const parsed: CachedAnalysis = JSON.parse(raw);
    if (Date.now() - parsed.cachedAt > CACHE_DURATION_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setCachedAnalysis(userId: string, data: CachedAnalysis) {
  try {
    localStorage.setItem(CACHE_KEY_PREFIX + userId, JSON.stringify(data));
  } catch {}
}

const INDIVIDUAL_SECTION_KEYS = [
  "OVERALL TRAJECTORY",
  "STRONGEST AND WEAKEST PERIODS",
  "PREDICTED 2K TIME",
  "SPECIFIC WEAKNESSES",
  "NEXT 4 WEEKS RECOMMENDATIONS",
];

const PerformanceSection = ({ profile }: PerformanceSectionProps) => {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState("90");
  const [analysisResult, setAnalysisResult] = useState<Record<string, string> | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisCachedAt, setAnalysisCachedAt] = useState<number | null>(null);

  const startDate = useMemo(() => {
    const days = parseInt(dateRange);
    return days === 365
      ? subMonths(new Date(), 12).toISOString().split("T")[0]
      : subDays(new Date(), days).toISOString().split("T")[0];
  }, [dateRange]);

  const { data: ergScores = [], isLoading: ergLoading } = useQuery({
    queryKey: ["erg-scores-individual", profile?.id, startDate],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erg_scores")
        .select("id, test_type, time_seconds, total_meters, avg_split_seconds, watts, watts_per_kg, recorded_at, notes")
        .eq("user_id", profile.id)
        .gte("recorded_at", startDate)
        .order("recorded_at", { ascending: true });
      if (error) throw error;
      console.log("[PerformanceSection] Raw erg_scores:", data);
      return data || [];
    },
  });

  const { data: loadLogs = [], isLoading: loadLoading } = useQuery({
    queryKey: ["weekly-load-individual", profile?.id, startDate],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_load_logs")
        .select("week_start, total_meters, erg_meters, on_water_meters, fatigue_score")
        .eq("user_id", profile.id)
        .gte("week_start", startDate)
        .order("week_start", { ascending: true });
      if (error) throw error;
      console.log("[PerformanceSection] Raw weekly_load_logs:", data);
      return data || [];
    },
  });

  const { data: onWaterSessions = [] } = useQuery({
    queryKey: ["onwater-individual", profile?.id, startDate],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("onwater_results")
        .select("result_date, piece_type, distance_meters, avg_split_seconds")
        .gte("result_date", startDate)
        .order("result_date", { ascending: true });
      console.log("[PerformanceSection] Raw onwater_results:", data);
      return data || [];
    },
  });

  // 2K Power Curve — strict filter: test_type='2k' OR total_meters=2000
  const powerCurveData = useMemo(() => {
    const filtered = ergScores.filter(
      (s) => s.test_type === "2k" || s.total_meters === 2000
    );
    console.log("[PerformanceSection] 2k power curve filtered:", filtered);
    return filtered.map((s) => {
      const localDate = new Date(s.recorded_at + "T12:00:00");
      const watts = s.watts
        ? Number(s.watts)
        : s.avg_split_seconds
        ? splitToWatts(Number(s.avg_split_seconds))
        : null;
      return {
        date: format(localDate, "MMM d"),
        watts,
        split: s.avg_split_seconds ? Number(s.avg_split_seconds) : null,
        splitDisplay: s.avg_split_seconds ? formatSplitSeconds(Number(s.avg_split_seconds)) : null,
      };
    }).filter((d) => d.watts !== null);
  }, [ergScores]);

  // Split Trend — all erg_scores, avg_split_seconds stored as numeric seconds
  const splitTrendData = useMemo(() => {
    const filtered = ergScores.filter((s) => s.avg_split_seconds && Number(s.avg_split_seconds) > 0);
    console.log("[PerformanceSection] Split trend data:", filtered);
    return filtered.map((s) => {
      const localDate = new Date(s.recorded_at + "T12:00:00");
      const splitSec = Number(s.avg_split_seconds);
      return {
        date: format(localDate, "MMM d"),
        splitSeconds: splitSec,
        splitDisplay: formatSplitSeconds(splitSec),
        testType: s.test_type,
      };
    });
  }, [ergScores]);

  // W/kg chart — only if profile has weight_kg
  const hasWeight = profile?.weight_kg != null && Number(profile.weight_kg) > 0;
  const wkgData = useMemo(() => {
    if (!hasWeight) return [];
    const filtered = ergScores.filter((s) => s.watts_per_kg && Number(s.watts_per_kg) > 0);
    console.log("[PerformanceSection] W/kg data:", filtered);
    return filtered.map((s) => {
      const localDate = new Date(s.recorded_at + "T12:00:00");
      return {
        date: format(localDate, "MMM d"),
        wkg: Number(s.watts_per_kg),
        testType: s.test_type,
      };
    });
  }, [ergScores, hasWeight]);

  // Training Load — from weekly_load_logs (erg_meters + on_water_meters)
  const trainingLoadData = useMemo(() => {
    // Build from weekly_load_logs
    const byWeek: Record<string, { erg: number; ow: number; label: string }> = {};
    for (const l of loadLogs) {
      const d = new Date(l.week_start + "T12:00:00");
      const label = format(d, "MMM d");
      byWeek[l.week_start] = {
        erg: (l.erg_meters || 0) / 1000,
        ow: (l.on_water_meters || 0) / 1000,
        label,
      };
    }

    // Also aggregate erg_scores by week if no load logs
    if (Object.keys(byWeek).length === 0 && ergScores.length > 0) {
      for (const s of ergScores) {
        const d = new Date(s.recorded_at + "T12:00:00");
        const weekStart = format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
        if (!byWeek[weekStart]) byWeek[weekStart] = { erg: 0, ow: 0, label: format(startOfWeek(d, { weekStartsOn: 1 }), "MMM d") };
        byWeek[weekStart].erg += (s.total_meters || 0) / 1000;
      }
      // Add on-water sessions
      for (const s of onWaterSessions) {
        const d = new Date(s.result_date + "T12:00:00");
        const weekStart = format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
        if (!byWeek[weekStart]) byWeek[weekStart] = { erg: 0, ow: 0, label: format(startOfWeek(d, { weekStartsOn: 1 }), "MMM d") };
        byWeek[weekStart].ow += (s.distance_meters || 0) / 1000;
      }
    }

    const result = Object.entries(byWeek)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
    console.log("[PerformanceSection] Training load data:", result);
    return result;
  }, [loadLogs, ergScores, onWaterSessions]);

  // PRs from erg_scores
  const ergPRs = useMemo(() => {
    const prs: Record<string, any> = {};
    for (const s of ergScores) {
      if (!s.avg_split_seconds) continue;
      const splitSec = Number(s.avg_split_seconds);
      const key = s.test_type.toUpperCase();
      if (!prs[key] || splitSec < Number(prs[key].avg_split_seconds)) {
        prs[key] = s;
      }
    }
    return prs;
  }, [ergScores]);

  // Trend helper
  const calcTrend = (values: number[]) => {
    if (values.length < 2) return null;
    const recent = values.slice(-3);
    const older = values.slice(0, 3);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    if (olderAvg === 0) return null;
    return ((recentAvg - olderAvg) / olderAvg) * 100;
  };

  const splitTrend = calcTrend(splitTrendData.map((d) => d.splitSeconds));
  const wattsTrend = calcTrend(powerCurveData.map((d) => d.watts as number));
  const loadTrend = calcTrend(trainingLoadData.map((d) => d.erg + d.ow));

  const TrendBadge = ({ trend, inverse = false }: { trend: number | null; inverse?: boolean }) => {
    if (trend === null || Math.abs(trend) < 0.5) return <Minus className="h-4 w-4 text-muted-foreground" />;
    const positive = inverse ? trend < 0 : trend > 0;
    return positive ? (
      <TrendingUp className="h-4 w-4 text-green-500" />
    ) : (
      <TrendingDown className="h-4 w-4 text-red-500" />
    );
  };

  // Load cached analysis on mount
  useMemo(() => {
    if (!profile?.id) return;
    const cached = getCachedAnalysis(profile.id);
    if (cached) {
      setAnalysisResult(cached.sections);
      setAnalysisCachedAt(cached.cachedAt);
    }
  }, [profile?.id]);

  const runAnalysis = async (force = false) => {
    if (!profile?.id) return;

    // Check cache unless forced
    if (!force) {
      const cached = getCachedAnalysis(profile.id);
      if (cached) {
        const latestWorkout = ergScores[ergScores.length - 1]?.recorded_at;
        if (!latestWorkout || new Date(latestWorkout).getTime() < cached.cachedAt) {
          setAnalysisResult(cached.sections);
          setAnalysisCachedAt(cached.cachedAt);
          return;
        }
      }
    }

    setAnalysisLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-performance", {
        body: { user_id: profile.id },
      });
      if (error) throw new Error(error.message);
      if (data?.sections) {
        const now = Date.now();
        const lastWorkoutDate = ergScores[ergScores.length - 1]?.recorded_at || "";
        setCachedAnalysis(profile.id, { sections: data.sections, cachedAt: now, lastWorkoutDate });
        setAnalysisResult(data.sections);
        setAnalysisCachedAt(now);
      }
    } catch (e: any) {
      toast({ title: "Analysis failed", description: e.message, variant: "destructive" });
    } finally {
      setAnalysisLoading(false);
    }
  };

  const loading = ergLoading || loadLoading;

  if (loading) {
    return (
      <div className="space-y-4">
        <Card className="animate-pulse"><CardContent className="h-64" /></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h2 className="text-xl font-semibold">Performance Analytics</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={() => runAnalysis(false)}
            disabled={analysisLoading}
            className="gap-2"
            size="sm"
          >
            {analysisLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Brain className="h-4 w-4" />
            )}
            {analysisLoading ? "Analyzing..." : "Analyze My Performance"}
          </Button>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-32 min-h-[44px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
              <SelectItem value="365">1 year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* AI Analysis Card */}
      {analysisResult && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Brain className="h-5 w-5 text-primary" />
                AI Performance Analysis
              </CardTitle>
              <div className="flex items-center gap-2">
                {analysisCachedAt && (
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(analysisCachedAt), "MMM d, h:mm a")}
                  </span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1 text-xs"
                  onClick={() => runAnalysis(true)}
                  disabled={analysisLoading}
                >
                  <RefreshCw className="h-3 w-3" />
                  Regenerate
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {INDIVIDUAL_SECTION_KEYS.map((key) =>
              analysisResult[key] ? (
                <div key={key}>
                  <h4 className="text-sm font-semibold text-primary mb-1">{key.replace(/_/g, " ")}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {analysisResult[key]}
                  </p>
                </div>
              ) : null
            )}
          </CardContent>
        </Card>
      )}

      {/* PRs */}
      {Object.keys(ergPRs).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Personal Records
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(ergPRs).map(([type, score]) => (
                <div
                  key={type}
                  className="p-4 rounded-lg border bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border-yellow-500/20"
                >
                  <div className="flex justify-between items-start mb-2">
                    <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-600">{type}</Badge>
                    <Trophy className="h-4 w-4 text-yellow-500" />
                  </div>
                  <p className="text-2xl font-bold">{formatSplitSeconds(Number(score.avg_split_seconds))}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(score.recorded_at + "T12:00:00"), "MMM d, yyyy")}
                  </p>
                  {score.watts && (
                    <p className="text-xs text-muted-foreground">{Number(score.watts).toFixed(0)}W</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 2K Power Curve */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-5 w-5" />
                2K Power Curve
              </CardTitle>
              <div className="flex items-center gap-1 text-sm">
                <TrendBadge trend={wattsTrend} />
                {wattsTrend !== null && (
                  <span className={wattsTrend > 0 ? "text-green-500" : "text-red-500"}>
                    {Math.abs(wattsTrend).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {powerCurveData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <Activity className="h-8 w-8 opacity-30" />
                <p className="text-sm">No 2K erg scores logged yet</p>
                <p className="text-xs">Log a 2K test to see your power curve</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={powerCurveData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis
                    domain={["dataMin - 10", "dataMax + 10"]}
                    className="text-xs"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    tickFormatter={(v) => `${v}W`}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-popover border rounded-lg p-3 shadow-lg">
                          <p className="font-medium text-sm">{d.date}</p>
                          <p className="text-primary text-sm">{d.watts?.toFixed(0)}W</p>
                          {d.splitDisplay && <p className="text-muted-foreground text-xs">Split: {d.splitDisplay}/500m</p>}
                        </div>
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="watts"
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

        {/* Split Trend */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-5 w-5" />
                Split Trend
              </CardTitle>
              <div className="flex items-center gap-1 text-sm">
                <TrendBadge trend={splitTrend} inverse />
                {splitTrend !== null && (
                  <span className={splitTrend < 0 ? "text-green-500" : "text-red-500"}>
                    {Math.abs(splitTrend).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {splitTrendData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <TrendingUp className="h-8 w-8 opacity-30" />
                <p className="text-sm">No split data available</p>
                <p className="text-xs">Log erg scores to track your splits</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={splitTrendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis
                    reversed
                    tickFormatter={(v) => formatSplitSeconds(v)}
                    domain={["dataMin - 3", "dataMax + 3"]}
                    className="text-xs"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-popover border rounded-lg p-3 shadow-lg">
                          <p className="font-medium text-sm">{d.date}</p>
                          <p className="text-primary text-sm">{d.splitDisplay}/500m</p>
                          <p className="text-muted-foreground text-xs">{d.testType?.toUpperCase()}</p>
                        </div>
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="splitSeconds"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))", strokeWidth: 0, r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* W/kg Chart */}
        {!hasWeight ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Scale className="h-5 w-5" />
                Power-to-Weight (W/kg)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <AlertCircle className="h-8 w-8 opacity-40" />
                <p className="text-sm font-medium">Add your weight to see W/kg</p>
                <p className="text-xs text-center">Update your profile with your current weight to track power-to-weight ratio</p>
              </div>
            </CardContent>
          </Card>
        ) : wkgData.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Scale className="h-5 w-5" />
                Power-to-Weight (W/kg)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <Scale className="h-8 w-8 opacity-30" />
                <p className="text-sm">No W/kg data in this range</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Scale className="h-5 w-5" />
                Power-to-Weight (W/kg)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={wkgData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis
                    domain={["dataMin - 0.1", "dataMax + 0.1"]}
                    tickFormatter={(v) => `${Number(v).toFixed(1)}`}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-popover border rounded-lg p-3 shadow-lg">
                          <p className="font-medium text-sm">{d.date}</p>
                          <p className="text-primary text-sm">{Number(d.wkg).toFixed(2)} W/kg</p>
                          <p className="text-muted-foreground text-xs">{d.testType?.toUpperCase()}</p>
                        </div>
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="wkg"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))", strokeWidth: 0, r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Training Load */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-5 w-5" />
                Weekly Training Load
              </CardTitle>
              <div className="flex items-center gap-1 text-sm">
                <TrendBadge trend={loadTrend} />
                {loadTrend !== null && (
                  <span className={loadTrend > 0 ? "text-green-500" : "text-red-500"}>
                    {Math.abs(loadTrend).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {trainingLoadData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <Activity className="h-8 w-8 opacity-30" />
                <p className="text-sm">No training load data</p>
                <p className="text-xs">Log weekly load or erg sessions to see volume</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={trainingLoadData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${v}km`} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-popover border rounded-lg p-3 shadow-lg">
                          <p className="font-medium text-sm">{d.label}</p>
                          <p className="text-blue-400 text-sm">Erg: {d.erg.toFixed(1)}km</p>
                          <p className="text-green-400 text-sm">On-water: {d.ow.toFixed(1)}km</p>
                          <p className="text-primary text-sm">Total: {(d.erg + d.ow).toFixed(1)}km</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="erg" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} name="Erg" stackId="a" />
                  <Bar dataKey="ow" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} name="On-water" stackId="a" />
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
              <p className="text-sm text-muted-foreground">Erg Scores</p>
              <p className="text-2xl font-bold">{ergScores.length}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Total Erg Meters</p>
              <p className="text-2xl font-bold">
                {(ergScores.reduce((s, w) => s + (w.total_meters || 0), 0) / 1000).toFixed(1)}km
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Best 2K Watts</p>
              <p className="text-2xl font-bold">
                {powerCurveData.length > 0
                  ? `${Math.max(...powerCurveData.map((d) => d.watts as number)).toFixed(0)}W`
                  : "—"}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Avg W/kg</p>
              <p className="text-2xl font-bold">
                {wkgData.length > 0
                  ? (wkgData.reduce((s, d) => s + d.wkg, 0) / wkgData.length).toFixed(2)
                  : "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PerformanceSection;
