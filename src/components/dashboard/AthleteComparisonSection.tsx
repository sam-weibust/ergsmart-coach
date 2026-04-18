import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GitCompare, Sparkles, User, TrendingUp, Zap, Activity } from "lucide-react";
import { toast } from "sonner";

function secondsToSplit(s: number | null): string {
  if (!s) return "—";
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

interface AthleteStats {
  id: string;
  name: string;
  best2k: string;
  best2k_watts: number | null;
  best6k: string;
  wpk: string;
  recent_meters: number | null;
  fatigue: number | null;
  improvement: string;
  seat_wins: number;
  seat_total: number;
}

const AthleteComparisonSection = () => {
  const [athlete1Id, setAthlete1Id] = useState<string>("");
  const [athlete2Id, setAthlete2Id] = useState<string>("");
  const [aiResult, setAiResult] = useState<{ summary: string; recommendation: string } | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);

  const { data: teamAthletes } = useQuery({
    queryKey: ["coach-team-athletes"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      // Get teams the coach owns/manages
      const { data: teams } = await supabase
        .from("teams")
        .select("id")
        .eq("coach_id", user.id);
      if (!teams?.length) return [];
      const teamIds = teams.map((t: any) => t.id);
      const { data: members } = await supabase
        .from("team_members")
        .select("user_id, profiles(id, username, full_name)")
        .in("team_id", teamIds);
      return (members || []).map((m: any) => ({
        id: m.user_id,
        name: m.profiles?.username || m.profiles?.full_name || "Athlete",
      }));
    },
  });

  const loadAthleteStats = async (athleteId: string): Promise<AthleteStats | null> => {
    if (!athleteId) return null;

    const [profileRes, ergRes, loadRes, seatRes] = await Promise.all([
      supabase.from("profiles").select("username, full_name, weight_kg").eq("id", athleteId).maybeSingle(),
      supabase.from("erg_workouts")
        .select("distance, avg_split, avg_watts, workout_date")
        .eq("user_id", athleteId)
        .order("workout_date", { ascending: false })
        .limit(30),
      (supabase as any).from("weekly_load_logs").select("total_meters, fatigue_score").eq("user_id", athleteId).order("week_start", { ascending: false }).limit(1).maybeSingle(),
      (supabase as any).from("seat_races").select("winner_id").or(`athlete1_id.eq.${athleteId},athlete2_id.eq.${athleteId}`),
    ]);

    const profile = profileRes.data;
    const workouts = ergRes.data || [];
    const load = loadRes.data;
    const seatRaces = seatRes.data || [];

    const twokWorkouts = workouts.filter((w: any) => w.distance >= 1900 && w.distance <= 2100 && w.avg_split);
    const sixkWorkouts = workouts.filter((w: any) => w.distance >= 5800 && w.distance <= 6200 && w.avg_split);

    const splitToSec = (s: string) => { const p = s.split(":"); return parseInt(p[0]) * 60 + parseFloat(p[1]); };
    const best2kSplit = twokWorkouts.length ? twokWorkouts.reduce((best: any, w: any) => {
      return !best || splitToSec(w.avg_split) < splitToSec(best.avg_split) ? w : best;
    }, null) : null;
    const best6kSplit = sixkWorkouts.length ? sixkWorkouts.reduce((best: any, w: any) => {
      return !best || splitToSec(w.avg_split) < splitToSec(best.avg_split) ? w : best;
    }, null) : null;

    const weight = (profile as any)?.weight_kg;
    const wpk = best2kSplit?.avg_watts && weight ? (best2kSplit.avg_watts / weight).toFixed(2) : null;

    const recentMeters = load?.total_meters || null;
    const fatigue = load?.fatigue_score || null;

    // 30-day improvement: compare most recent 2k vs oldest 2k in last 30 days
    let improvement = "—";
    if (twokWorkouts.length >= 2) {
      const newest = splitToSec(twokWorkouts[0].avg_split);
      const oldest = splitToSec(twokWorkouts[twokWorkouts.length - 1].avg_split);
      const diff = oldest - newest;
      improvement = diff > 0 ? `-${diff.toFixed(1)}s` : `+${Math.abs(diff).toFixed(1)}s`;
    }

    const seatWins = seatRaces.filter((r: any) => r.winner_id === athleteId).length;

    return {
      id: athleteId,
      name: (profile as any)?.username || (profile as any)?.full_name || "Athlete",
      best2k: best2kSplit ? best2kSplit.avg_split : "—",
      best2k_watts: best2kSplit?.avg_watts || null,
      best6k: best6kSplit ? best6kSplit.avg_split : "—",
      wpk: wpk ? `${wpk} W/kg` : "—",
      recent_meters: recentMeters,
      fatigue,
      improvement,
      seat_wins: seatWins,
      seat_total: seatRaces.length,
    };
  };

  const { data: stats1, isLoading: l1 } = useQuery({
    queryKey: ["athlete-stats", athlete1Id],
    queryFn: () => loadAthleteStats(athlete1Id),
    enabled: !!athlete1Id,
  });

  const { data: stats2, isLoading: l2 } = useQuery({
    queryKey: ["athlete-stats", athlete2Id],
    queryFn: () => loadAthleteStats(athlete2Id),
    enabled: !!athlete2Id,
  });

  const runComparison = async () => {
    if (!stats1 || !stats2) return;
    setLoadingAI(true);
    setAiResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/compare-athletes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ athlete1: stats1, athlete2: stats2 }),
      });
      if (!res.ok) throw new Error("AI comparison failed");
      const data = await res.json();
      setAiResult(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingAI(false);
    }
  };

  const athletes = teamAthletes || [];

  const StatRow = ({ label, v1, v2 }: { label: string; v1: any; v2: any }) => (
    <div className="grid grid-cols-3 gap-2 py-2 border-b border-border last:border-0">
      <div className={`text-sm font-medium text-right pr-2 ${v1 !== "—" && v2 !== "—" && v1 < v2 ? "text-primary" : ""}`}>{v1}</div>
      <div className="text-xs text-muted-foreground text-center">{label}</div>
      <div className={`text-sm font-medium text-left pl-2 ${v1 !== "—" && v2 !== "—" && v2 < v1 ? "text-primary" : ""}`}>{v2}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Athlete Comparison</h2>
        <p className="text-muted-foreground text-sm">Side-by-side stats with AI boat placement analysis</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Athlete 1</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={athlete1Id}
                onChange={(e) => { setAthlete1Id(e.target.value); setAiResult(null); }}
              >
                <option value="">Select athlete...</option>
                {athletes.filter((a: any) => a.id !== athlete2Id).map((a: any) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Athlete 2</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={athlete2Id}
                onChange={(e) => { setAthlete2Id(e.target.value); setAiResult(null); }}
              >
                <option value="">Select athlete...</option>
                {athletes.filter((a: any) => a.id !== athlete1Id).map((a: any) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          {athlete1Id && athlete2Id && (
            <Button
              onClick={runComparison}
              disabled={loadingAI || l1 || l2}
              className="w-full gap-2"
            >
              <Sparkles className="h-4 w-4" />
              {loadingAI ? "AI Analyzing..." : "Generate AI Comparison"}
            </Button>
          )}
        </CardContent>
      </Card>

      {stats1 && stats2 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <div className="font-bold text-foreground">{stats1.name}</div>
              </div>
              <div className="text-center">
                <GitCompare className="h-5 w-5 text-muted-foreground mx-auto" />
              </div>
              <div className="text-center">
                <div className="font-bold text-foreground">{stats2.name}</div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <StatRow label="Best 2k Split" v1={stats1.best2k} v2={stats2.best2k} />
            <StatRow label="2k Watts" v1={stats1.best2k_watts ? `${stats1.best2k_watts}W` : "—"} v2={stats2.best2k_watts ? `${stats2.best2k_watts}W` : "—"} />
            <StatRow label="Best 6k Split" v1={stats1.best6k} v2={stats2.best6k} />
            <StatRow label="Watts/kg" v1={stats1.wpk} v2={stats2.wpk} />
            <StatRow label="Weekly Meters" v1={stats1.recent_meters ? `${stats1.recent_meters.toLocaleString()}m` : "—"} v2={stats2.recent_meters ? `${stats2.recent_meters.toLocaleString()}m` : "—"} />
            <StatRow label="Fatigue (1-10)" v1={stats1.fatigue ?? "—"} v2={stats2.fatigue ?? "—"} />
            <StatRow label="30d Improvement" v1={stats1.improvement} v2={stats2.improvement} />
            <StatRow label="Seat Race W/L" v1={`${stats1.seat_wins}/${stats1.seat_total}`} v2={`${stats2.seat_wins}/${stats2.seat_total}`} />
          </CardContent>
        </Card>
      )}

      {aiResult && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-foreground">{aiResult.summary}</p>
            {aiResult.recommendation && (
              <div className="p-3 bg-primary/10 rounded-lg">
                <p className="text-sm font-medium text-primary">Recommendation</p>
                <p className="text-sm text-foreground mt-0.5">{aiResult.recommendation}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {athletes.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <User className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No team athletes found</p>
            <p className="text-sm">Add athletes to your team to compare them here.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AthleteComparisonSection;
