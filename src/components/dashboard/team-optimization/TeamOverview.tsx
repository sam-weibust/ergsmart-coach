import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, BarChart3, Activity, Ship, FileText, Loader2, CalendarDays, Brain, RefreshCw } from "lucide-react";
import { Leaderboard } from "@/components/dashboard/Leaderboard";
import { TeamGoals } from "@/components/dashboard/TeamGoals";
import { TeamWorkoutPlanSection } from "@/components/dashboard/TeamWorkoutPlanSection";
import { TeamAnalytics } from "@/components/dashboard/TeamAnalytics";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Props {
  teamId: string;
  teamName: string;
  teamMembers: any[];
  isCoach: boolean;
  profile: any;
  seasonId?: string | null;
}

const TEAM_CACHE_KEY_PREFIX = "team_analysis_";
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

const TEAM_SECTION_KEYS = [
  "TEAM TRAJECTORY",
  "TOP AND BOTTOM PERFORMERS",
  "TRAINING LOAD RECOMMENDATIONS",
  "ATTENDANCE PATTERNS",
  "LINEUP RECOMMENDATIONS",
  "RED FLAGS",
];

const TeamOverview = ({ teamId, teamName, teamMembers, isCoach, profile, seasonId }: Props) => {
  const { toast } = useToast();
  const [reportLoading, setReportLoading] = useState(false);
  const [teamAnalysis, setTeamAnalysis] = useState<Record<string, string> | null>(null);
  const [teamAnalysisLoading, setTeamAnalysisLoading] = useState(false);
  const [analysisCachedAt, setAnalysisCachedAt] = useState<number | null>(null);

  useMemo(() => {
    try {
      const raw = localStorage.getItem(TEAM_CACHE_KEY_PREFIX + teamId);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.cachedAt < CACHE_DURATION_MS) {
        setTeamAnalysis(parsed.sections);
        setAnalysisCachedAt(parsed.cachedAt);
      }
    } catch {}
  }, [teamId]);

  const runTeamAnalysis = async (force = false) => {
    if (!force && teamAnalysis) return;
    setTeamAnalysisLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-performance", {
        body: { team_id: teamId, is_team_analysis: true },
      });
      if (error) throw new Error(error.message);
      if (data?.sections) {
        const now = Date.now();
        localStorage.setItem(TEAM_CACHE_KEY_PREFIX + teamId, JSON.stringify({ sections: data.sections, cachedAt: now }));
        setTeamAnalysis(data.sections);
        setAnalysisCachedAt(now);
      }
    } catch (e: any) {
      toast({ title: "Analysis failed", description: e.message, variant: "destructive" });
    } finally {
      setTeamAnalysisLoading(false);
    }
  };

  const todayStr = new Date().toISOString().split("T")[0];

  const { data: upcomingPractices = [] } = useQuery({
    queryKey: ["upcoming-practices", teamId, profile.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("boat_lineups")
        .select("*")
        .eq("team_id", teamId)
        .not("published_at", "is", null)
        .gte("practice_date", todayStr)
        .order("practice_date", { ascending: true })
        .limit(5);
      if (!isCoach) {
        return (data || []).filter((l: any) => {
          const seats: any[] = Array.isArray(l.seats) ? l.seats : [];
          return seats.some((s: any) => s.user_id === profile.id);
        });
      }
      return data || [];
    },
  });

  async function generateSeasonReport() {
    if (!seasonId) {
      toast({ title: "Select a season", description: "Choose a season from the selector to generate a report.", variant: "destructive" });
      return;
    }
    setReportLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-season-report", {
        body: { team_id: teamId, season_id: seasonId },
      });
      if (error) throw new Error(error.message);
      if (data?.pdf_base64) {
        const byteChars = atob(data.pdf_base64);
        const byteNums = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
        const blob = new Blob([new Uint8Array(byteNums)], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `season-report-${new Date().toISOString().split("T")[0]}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: "Report downloaded!" });
      }
    } catch (e: any) {
      toast({ title: "Error generating report", description: e.message, variant: "destructive" });
    } finally {
      setReportLoading(false);
    }
  }

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
      {/* Coach actions */}
      {isCoach && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div />
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="default"
              className="gap-2"
              onClick={() => runTeamAnalysis(false)}
              disabled={teamAnalysisLoading}
            >
              {teamAnalysisLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
              {teamAnalysisLoading ? "Analyzing..." : "Analyze Team Performance"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={generateSeasonReport}
              disabled={reportLoading}
            >
              {reportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Generate Season Report
            </Button>
          </div>
        </div>
      )}

      {/* Team AI Analysis Card */}
      {isCoach && teamAnalysis && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Brain className="h-5 w-5 text-primary" />
                AI Team Analysis
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
                  onClick={() => runTeamAnalysis(true)}
                  disabled={teamAnalysisLoading}
                >
                  <RefreshCw className="h-3 w-3" />
                  Regenerate
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {TEAM_SECTION_KEYS.map((key) =>
              teamAnalysis[key] ? (
                <div key={key}>
                  <h4 className="text-sm font-semibold text-primary mb-1">{key}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {teamAnalysis[key]}
                  </p>
                </div>
              ) : null
            )}
          </CardContent>
        </Card>
      )}

      {/* Upcoming practices */}
      {upcomingPractices.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              Upcoming Practices
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingPractices.map((l: any) => {
              const seats: any[] = Array.isArray(l.seats) ? l.seats : [];
              const mySlot = !isCoach ? seats.find((s: any) => s.user_id === profile.id) : null;
              return (
                <div key={l.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {new Date(l.practice_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      </p>
                      <p className="text-xs text-muted-foreground">{l.name} · {l.boat_class}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {mySlot && (
                      <Badge variant="outline" className="text-xs">
                        {mySlot.seat_number === 0 ? "Cox" : `Seat ${mySlot.seat_number}`}
                      </Badge>
                    )}
                    {l.workout_plan && (
                      <Badge variant="secondary" className="text-xs">Workout set</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

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
