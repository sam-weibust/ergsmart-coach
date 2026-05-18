import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { TimeInput } from "@/components/ui/TimeInput";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import {
  ArrowLeft, Clock, Target, Dumbbell, Bluetooth, ClipboardList,
  CheckCircle2, ChevronDown, ChevronUp
} from "lucide-react";
import { formatSplit } from "./constants";

function secondsToStr(s: number | null | undefined): string {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function strToSeconds(s: string): number | null {
  if (!s || !s.includes(":")) return null;
  const [m, sec] = s.split(":").map(Number);
  if (isNaN(m) || isNaN(sec)) return null;
  return m * 60 + sec;
}

function deadlineCountdown(deadline: string): string {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return "Overdue";
  const totalH = Math.floor(diff / 3600000);
  const d = Math.floor(totalH / 24);
  const h = totalH % 24;
  if (d > 0) return `${d}d ${h}h left`;
  if (totalH > 0) return `${totalH}h left`;
  return "Due very soon";
}

interface PieceEntry {
  piece_number: number;
  actual_split: string;
  actual_stroke_rate: string;
  notes: string;
}

interface Props {
  assignment: any;
  profile: any;
  onBack: () => void;
}

type View = "detail" | "log_manual" | "success";

export default function AthleteErgAssignment({ assignment, profile, onBack }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("detail");
  const [completionNotes, setCompletionNotes] = useState("");
  const [expandedPiece, setExpandedPiece] = useState<number | null>(null);

  const pieces: any[] = assignment.pieces || [];

  const [pieceEntries, setPieceEntries] = useState<PieceEntry[]>(
    pieces.map((p: any) => ({
      piece_number: p.piece_number,
      actual_split: "",
      actual_stroke_rate: "",
      notes: "",
    }))
  );

  const { data: myResult, isLoading: resultLoading } = useQuery({
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
    enabled: myResult?.status === "completed",
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

  // best 2K in seconds → pace = best2k / 4
  const { data: best2kSeconds } = useQuery({
    queryKey: ["my-best-2k", profile.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("erg_scores" as any)
        .select("time_seconds")
        .eq("user_id", profile.id)
        .eq("distance", 2000)
        .order("time_seconds", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data?.time_seconds ?? null;
    },
  });

  const my2kPaceSeconds: number | null = best2kSeconds ? best2kSeconds / 4 : null;

  function resolveTarget(p: any): { seconds: number | null; label: string | null } {
    const type = p.target_split_type ?? "exact";
    if (type === "exact") {
      return { seconds: p.target_split_seconds ?? null, label: null };
    }
    const offset: number = p.target_split_offset_seconds ?? 0;
    if (my2kPaceSeconds === null) return { seconds: null, label: null };
    const computed = Math.round(my2kPaceSeconds + offset);
    const sign = offset >= 0 ? "+" : "−";
    const label = `2K ${sign} ${Math.abs(offset)}s`;
    return { seconds: computed, label };
  }

  const submitMutation = useMutation({
    mutationFn: async () => {
      const hasAny = pieceEntries.some(p => p.actual_split.trim() !== "");
      if (!hasAny) throw new Error("Enter at least one split before submitting.");

      const piecesData = pieceEntries.map(p => ({
        piece_number: p.piece_number,
        actual_split_seconds: strToSeconds(p.actual_split),
        actual_stroke_rate: p.actual_stroke_rate ? Number(p.actual_stroke_rate) : null,
        notes: p.notes || null,
      }));

      const { error } = await supabase
        .from("erg_assignment_results" as any)
        .upsert(
          {
            assignment_id: assignment.id,
            athlete_id: profile.id,
            status: "completed",
            manual_pieces: piecesData,
            completion_notes: completionNotes || null,
            logged_by_user_id: profile.id,
            logged_by_role: "athlete",
            completed_at: new Date().toISOString(),
          },
          { onConflict: "assignment_id,athlete_id" }
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-erg-result", assignment.id, profile.id] });
      queryClient.invalidateQueries({ queryKey: ["my-erg-results", profile.id] });
      queryClient.invalidateQueries({ queryKey: ["my-erg-assignments-today"] });
      setView("success");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const completed = myResult?.status === "completed";
  const excused = myResult?.status === "excused";

  const updateEntry = (idx: number, field: keyof PieceEntry, value: string) => {
    setPieceEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  };

  const launchPM5 = () => {
    window.dispatchEvent(new CustomEvent("navigate_to_live_erg", {
      detail: { assignmentId: assignment.id, pieces: assignment.pieces || [] },
    }));
  };

  // ── Success screen ─────────────────────────────────────────────────────────
  if (view === "success") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground p-1">
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-green-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Workout Logged!</h2>
            <p className="text-sm text-muted-foreground mt-1">{assignment.title}</p>
          </div>
          <Button onClick={onBack} variant="outline" className="min-h-[44px] px-8">
            Back to Workouts
          </Button>
        </div>
      </div>
    );
  }

  // ── Manual log form ────────────────────────────────────────────────────────
  if (view === "log_manual") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 sticky top-0 bg-background py-2 z-10 border-b border-border">
          <button onClick={() => setView("detail")} className="text-muted-foreground hover:text-foreground p-1">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h2 className="font-semibold text-base">Log Manually</h2>
            <p className="text-xs text-muted-foreground">{assignment.title}</p>
          </div>
        </div>

        <div className="space-y-3">
          {pieceEntries.map((entry, idx) => {
            const target = pieces.find((p: any) => p.piece_number === entry.piece_number);
            const isOpen = expandedPiece === idx || pieces.length <= 3;
            return (
              <Card key={entry.piece_number}>
                <CardContent className="p-0">
                  <button
                    className="w-full flex items-center justify-between p-3 text-left"
                    onClick={() => setExpandedPiece(isOpen && pieces.length > 3 ? null : idx)}
                  >
                    <div>
                      <span className="font-medium text-sm">Piece {entry.piece_number}</span>
                      {target && (
                        <span className="text-muted-foreground text-xs ml-2">
                          {target.piece_type}
                          {target.distance ? ` · ${target.distance}m` : ""}
                          {(() => {
                            const { seconds, label } = resolveTarget(target);
                            const type = target.target_split_type ?? "exact";
                            if (type === "relative_2k" && my2kPaceSeconds === null) {
                              const off = target.target_split_offset_seconds ?? 0;
                              return ` · ${off >= 0 ? `2K + ${off}s` : `2K − ${Math.abs(off)}s`}`;
                            }
                            if (seconds) return ` · target ${formatSplit(seconds)}/500m${label ? ` (${label})` : ""}`;
                            return "";
                          })()}
                        </span>
                      )}
                    </div>
                    {pieces.length > 3 && (
                      isOpen
                        ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs mb-1.5 block">
                            Actual Split /500m
                            {target && (() => {
                              const { seconds, label } = resolveTarget(target);
                              const type = target.target_split_type ?? "exact";
                              if (type === "relative_2k" && my2kPaceSeconds === null) {
                                const off = target.target_split_offset_seconds ?? 0;
                                return <span className="text-yellow-400 ml-1 font-normal">{off >= 0 ? `2K + ${off}s` : `2K − ${Math.abs(off)}s`}</span>;
                              }
                              if (seconds) return <span className="text-blue-400 ml-1 font-normal">target: {formatSplit(seconds)}{label ? ` (${label})` : ""}</span>;
                              return null;
                            })()}
                          </Label>
                          <TimeInput
                            value={entry.actual_split}
                            onChange={v => updateEntry(idx, "actual_split", v)}
                          />
                        </div>
                        <div>
                          <Label className="text-xs mb-1.5 block">
                            Stroke Rate
                            {target?.target_stroke_rate && (
                              <span className="text-blue-400 ml-1 font-normal">
                                target: {target.target_stroke_rate}
                              </span>
                            )}
                          </Label>
                          <Input
                            type="number"
                            inputMode="numeric"
                            placeholder="spm"
                            min={10}
                            max={50}
                            value={entry.actual_stroke_rate}
                            onChange={e => updateEntry(idx, "actual_stroke_rate", e.target.value)}
                            className="min-h-[44px]"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs mb-1.5 block">Notes (optional)</Label>
                        <Input
                          placeholder="e.g. felt good, held rate"
                          value={entry.notes}
                          onChange={e => updateEntry(idx, "notes", e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div>
          <Label className="text-xs mb-1.5 block">Overall Notes (optional)</Label>
          <Textarea
            placeholder="How did the workout feel overall?"
            rows={2}
            value={completionNotes}
            onChange={e => setCompletionNotes(e.target.value)}
          />
        </div>

        <div className="sticky bottom-0 bg-background pt-2 pb-4 border-t border-border flex gap-3">
          <Button
            variant="outline"
            className="min-h-[48px] flex-none px-6"
            onClick={() => setView("detail")}
            disabled={submitMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            className="min-h-[48px] flex-1 text-base font-semibold"
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
          >
            {submitMutation.isPending ? "Saving…" : "Submit Workout"}
          </Button>
        </div>
      </div>
    );
  }

  // ── Detail view ────────────────────────────────────────────────────────────
  const chartData = pieces.map((p: any) => {
    const myPiece = myResult?.manual_pieces?.find((mp: any) => mp.piece_number === p.piece_number);
    const avgRow = teamAverage.find((a: any) => a.piece_number === p.piece_number);
    return {
      piece: p.piece_number,
      mine: myPiece?.actual_split_seconds ?? null,
      avg: avgRow ? Number(avgRow.avg_split_seconds) : null,
    };
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground p-1 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-base leading-tight">{assignment.title}</h2>
          {assignment.scheduled_date && (
            <p className="text-xs text-muted-foreground">{assignment.scheduled_date}</p>
          )}
        </div>
        {!resultLoading && myResult && (
          <Badge variant="outline" className={
            completed ? "bg-green-500/20 text-green-400 border-green-500/30" :
            myResult.status === "overdue" ? "bg-red-500/20 text-red-400 border-red-500/30" :
            excused ? "bg-gray-500/20 text-gray-400 border-gray-500/30" :
            "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
          }>
            {excused ? "Excused" : myResult.status}
          </Badge>
        )}
      </div>

      {/* Erg number */}
      {myErgNumber && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/10 border border-primary/20">
          <Dumbbell className="h-5 w-5 text-primary shrink-0" />
          <span className="text-sm font-medium">Your Erg: <span className="text-primary text-xl font-bold ml-1">{myErgNumber}</span></span>
        </div>
      )}

      {/* Deadline */}
      {assignment.deadline && !completed && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <Clock className="h-4 w-4 text-yellow-400 shrink-0" />
          <span className="text-sm text-yellow-400">{deadlineCountdown(assignment.deadline)}</span>
        </div>
      )}

      {/* Description */}
      {assignment.description && (
        <p className="text-sm text-muted-foreground leading-relaxed">{assignment.description}</p>
      )}

      {/* Pieces */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Workout Pieces</h3>
        {pieces.length === 0 && (
          <p className="text-xs text-muted-foreground">No pieces defined for this workout.</p>
        )}
        {pieces.map((p: any) => (
          <Card key={p.piece_number}>
            <CardContent className="p-3 flex gap-3">
              <div className="flex flex-col items-center justify-start min-w-[48px]">
                <span className="text-xs text-muted-foreground">Piece</span>
                <span className="text-xl font-bold text-primary">{p.piece_number}</span>
              </div>
              <div className="flex-1 space-y-1 text-sm">
                <div className="font-medium">{p.piece_type}</div>
                {p.distance && <div className="text-muted-foreground text-xs">{p.distance}m</div>}
                {p.duration_seconds && <div className="text-muted-foreground text-xs">{secondsToStr(p.duration_seconds)}</div>}
                {(() => {
                  const { seconds, label } = resolveTarget(p);
                  const type = p.target_split_type ?? "exact";
                  const hasNoRecord = type === "relative_2k" && my2kPaceSeconds === null;
                  if (hasNoRecord) {
                    return (
                      <div className="text-xs text-yellow-400">
                        <span className="font-medium">
                          {(p.target_split_offset_seconds ?? 0) >= 0
                            ? `2K + ${p.target_split_offset_seconds ?? 0}s`
                            : `2K − ${Math.abs(p.target_split_offset_seconds ?? 0)}s`}
                        </span>
                        <span className="text-muted-foreground ml-1">— log a 2K test to see your personalized target</span>
                      </div>
                    );
                  }
                  if (!seconds) return null;
                  return (
                    <div className="flex items-center gap-1.5 text-blue-400 text-xs font-medium">
                      <Target className="h-3.5 w-3.5 shrink-0" />
                      <span>Target {formatSplit(seconds)} /500m{label ? ` (${label})` : ""}</span>
                    </div>
                  );
                })()}
                {p.target_stroke_rate && (
                  <div className="text-blue-400 text-xs font-medium">SR: {p.target_stroke_rate} spm</div>
                )}
                {p.rest_seconds && (
                  <div className="text-muted-foreground text-xs">Rest: {secondsToStr(p.rest_seconds)}</div>
                )}
                {p.notes && <div className="text-muted-foreground text-xs italic">{p.notes}</div>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Log buttons — only if not completed/excused */}
      {!completed && !excused && (
        <div className="space-y-3 pt-2">
          <p className="text-xs text-muted-foreground text-center font-medium uppercase tracking-wide">Log This Workout</p>
          <div className="flex gap-3">
            <Button
              className="flex-1 min-h-[52px] text-sm font-semibold flex-col gap-1 h-auto py-3"
              onClick={launchPM5}
            >
              <Bluetooth className="h-5 w-5" />
              <span>Log with PM5</span>
            </Button>
            <Button
              variant="outline"
              className="flex-1 min-h-[52px] text-sm font-semibold flex-col gap-1 h-auto py-3"
              onClick={() => setView("log_manual")}
            >
              <ClipboardList className="h-5 w-5" />
              <span>Log Manually</span>
            </Button>
          </div>
        </div>
      )}

      {excused && (
        <div className="flex items-center gap-2 px-3 py-3 rounded-lg bg-gray-500/10 border border-gray-500/20 text-sm text-gray-400">
          This workout is marked as excused.
        </div>
      )}

      {/* Post-completion: results vs team avg */}
      {completed && myResult?.manual_pieces?.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Your Results</h3>
          <div className="space-y-1.5">
            {myResult.manual_pieces.map((p: any) => {
              const target = pieces.find((tp: any) => tp.piece_number === p.piece_number);
              const avgRow = teamAverage.find((a: any) => a.piece_number === p.piece_number);
              return (
                <div key={p.piece_number} className="flex items-center gap-3 text-sm px-1">
                  <span className="text-muted-foreground w-16 shrink-0">Piece {p.piece_number}</span>
                  <span className="font-mono font-medium text-foreground">
                    {p.actual_split_seconds ? formatSplit(p.actual_split_seconds) : "--:--"}
                  </span>
                  {target && (() => {
                    const { seconds, label } = resolveTarget(target);
                    if (!seconds) return null;
                    return <span className="text-blue-400 text-xs">target: {formatSplit(seconds)}{label ? ` (${label})` : ""}</span>;
                  })()}
                  {avgRow && (
                    <span className="text-muted-foreground text-xs ml-auto">avg: {formatSplit(Number(avgRow.avg_split_seconds))}</span>
                  )}
                </div>
              );
            })}
          </div>

          {chartData.some(d => d.mine !== null) && (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="piece" tick={{ fontSize: 10 }} label={{ value: "Piece", position: "insideBottom", offset: -2, fontSize: 10 }} />
                <YAxis reversed tickFormatter={formatSplit} tick={{ fontSize: 9 }} width={48} />
                <Tooltip formatter={(v: any) => formatSplit(v)} labelFormatter={(l) => `Piece ${l}`} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="mine" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3 }} name="You" connectNulls />
                {teamAverage.length > 0 && (
                  <Line type="monotone" dataKey="avg" stroke="#ffffff80" strokeWidth={2} strokeDasharray="5 3" dot={false} name="Team Avg" connectNulls />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}
