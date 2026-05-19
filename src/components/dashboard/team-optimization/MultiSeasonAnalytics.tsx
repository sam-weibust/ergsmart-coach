import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line,
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, TrendingUp } from "lucide-react";
import { formatSplit } from "./constants";

function BetaBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full font-semibold">
      <Sparkles className="h-2.5 w-2.5" />
      Free During Beta · Elite Team Fall 2026
    </span>
  );
}

interface Props {
  teamId: string;
  teamMembers: any[];
  isCoach: boolean;
}

export default function MultiSeasonAnalytics({ teamId, teamMembers, isCoach }: Props) {
  const [seasonA, setSeasonA] = useState<string>("none");
  const [seasonB, setSeasonB] = useState<string>("none");
  const [selectedAthlete, setSelectedAthlete] = useState<string>("none");

  const { data: seasons = [] } = useQuery({
    queryKey: ["team-seasons", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_seasons")
        .select("*")
        .eq("team_id", teamId)
        .order("start_date", { ascending: false });
      return data || [];
    },
  });

  // Get all erg workouts for members ever (for multi-season view)
  const memberIds = teamMembers.map((m: any) => m.user_id).filter(Boolean);

  const { data: allErg = [] } = useQuery({
    queryKey: ["all-erg-team", teamId],
    queryFn: async () => {
      if (memberIds.length === 0) return [];
      const { data } = await supabase
        .from("erg_workouts")
        .select("user_id, workout_date, distance, best_split_seconds, avg_split")
        .in("user_id", memberIds)
        .order("workout_date", { ascending: true });
      return data || [];
    },
    enabled: memberIds.length > 0,
  });

  const { data: allAttendance = [] } = useQuery({
    queryKey: ["all-attendance-team", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_records" as any)
        .select("user_id, practice_date, status")
        .eq("team_id", teamId)
        .order("practice_date", { ascending: true });
      return data || [];
    },
  });

  function ergInSeason(season: any) {
    if (!season) return [];
    return allErg.filter((w: any) => {
      const d = w.workout_date;
      return d >= season.start_date && (!season.end_date || d <= season.end_date);
    });
  }

  function avgMetersPerWeek(workouts: any[]) {
    if (!workouts.length) return 0;
    const total = workouts.reduce((s: number, w: any) => s + (w.distance || 0), 0);
    const days = Math.max(1, (new Date(workouts[workouts.length - 1].workout_date).getTime() - new Date(workouts[0].workout_date).getTime()) / 86400000);
    return Math.round((total / days) * 7);
  }

  function attendanceRate(season: any) {
    if (!season) return 0;
    const recs = allAttendance.filter((a: any) => {
      const d = a.practice_date;
      return d >= season.start_date && (!season.end_date || d <= season.end_date);
    });
    if (!recs.length) return 0;
    return Math.round((recs.filter((a: any) => a.status === "present").length / recs.length) * 100);
  }

  function seasonSummary(season: any) {
    const erg = ergInSeason(season);
    return {
      name: season?.name || "",
      avgWeeklyMeters: avgMetersPerWeek(erg),
      totalMeters: erg.reduce((s: number, w: any) => s + (w.distance || 0), 0),
      attendanceRate: attendanceRate(season),
      athletes: memberIds.length,
    };
  }

  const sA = seasons.find((s: any) => s.id === seasonA);
  const sB = seasons.find((s: any) => s.id === seasonB);
  const sumA = sA ? seasonSummary(sA) : null;
  const sumB = sB ? seasonSummary(sB) : null;

  const comparisonData = sumA && sumB ? [
    {
      metric: "Avg Weekly Meters",
      [sumA.name]: Math.round(sumA.avgWeeklyMeters / 1000 * 10) / 10,
      [sumB.name]: Math.round(sumB.avgWeeklyMeters / 1000 * 10) / 10,
      unit: "km/wk",
    },
    {
      metric: "Attendance Rate",
      [sumA.name]: sumA.attendanceRate,
      [sumB.name]: sumB.attendanceRate,
      unit: "%",
    },
  ] : [];

  // Athlete progression across all seasons
  const athleteProfile = teamMembers.find((m: any) => m.user_id === selectedAthlete)?.profile;
  const athleteErg = allErg.filter((w: any) => w.user_id === selectedAthlete);
  const athleteProgression = seasons
    .map((s: any) => {
      const works = athleteErg.filter((w: any) => {
        const d = w.workout_date;
        return d >= s.start_date && (!s.end_date || d <= s.end_date);
      });
      const bestSplit = works.reduce((best: number, w: any) => {
        const split = w.best_split_seconds || 0;
        return split > 0 && (best === 0 || split < best) ? split : best;
      }, 0);
      const totalM = works.reduce((s: number, w: any) => s + (w.distance || 0), 0);
      return {
        season: s.name,
        bestSplitSeconds: bestSplit,
        totalMeters: totalM,
      };
    })
    .filter((p) => p.totalMeters > 0)
    .reverse();

  const COLORS = ["#0a1628", "#6366f1"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-bold text-foreground">Multi-Season Analytics</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Compare seasons side by side</p>
        </div>
        <BetaBadge />
      </div>

      {seasons.length < 2 ? (
        <div className="rounded-xl border border-border p-8 text-center text-muted-foreground text-sm">
          Create at least two seasons in Team Settings to compare them here.
        </div>
      ) : (
        <>
          {/* Season selectors */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Season A</p>
              <Select value={seasonA} onValueChange={setSeasonA}>
                <SelectTrigger><SelectValue placeholder="Select season" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Select —</SelectItem>
                  {seasons.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Season B</p>
              <Select value={seasonB} onValueChange={setSeasonB}>
                <SelectTrigger><SelectValue placeholder="Select season" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Select —</SelectItem>
                  {seasons.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Summary cards */}
          {sumA && sumB && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[sumA, sumB].map((s, idx) => (
                  <div key={idx} className="rounded-xl border border-border p-4 space-y-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{s.name}</p>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div>
                        <p className="text-lg font-black text-foreground">{(s.totalMeters / 1000).toFixed(0)}k</p>
                        <p className="text-[10px] text-muted-foreground">Total Meters</p>
                      </div>
                      <div>
                        <p className="text-lg font-black text-foreground">{s.attendanceRate}%</p>
                        <p className="text-[10px] text-muted-foreground">Attendance</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bar chart comparison */}
              <div className="rounded-xl border border-border p-4">
                <p className="text-sm font-semibold mb-3">Season Comparison</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={comparisonData} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="metric" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                      formatter={(v, n) => [`${v}`, n]}
                    />
                    <Legend />
                    <Bar dataKey={sumA.name} fill={COLORS[0]} radius={[4, 4, 0, 0]} />
                    <Bar dataKey={sumB.name} fill={COLORS[1]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {/* Single athlete view */}
          <div className="space-y-3 border-t border-border pt-5">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Athlete Multi-Season Progression</p>
            </div>
            <Select value={selectedAthlete} onValueChange={setSelectedAthlete}>
              <SelectTrigger><SelectValue placeholder="Select athlete" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Select athlete —</SelectItem>
                {teamMembers.map((m: any) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.profile?.full_name || m.profile?.username || m.user_id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedAthlete !== "none" && athleteProgression.length > 0 && (
              <div className="rounded-xl border border-border p-4">
                <p className="text-xs font-semibold mb-3 text-muted-foreground">
                  {athleteProfile?.full_name || athleteProfile?.username} — Total Meters by Season
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={athleteProgression} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="season" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                      formatter={(v: number) => [`${(v / 1000).toFixed(1)}k m`, "Total Meters"]}
                    />
                    <Line type="monotone" dataKey="totalMeters" stroke="#0a1628" strokeWidth={2} dot={{ fill: "#0a1628", r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {selectedAthlete !== "none" && athleteProgression.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No logged data for this athlete across seasons.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
