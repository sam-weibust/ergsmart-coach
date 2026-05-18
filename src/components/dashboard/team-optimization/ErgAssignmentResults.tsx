import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { ArrowLeft, Brain, ChevronDown, ChevronUp, Send, Grid3x3 } from "lucide-react";
import { formatSplit, displayName, getFatigueColor } from "./constants";

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  overdue: "bg-red-500/20 text-red-400 border-red-500/30",
  excused: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

function splitColor(actual: number | null, target: number | null): string {
  if (!actual || !target) return "text-foreground";
  const diff = actual - target;
  if (Math.abs(diff) <= 2) return "text-green-400";
  if (Math.abs(diff) <= 5) return "text-yellow-400";
  return "text-red-400";
}

interface Props {
  assignment: any;
  teamId: string;
  teamMembers: any[];
  isCoach: boolean;
  profile: any;
  onBack: () => void;
}

const ErgAssignmentResults = ({ assignment, teamId, teamMembers, isCoach, profile, onBack }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedAthlete, setExpandedAthlete] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
  const [chartFilter, setChartFilter] = useState<"all" | string>("all");
  const [hiddenAthletes, setHiddenAthletes] = useState<Set<string>>(new Set());

  const { data: results = [] } = useQuery({
    queryKey: ["erg-assignment-results", assignment.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("erg_assignment_results" as any)
        .select("*, logged_by: logged_by_user_id(full_name, username)")
        .eq("assignment_id", assignment.id);
      return data || [];
    },
    enabled: isCoach,
  });

  const { data: ergNumbers = [] } = useQuery({
    queryKey: ["erg-numbers", assignment.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("erg_number_assignments" as any)
        .select("*")
        .eq("assignment_id", assignment.id);
      return data || [];
    },
  });

  const { data: wellnessData = [] } = useQuery({
    queryKey: ["wellness-checkins", teamId, assignment.scheduled_date],
    queryFn: async () => {
      if (!assignment.scheduled_date) return [];
      const { data } = await supabase
        .from("wellness_checkins" as any)
        .select("*")
        .eq("team_id", teamId)
        .eq("checkin_date", assignment.scheduled_date);
      return data || [];
    },
    enabled: !!assignment.scheduled_date,
  });

  const { data: attendanceData = [] } = useQuery({
    queryKey: ["attendance-by-date", teamId, assignment.scheduled_date],
    queryFn: async () => {
      if (!assignment.scheduled_date) return [];
      const { data } = await supabase
        .from("practice_attendance" as any)
        .select("*, lineup:lineup_id(practice_date, team_id)")
        .eq("lineup.team_id", teamId)
        .eq("lineup.practice_date", assignment.scheduled_date);
      return data || [];
    },
    enabled: !!assignment.scheduled_date,
  });

  const excuseAbsentMutation = useMutation({
    mutationFn: async (athleteId: string) => {
      await supabase
        .from("erg_assignment_results" as any)
        .update({ status: "excused" })
        .eq("assignment_id", assignment.id)
        .eq("athlete_id", athleteId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["erg-assignment-results", assignment.id] }),
  });

  const sendFeedbackMutation = useMutation({
    mutationFn: async ({ athleteId, feedback }: { athleteId: string; feedback: string }) => {
      await supabase.from("coach_athlete_messages" as any).insert({
        team_id: teamId,
        coach_id: profile.id,
        recipient_athlete_id: athleteId,
        content: `Workout Feedback - ${assignment.title}:\n\n${feedback}`,
        is_read: false,
      });

      const { data: tokens } = await supabase
        .from("push_tokens")
        .select("token, platform")
        .eq("user_id", athleteId);

      for (const t of tokens || []) {
        await supabase.functions.invoke("send-notification", {
          body: {
            token: t.token, platform: t.platform,
            title: "Coach Feedback",
            body: `${displayName(profile)}: ${feedback.slice(0, 80)}...`,
            data: { type: "coach_feedback", assignment_id: assignment.id },
          },
        });
      }
    },
    onSuccess: (_, { athleteId }) => {
      toast({ title: "Feedback sent" });
      setFeedbackDrafts(prev => ({ ...prev, [athleteId]: "" }));
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const runAiAnalysis = async () => {
    setAiLoading(true);
    try {
      const completedResults = results.filter((r: any) => r.status === "completed" && r.manual_pieces);
      const athleteProfiles = teamMembers.reduce((acc: any, m: any) => {
        acc[m.user_id] = m.profile;
        return acc;
      }, {});

      const sessions = completedResults.map((r: any) => ({
        athlete: displayName(athleteProfiles[r.athlete_id]),
        pieces: r.manual_pieces || [],
        completedAt: r.completed_at,
        notes: r.completion_notes,
      }));

      const { data, error } = await supabase.functions.invoke("analyze-workouts", {
        body: {
          sessions: sessions.length ? sessions : [{ date: assignment.scheduled_date, boatName: "Team", attendance: results.length, totalRoster: teamMembers.length }],
          assignmentTitle: assignment.title,
          pieces: assignment.pieces,
          completedCount: results.filter((r: any) => r.status === "completed").length,
          totalCount: results.length,
        },
      });

      if (error) throw error;
      setAiAnalysis(data?.analysis || data?.result || JSON.stringify(data));
    } catch (e: any) {
      toast({ title: "Analysis failed", description: e.message, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const completed = results.filter((r: any) => r.status === "completed");
  const overdue = results.filter((r: any) => r.status === "overdue");
  const completionPct = results.length ? Math.round((completed.length / results.length) * 100) : 0;

  const pieces: any[] = assignment.pieces || [];

  // Build chart data: x = piece number, y = split seconds per athlete
  const athletes = teamMembers.filter((m: any) => {
    const result = results.find((r: any) => r.athlete_id === m.user_id);
    return result?.status === "completed" && result?.manual_pieces?.length;
  });

  const chartData = pieces.map((_: any, i: number) => {
    const point: any = { piece: i + 1 };
    let total = 0; let count = 0;
    for (const m of athletes) {
      const result = results.find((r: any) => r.athlete_id === m.user_id);
      const pieceResult = result?.manual_pieces?.find((p: any) => p.piece_number === i + 1);
      if (pieceResult?.actual_split_seconds) {
        point[m.user_id] = pieceResult.actual_split_seconds;
        total += pieceResult.actual_split_seconds;
        count++;
      }
    }
    if (count > 0) point.average = total / count;
    return point;
  });

  const COLORS = ["#60a5fa","#34d399","#f59e0b","#f87171","#a78bfa","#fb923c","#38bdf8","#4ade80"];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h2 className="font-semibold text-base">{assignment.title}</h2>
          <p className="text-xs text-muted-foreground">
            {assignment.scheduled_date} · {completed.length}/{results.length} completed
            {overdue.length > 0 && <span className="text-red-400 ml-2">{overdue.length} overdue</span>}
          </p>
        </div>
        <Badge variant="outline" className={STATUS_COLORS[assignment.status] || ""}>{assignment.status}</Badge>
      </div>

      <div>
        <Progress value={completionPct} className="h-2" />
        <p className="text-xs text-muted-foreground mt-1">{completionPct}% complete</p>
      </div>

      {/* Erg Map */}
      {ergNumbers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5"><Grid3x3 className="h-4 w-4" />Erg Map</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {ergNumbers.map((en: any) => {
                const member = teamMembers.find((m: any) => m.user_id === en.athlete_id);
                return (
                  <div key={en.id} className="border border-border rounded p-2 text-center">
                    <div className="text-xl font-bold text-primary">{en.erg_number}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{displayName(member?.profile)}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Athlete List (coach only) */}
      {isCoach && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Athlete Results</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {results.map((result: any) => {
              const member = teamMembers.find((m: any) => m.user_id === result.athlete_id);
              const wellness = wellnessData.find((w: any) => w.user_id === result.athlete_id);
              const attendance = attendanceData.find((a: any) => a.user_id === result.athlete_id);
              const isExpanded = expandedAthlete === result.athlete_id;
              const loggedBy = result.logged_by;

              // Auto-excuse absent athletes
              if (attendance?.status === "no" && result.status === "pending") {
                excuseAbsentMutation.mutate(result.athlete_id);
              }

              return (
                <div key={result.id} className="border border-border rounded-lg overflow-hidden">
                  <button
                    className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 text-left"
                    onClick={() => setExpandedAthlete(isExpanded ? null : result.athlete_id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{displayName(member?.profile)}</span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[result.status] || ""}`}>
                          {result.status === "excused" && attendance?.status === "no" ? "Excused - Absent" : result.status}
                        </Badge>
                        {loggedBy && result.logged_by_role === "coxswain" && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-400 border-blue-500/20">
                            Logged by {displayName(loggedBy)}
                          </Badge>
                        )}
                        {result.logged_by_role === "athlete" && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-500/10 text-green-400 border-green-500/20">Self</Badge>
                        )}
                        {result.erg_score_id && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-500/10 text-purple-400 border-purple-500/20">C2 Sync</Badge>
                        )}
                      </div>
                    </div>

                    {/* Wellness indicators */}
                    {wellness && (
                      <div className="flex gap-1 shrink-0">
                        <span className={`h-2.5 w-2.5 rounded-full ${getFatigueColor(wellness.energy)}`} title={`Energy: ${wellness.energy}`} />
                        <span className={`h-2.5 w-2.5 rounded-full ${getFatigueColor(10 - (wellness.soreness || 5))}`} title={`Soreness: ${wellness.soreness}`} />
                        <span className={`h-2.5 w-2.5 rounded-full ${wellness.sleep_hours >= 8 ? "bg-green-500/70" : wellness.sleep_hours >= 6 ? "bg-yellow-400/70" : "bg-red-500/70"}`} title={`Sleep: ${wellness.sleep_hours}h`} />
                      </div>
                    )}

                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border p-3 space-y-3">
                      {/* Piece breakdown */}
                      {result.manual_pieces?.length > 0 && (
                        <div className="space-y-1">
                          {result.manual_pieces.map((p: any) => {
                            const targetPiece = pieces.find((tp: any) => tp.piece_number === p.piece_number);
                            return (
                              <div key={p.piece_number} className="flex items-center gap-2 text-xs">
                                <span className="w-12 text-muted-foreground shrink-0">Piece {p.piece_number}</span>
                                <span className={`font-mono ${splitColor(p.actual_split_seconds, targetPiece?.target_split_seconds)}`}>
                                  {p.actual_split_seconds ? formatSplit(p.actual_split_seconds) : "--:--"}
                                </span>
                                {targetPiece?.target_split_seconds && (
                                  <span className="text-muted-foreground">/ {formatSplit(targetPiece.target_split_seconds)}</span>
                                )}
                                {p.actual_stroke_rate && (
                                  <span className={`ml-2 ${targetPiece?.target_stroke_rate ? (Math.abs(p.actual_stroke_rate - targetPiece.target_stroke_rate) <= 1 ? "text-green-400" : "text-yellow-400") : ""}`}>
                                    {p.actual_stroke_rate} spm
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {result.completion_notes && (
                        <p className="text-xs text-muted-foreground italic">"{result.completion_notes}"</p>
                      )}

                      {/* Coach feedback */}
                      <div className="space-y-2">
                        <Textarea
                          placeholder="Write feedback for this athlete..."
                          rows={2}
                          value={feedbackDrafts[result.athlete_id] || ""}
                          onChange={e => setFeedbackDrafts(prev => ({ ...prev, [result.athlete_id]: e.target.value }))}
                          className="text-xs"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7"
                          disabled={!feedbackDrafts[result.athlete_id]?.trim() || sendFeedbackMutation.isPending}
                          onClick={() => sendFeedbackMutation.mutate({ athleteId: result.athlete_id, feedback: feedbackDrafts[result.athlete_id] })}
                        >
                          <Send className="h-3 w-3 mr-1" /> Send Feedback
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Team Comparison Chart (coach only) */}
      {isCoach && athletes.length > 0 && chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Team Comparison</CardTitle>
            <p className="text-xs text-muted-foreground">Split seconds — lower is faster</p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1 mb-3">
              {athletes.map((m: any, i: number) => (
                <button
                  key={m.user_id}
                  onClick={() => setHiddenAthletes(prev => {
                    const next = new Set(prev);
                    if (next.has(m.user_id)) next.delete(m.user_id);
                    else next.add(m.user_id);
                    return next;
                  })}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                    hiddenAthletes.has(m.user_id)
                      ? "border-border text-muted-foreground"
                      : "border-transparent text-white"
                  }`}
                  style={{ backgroundColor: hiddenAthletes.has(m.user_id) ? "transparent" : COLORS[i % COLORS.length] + "40", borderColor: COLORS[i % COLORS.length] }}
                >
                  {displayName(m.profile)}
                </button>
              ))}
            </div>

            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="piece" label={{ value: "Piece", position: "insideBottom", offset: -2 }} tick={{ fontSize: 11 }} />
                <YAxis
                  reversed
                  tickFormatter={(v) => formatSplit(v)}
                  tick={{ fontSize: 10 }}
                  width={52}
                />
                <Tooltip formatter={(v: any) => formatSplit(v)} labelFormatter={(l) => `Piece ${l}`} />
                {athletes.map((m: any, i: number) =>
                  !hiddenAthletes.has(m.user_id) && (
                    <Line
                      key={m.user_id}
                      type="monotone"
                      dataKey={m.user_id}
                      stroke={COLORS[i % COLORS.length]}
                      dot={false}
                      strokeWidth={1.5}
                      name={displayName(m.profile)}
                    />
                  )
                )}
                <Line
                  type="monotone"
                  dataKey="average"
                  stroke="#ffffff"
                  strokeWidth={2.5}
                  strokeDasharray="6 3"
                  dot={false}
                  name="Team Average"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* AI Analysis */}
      {isCoach && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Brain className="h-4 w-4" />AI Analysis</CardTitle></CardHeader>
          <CardContent>
            {aiAnalysis ? (
              <div className="text-sm whitespace-pre-wrap text-muted-foreground">{aiAnalysis}</div>
            ) : (
              <Button variant="outline" size="sm" onClick={runAiAnalysis} disabled={aiLoading}>
                {aiLoading ? "Analyzing..." : "Run AI Analysis"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ErgAssignmentResults;
