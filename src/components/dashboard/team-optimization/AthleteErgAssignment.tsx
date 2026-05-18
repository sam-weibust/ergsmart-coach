import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { TimeInput } from "@/components/ui/TimeInput";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { ArrowLeft, Clock, Target, Dumbbell } from "lucide-react";
import { formatSplit } from "./constants";

function secondsToTimeStr(s: number | null): string {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function timeStrToSeconds(s: string): number | null {
  if (!s) return null;
  const [m, sec] = s.split(":").map(Number);
  return (m || 0) * 60 + (sec || 0);
}

function deadlineCountdown(deadline: string): string {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return "Overdue";
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h remaining`;
  if (h > 0) return `${h}h remaining`;
  return "Due soon";
}

interface ManualPieceEntry {
  piece_number: number;
  actual_split: string;
  actual_stroke_rate: number | null;
  notes: string;
}

interface Props {
  assignment: any;
  profile: any;
  onBack: () => void;
}

const AthleteErgAssignment = ({ assignment, profile, onBack }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [logMode, setLogMode] = useState<null | "manual">(null);
  const [completionNotes, setCompletionNotes] = useState("");
  const pieces: any[] = assignment.pieces || [];

  const [manualPieces, setManualPieces] = useState<ManualPieceEntry[]>(
    pieces.map((p: any) => ({
      piece_number: p.piece_number,
      actual_split: "",
      actual_stroke_rate: null,
      notes: "",
    }))
  );

  const { data: myResult } = useQuery({
    queryKey: ["my-erg-result", assignment.id, profile.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("erg_assignment_results" as any)
        .select("*")
        .eq("assignment_id", assignment.id)
        .eq("athlete_id", profile.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: teamAverage = [] } = useQuery({
    queryKey: ["team-average", assignment.id],
    queryFn: async () => {
      const { data } = await supabase
        .rpc("get_assignment_team_average" as any, { p_assignment_id: assignment.id });
      return data || [];
    },
    enabled: !!myResult && myResult.status === "completed",
  });

  const { data: myErgNumber } = useQuery({
    queryKey: ["my-erg-number", assignment.id, profile.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("erg_number_assignments" as any)
        .select("erg_number")
        .eq("assignment_id", assignment.id)
        .eq("athlete_id", profile.id)
        .maybeSingle();
      return data?.erg_number ?? null;
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const piecesData = manualPieces.map(p => ({
        piece_number: p.piece_number,
        actual_split_seconds: timeStrToSeconds(p.actual_split),
        actual_stroke_rate: p.actual_stroke_rate,
        notes: p.notes,
      }));

      const { error } = await supabase
        .from("erg_assignment_results" as any)
        .upsert({
          assignment_id: assignment.id,
          athlete_id: profile.id,
          status: "completed",
          manual_pieces: piecesData,
          completion_notes: completionNotes,
          logged_by_user_id: profile.id,
          logged_by_role: "athlete",
          completed_at: new Date().toISOString(),
        }, { onConflict: "assignment_id,athlete_id" });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Workout logged!" });
      setLogMode(null);
      queryClient.invalidateQueries({ queryKey: ["my-erg-result", assignment.id, profile.id] });
      queryClient.invalidateQueries({ queryKey: ["team-average", assignment.id] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const completed = myResult?.status === "completed";

  // Chart data: my splits vs team average
  const chartData = pieces.map((p: any) => {
    const myPiece = myResult?.manual_pieces?.find((mp: any) => mp.piece_number === p.piece_number);
    const avgPiece = teamAverage.find((a: any) => a.piece_number === p.piece_number);
    return {
      piece: p.piece_number,
      mine: myPiece?.actual_split_seconds ?? null,
      average: avgPiece ? Number(avgPiece.avg_split_seconds) : null,
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h2 className="font-semibold text-base">{assignment.title}</h2>
          <p className="text-xs text-muted-foreground">{assignment.scheduled_date}</p>
        </div>
        {myResult && (
          <Badge variant="outline" className={
            myResult.status === "completed" ? "bg-green-500/20 text-green-400 border-green-500/30" :
            myResult.status === "overdue" ? "bg-red-500/20 text-red-400 border-red-500/30" :
            "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
          }>
            {myResult.status}
          </Badge>
        )}
      </div>

      {myErgNumber && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
          <Dumbbell className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Your Erg: <span className="text-primary text-lg font-bold">{myErgNumber}</span></span>
        </div>
      )}

      {assignment.deadline && !completed && (
        <div className="flex items-center gap-2 text-sm text-yellow-400">
          <Clock className="h-4 w-4" />
          <span>{deadlineCountdown(assignment.deadline)}</span>
        </div>
      )}

      {assignment.description && (
        <p className="text-sm text-muted-foreground">{assignment.description}</p>
      )}

      {/* Pieces */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Workout Pieces</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {pieces.map((p: any) => (
            <div key={p.piece_number} className="flex items-start gap-3 p-2 rounded-lg bg-muted/30 border border-border">
              <div className="text-sm font-bold text-primary w-16 shrink-0">
                Piece {p.piece_number}
              </div>
              <div className="flex-1 space-y-0.5 text-xs">
                <div className="font-medium">{p.piece_type}</div>
                {p.distance && <div className="text-muted-foreground">{p.distance}m</div>}
                {p.duration_seconds && <div className="text-muted-foreground">{secondsToTimeStr(p.duration_seconds)}</div>}
                {p.target_split_seconds && (
                  <div className="flex items-center gap-1 text-blue-400">
                    <Target className="h-3 w-3" />
                    <span>Target: {formatSplit(p.target_split_seconds)}/500m</span>
                  </div>
                )}
                {p.target_stroke_rate && (
                  <div className="text-blue-400">SR: {p.target_stroke_rate} spm</div>
                )}
                {p.rest_seconds && (
                  <div className="text-muted-foreground">Rest: {secondsToTimeStr(p.rest_seconds)}</div>
                )}
                {p.notes && <div className="text-muted-foreground italic">{p.notes}</div>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Log buttons */}
      {!completed && myResult?.status !== "excused" && (
        <div className="flex gap-2">
          <Button onClick={() => setLogMode("manual")} variant="outline" className="flex-1">
            Log Manually
          </Button>
        </div>
      )}

      {/* Manual log form */}
      {logMode === "manual" && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Log Results</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {manualPieces.map((mp, idx) => {
              const targetPiece = pieces.find((p: any) => p.piece_number === mp.piece_number);
              return (
                <div key={mp.piece_number} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="text-sm font-medium">
                    Piece {mp.piece_number}
                    {targetPiece?.piece_type && <span className="text-muted-foreground ml-2 font-normal">{targetPiece.piece_type}</span>}
                    {targetPiece?.distance && <span className="text-muted-foreground ml-1 font-normal">· {targetPiece.distance}m</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs mb-1 block">
                        Actual Split /500m
                        {targetPiece?.target_split_seconds && (
                          <span className="text-blue-400 ml-1">(target: {formatSplit(targetPiece.target_split_seconds)})</span>
                        )}
                      </Label>
                      <TimeInput
                        value={mp.actual_split}
                        onChange={v => setManualPieces(prev => prev.map((p, i) => i === idx ? { ...p, actual_split: v } : p))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">
                        Stroke Rate
                        {targetPiece?.target_stroke_rate && (
                          <span className="text-blue-400 ml-1">(target: {targetPiece.target_stroke_rate})</span>
                        )}
                      </Label>
                      <Input
                        type="number"
                        placeholder="spm"
                        value={mp.actual_stroke_rate ?? ""}
                        onChange={e => setManualPieces(prev => prev.map((p, i) => i === idx ? { ...p, actual_stroke_rate: e.target.value ? Number(e.target.value) : null } : p))}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            <div>
              <Label className="text-xs mb-1 block">Notes (optional)</Label>
              <Textarea
                placeholder="How did it feel? Any issues?"
                rows={2}
                value={completionNotes}
                onChange={e => setCompletionNotes(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setLogMode(null)}>Cancel</Button>
              <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending} className="flex-1">
                {submitMutation.isPending ? "Saving..." : "Submit Results"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results: own vs team average (only after completing) */}
      {completed && myResult?.manual_pieces?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Your Results vs Team Average</CardTitle>
            <p className="text-xs text-muted-foreground">Lower split = faster</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 mb-4">
              {myResult.manual_pieces.map((p: any) => {
                const avgPiece = teamAverage.find((a: any) => a.piece_number === p.piece_number);
                const targetPiece = pieces.find((tp: any) => tp.piece_number === p.piece_number);
                return (
                  <div key={p.piece_number} className="flex items-center gap-3 text-xs">
                    <span className="w-16 text-muted-foreground shrink-0">Piece {p.piece_number}</span>
                    <span className="font-mono font-medium">
                      {p.actual_split_seconds ? formatSplit(p.actual_split_seconds) : "--:--"}
                    </span>
                    {avgPiece && (
                      <span className="text-muted-foreground">avg: {formatSplit(Number(avgPiece.avg_split_seconds))}</span>
                    )}
                    {targetPiece?.target_split_seconds && (
                      <span className="text-blue-400">target: {formatSplit(targetPiece.target_split_seconds)}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {teamAverage.length > 0 && (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="piece" tick={{ fontSize: 10 }} />
                  <YAxis reversed tickFormatter={(v) => formatSplit(v)} tick={{ fontSize: 9 }} width={46} />
                  <Tooltip formatter={(v: any) => formatSplit(v)} labelFormatter={(l) => `Piece ${l}`} />
                  <Line type="monotone" dataKey="mine" stroke="#60a5fa" strokeWidth={2} dot={false} name="You" />
                  <Line type="monotone" dataKey="average" stroke="#ffffff" strokeWidth={2} strokeDasharray="5 3" dot={false} name="Team Avg" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AthleteErgAssignment;
