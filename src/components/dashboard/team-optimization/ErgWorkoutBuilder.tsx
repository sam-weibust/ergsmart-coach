import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { TimeInput } from "@/components/ui/TimeInput";
import { useToast } from "@/hooks/use-toast";
import { X, Plus, GripVertical, ChevronUp, ChevronDown, Dumbbell } from "lucide-react";
import { formatSplit, displayName } from "./constants";

const PIECE_TYPES = ["Steady State", "Intervals", "Test", "Rate Work", "Custom"] as const;

interface Piece {
  piece_number: number;
  piece_type: string;
  use_distance: boolean;
  distance: number | null;
  duration_seconds: number | null;
  target_split: string;
  target_split_type: "exact" | "relative_2k";
  target_split_offset_seconds: number | null;
  target_stroke_rate: number | null;
  rest: string;
  notes: string;
}

function timeStrToSeconds(s: string): number | null {
  if (!s) return null;
  const [m, sec] = s.split(":").map(Number);
  return (m || 0) * 60 + (sec || 0);
}

function splitStrToSeconds(s: string): number | null {
  return timeStrToSeconds(s);
}

function secondsToTimeStr(s: number | null): string {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const emptyPiece = (n: number): Piece => ({
  piece_number: n,
  piece_type: "Steady State",
  use_distance: true,
  distance: null,
  duration_seconds: null,
  target_split: "",
  target_split_type: "exact",
  target_split_offset_seconds: null,
  target_stroke_rate: null,
  rest: "",
  notes: "",
});

interface Props {
  teamId: string;
  teamMembers: any[];
  profile: any;
  boats: any[];
  onClose: () => void;
  editAssignment?: any;
}

const ErgWorkoutBuilder = ({ teamId, teamMembers, profile, boats, onClose, editAssignment }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState(editAssignment?.title ?? "");
  const [description, setDescription] = useState(editAssignment?.description ?? "");
  const [notes, setNotes] = useState(editAssignment?.notes ?? "");
  const [videoUrl, setVideoUrl] = useState(editAssignment?.video_url ?? "");
  const [pieces, setPieces] = useState<Piece[]>(
    editAssignment?.pieces?.length
      ? editAssignment.pieces.map((p: any) => ({
          ...p,
          use_distance: !!p.distance,
          target_split: secondsToTimeStr(p.target_split_seconds),
          target_split_type: p.target_split_type ?? "exact",
          target_split_offset_seconds: p.target_split_offset_seconds ?? null,
          rest: secondsToTimeStr(p.rest_seconds),
        }))
      : [emptyPiece(1)]
  );

  const [assignType, setAssignType] = useState<"team" | "boat" | "athletes">("team");
  const [selectedBoat, setSelectedBoat] = useState<string>("");
  const [selectedAthletes, setSelectedAthletes] = useState<string[]>([]);
  const [ergNumbers, setErgNumbers] = useState<Record<string, string>>({});
  const [scheduledDate, setScheduledDate] = useState(editAssignment?.scheduled_date ?? "");
  const [hasDeadline, setHasDeadline] = useState(!!editAssignment?.deadline);
  const [deadline, setDeadline] = useState(editAssignment?.deadline ? editAssignment.deadline.slice(0, 16) : "");

  const athletes = teamMembers.filter((m: any) => m.profile?.role !== "coach" && !m.profile?.is_coxswain);

  const addPiece = () => {
    if (pieces.length >= 20) return;
    setPieces(prev => [...prev, emptyPiece(prev.length + 1)]);
  };

  const removePiece = (idx: number) => {
    setPieces(prev => prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, piece_number: i + 1 })));
  };

  const movePiece = (idx: number, dir: -1 | 1) => {
    const newPieces = [...pieces];
    const target = idx + dir;
    if (target < 0 || target >= newPieces.length) return;
    [newPieces[idx], newPieces[target]] = [newPieces[target], newPieces[idx]];
    setPieces(newPieces.map((p, i) => ({ ...p, piece_number: i + 1 })));
  };

  const updatePiece = (idx: number, field: keyof Piece, value: any) => {
    setPieces(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const getAssignedTo = (): string[] => {
    if (assignType === "team") return ["team"];
    if (assignType === "boat") return selectedBoat ? [selectedBoat] : [];
    return selectedAthletes;
  };

  const getAssignedAthletes = (): any[] => {
    const assigned = getAssignedTo();
    if (assigned.includes("team")) return athletes;
    if (assignType === "boat") {
      const boat = boats.find(b => b.id === selectedBoat);
      if (!boat?.seats) return [];
      const seatIds = (boat.seats as any[]).map((s: any) => s.user_id).filter(Boolean);
      return athletes.filter((m: any) => seatIds.includes(m.user_id));
    }
    return athletes.filter((m: any) => assigned.includes(m.user_id));
  };

  const publishMutation = useMutation({
    mutationFn: async (isDraft: boolean) => {
      const assignedTo = getAssignedTo();
      const ergNums = ergNumbers;

      const { data: assignment, error } = await supabase
        .from("erg_assignments" as any)
        .upsert({
          ...(editAssignment?.id ? { id: editAssignment.id } : {}),
          team_id: teamId,
          coach_id: profile.id,
          title,
          description,
          pieces: pieces.map(p => ({
            piece_number: p.piece_number,
            piece_type: p.piece_type,
            distance: p.use_distance ? p.distance : null,
            duration_seconds: !p.use_distance ? timeStrToSeconds(p.duration_seconds ? secondsToTimeStr(p.duration_seconds) : "") : null,
            target_split_seconds: p.target_split_type === "exact" ? splitStrToSeconds(p.target_split) : null,
            target_split_type: p.target_split_type,
            target_split_offset_seconds: p.target_split_type === "relative_2k" ? (p.target_split_offset_seconds ?? null) : null,
            target_stroke_rate: p.target_stroke_rate,
            rest_seconds: timeStrToSeconds(p.rest),
            notes: p.notes,
          })),
          assigned_to: assignedTo,
          scheduled_date: scheduledDate || null,
          deadline: hasDeadline && deadline ? new Date(deadline).toISOString() : null,
          notes,
          video_url: videoUrl,
          status: isDraft ? "draft" : "active",
        })
        .select()
        .single();

      if (error) throw error;

      // Upsert pieces into erg_assignment_pieces
      if (assignment) {
        await supabase.from("erg_assignment_pieces" as any).delete().eq("assignment_id", assignment.id);
        if (pieces.length > 0) {
          await supabase.from("erg_assignment_pieces" as any).insert(
            pieces.map(p => ({
              assignment_id: assignment.id,
              piece_number: p.piece_number,
              piece_type: p.piece_type,
              distance: p.use_distance ? p.distance : null,
              duration_seconds: !p.use_distance ? (p.duration_seconds ?? null) : null,
              target_split_seconds: p.target_split_type === "exact" ? splitStrToSeconds(p.target_split) : null,
              target_split_type: p.target_split_type,
              target_split_offset_seconds: p.target_split_type === "relative_2k" ? (p.target_split_offset_seconds ?? null) : null,
              target_stroke_rate: p.target_stroke_rate,
              rest_seconds: timeStrToSeconds(p.rest),
              notes: p.notes || null,
            }))
          );
        }

        // Save erg number assignments
        const ergEntries = Object.entries(ergNums).filter(([, num]) => num.trim());
        if (ergEntries.length > 0) {
          await supabase.from("erg_number_assignments" as any).delete()
            .eq("assignment_id", assignment.id);
          await supabase.from("erg_number_assignments" as any).insert(
            ergEntries.map(([athleteId, ergNum]) => ({
              assignment_id: assignment.id,
              team_id: teamId,
              coach_id: profile.id,
              athlete_id: athleteId,
              erg_number: ergNum,
              date: scheduledDate || new Date().toISOString().split("T")[0],
            }))
          );
        }

        // Create result rows for each assigned athlete (pending)
        if (!isDraft) {
          const assignedAthletes = getAssignedAthletes();
          for (const member of assignedAthletes) {
            await supabase.from("erg_assignment_results" as any)
              .upsert({
                assignment_id: assignment.id,
                athlete_id: member.user_id,
                status: "pending",
              }, { onConflict: "assignment_id,athlete_id" });
          }

          // Send push notifications
          const assignedUserIds = assignedAthletes.map(m => m.user_id);
          if (assignedUserIds.length > 0) {
            const coachName = profile?.full_name || profile?.username || "Your coach";
            supabase.functions.invoke("send-notification", {
              body: {
                user_ids: assignedUserIds,
                title: "New Workout Assigned",
                body: `${coachName} assigned a workout: ${title}`,
                data: { type: "erg_assignment", assignment_id: assignment.id, team_id: teamId },
              },
            }).catch(() => {});
          }
        }
      }

      return assignment;
    },
    onSuccess: (_, isDraft) => {
      toast({ title: isDraft ? "Saved as draft" : "Workout published" });
      queryClient.invalidateQueries({ queryKey: ["erg-assignments", teamId] });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 pb-24">
        <div className="flex items-center justify-between mb-6 sticky top-0 bg-background py-3 border-b border-border z-10">
          <div className="flex items-center gap-2">
            <Dumbbell className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Assign Erg Workout</h1>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Workout Details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs mb-1 block">Title *</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. 4x2000m @ 2k pace" />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Description</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Workout description and focus..." rows={2} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Video URL (optional)</Label>
                <Input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Coach Notes</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes for coaching staff..." rows={2} />
              </div>
            </CardContent>
          </Card>

          {/* Pieces */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Pieces ({pieces.length}/20)</CardTitle>
                <Button size="sm" variant="outline" onClick={addPiece} disabled={pieces.length >= 20}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Piece
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {pieces.map((piece, idx) => (
                <div key={idx} className="border border-border rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Piece {piece.piece_number}</span>
                      <select
                        value={piece.piece_type}
                        onChange={e => updatePiece(idx, "piece_type", e.target.value)}
                        className="text-xs border border-input rounded px-2 py-1 bg-background"
                      >
                        {PIECE_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => movePiece(idx, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button onClick={() => movePiece(idx, 1)} disabled={idx === pieces.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                        <ChevronDown className="h-4 w-4" />
                      </button>
                      <button onClick={() => removePiece(idx)} className="text-muted-foreground hover:text-destructive ml-1">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Label className="text-xs">
                          {piece.use_distance ? "Distance (m)" : "Duration"}
                        </Label>
                        <button
                          onClick={() => updatePiece(idx, "use_distance", !piece.use_distance)}
                          className="text-[10px] text-primary underline"
                        >
                          {piece.use_distance ? "→ Time" : "→ Distance"}
                        </button>
                      </div>
                      {piece.use_distance ? (
                        <Input
                          type="number"
                          placeholder="2000"
                          value={piece.distance ?? ""}
                          onChange={e => updatePiece(idx, "distance", e.target.value ? Number(e.target.value) : null)}
                        />
                      ) : (
                        <TimeInput
                          value={secondsToTimeStr(piece.duration_seconds)}
                          onChange={v => updatePiece(idx, "duration_seconds", timeStrToSeconds(v))}
                        />
                      )}
                    </div>
                    <div className="col-span-2">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Label className="text-xs">Target Split /500m</Label>
                        <div className="flex rounded overflow-hidden border border-input text-[10px] ml-auto">
                          {(["exact", "relative_2k"] as const).map(mode => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => updatePiece(idx, "target_split_type", mode)}
                              className={`px-2 py-1 transition-colors ${
                                piece.target_split_type === mode
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-background text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {mode === "exact" ? "Exact Split" : "Relative to 2K"}
                            </button>
                          ))}
                        </div>
                      </div>
                      {piece.target_split_type === "exact" ? (
                        <TimeInput
                          value={piece.target_split}
                          onChange={v => updatePiece(idx, "target_split", v)}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex rounded overflow-hidden border border-input text-xs">
                            {(["+", "-"] as const).map(sign => {
                              const isNeg = (piece.target_split_offset_seconds ?? 0) < 0;
                              const active = sign === "-" ? isNeg : !isNeg;
                              return (
                                <button
                                  key={sign}
                                  type="button"
                                  onClick={() => {
                                    const abs = Math.abs(piece.target_split_offset_seconds ?? 0);
                                    updatePiece(idx, "target_split_offset_seconds", sign === "-" ? -abs : abs);
                                  }}
                                  className={`px-3 py-2 font-bold transition-colors ${active ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
                                >
                                  {sign}
                                </button>
                              );
                            })}
                          </div>
                          <Input
                            type="number"
                            min={0}
                            max={120}
                            placeholder="15"
                            value={piece.target_split_offset_seconds !== null ? Math.abs(piece.target_split_offset_seconds) : ""}
                            onChange={e => {
                              const abs = e.target.value ? Number(e.target.value) : null;
                              const isNeg = (piece.target_split_offset_seconds ?? 0) < 0;
                              updatePiece(idx, "target_split_offset_seconds", abs !== null ? (isNeg ? -abs : abs) : null);
                            }}
                            className="w-20"
                          />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">sec from 2K pace</span>
                        </div>
                      )}
                      {piece.target_split_type === "relative_2k" && piece.target_split_offset_seconds !== null && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {piece.target_split_offset_seconds > 0
                            ? `2K + ${piece.target_split_offset_seconds}s (slower than 2K pace)`
                            : piece.target_split_offset_seconds < 0
                            ? `2K − ${Math.abs(piece.target_split_offset_seconds)}s (faster than 2K pace)`
                            : "2K pace"}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Target SR (spm)</Label>
                      <Input
                        type="number"
                        placeholder="22"
                        value={piece.target_stroke_rate ?? ""}
                        onChange={e => updatePiece(idx, "target_stroke_rate", e.target.value ? Number(e.target.value) : null)}
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Rest</Label>
                      <TimeInput
                        value={piece.rest}
                        onChange={v => updatePiece(idx, "rest", v)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Piece Notes</Label>
                    <Input
                      placeholder="Focus on technique, holding rate..."
                      value={piece.notes}
                      onChange={e => updatePiece(idx, "notes", e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Assignment */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Assign To</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                {(["team", "boat", "athletes"] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setAssignType(type)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      assignType === type
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary"
                    }`}
                  >
                    {type === "team" ? "Whole Team" : type === "boat" ? "Specific Boat" : "Individual Athletes"}
                  </button>
                ))}
              </div>

              {assignType === "boat" && (
                <select
                  value={selectedBoat}
                  onChange={e => setSelectedBoat(e.target.value)}
                  className="w-full border border-input rounded px-2 py-1.5 bg-background text-sm"
                >
                  <option value="">Select boat...</option>
                  {boats.map((b: any) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.boat_class})</option>
                  ))}
                </select>
              )}

              {assignType === "athletes" && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {athletes.map((m: any) => {
                    const checked = selectedAthletes.includes(m.user_id);
                    return (
                      <label key={m.user_id} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            if (e.target.checked) setSelectedAthletes(prev => [...prev, m.user_id]);
                            else setSelectedAthletes(prev => prev.filter(id => id !== m.user_id));
                          }}
                          className="rounded"
                        />
                        <span className="text-sm flex-1">{displayName(m.profile)}</span>
                        {m.profile?.best_2k_seconds && (
                          <span className="text-xs text-muted-foreground">{formatSplit(m.profile.best_2k_seconds / 4)}/500m</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Erg Numbers */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Erg Number Assignments (optional)</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {getAssignedAthletes().map((m: any) => (
                  <div key={m.user_id} className="flex items-center gap-3">
                    <span className="text-sm flex-1 truncate">{displayName(m.profile)}</span>
                    <Input
                      className="w-20 text-center"
                      placeholder="Erg #"
                      value={ergNumbers[m.user_id] ?? ""}
                      onChange={e => setErgNumbers(prev => ({ ...prev, [m.user_id]: e.target.value }))}
                    />
                  </div>
                ))}
                {getAssignedAthletes().length === 0 && (
                  <p className="text-xs text-muted-foreground">Select athletes above to assign erg numbers.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Schedule */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Schedule</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs mb-1 block">Scheduled Date</Label>
                <Input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={hasDeadline} onCheckedChange={setHasDeadline} id="deadline-toggle" />
                <Label htmlFor="deadline-toggle" className="text-sm">Set Deadline</Label>
              </div>
              {hasDeadline && (
                <div>
                  <Label className="text-xs mb-1 block">Deadline</Label>
                  <Input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border p-4 flex gap-3 justify-end max-w-3xl mx-auto">
          <Button variant="outline" onClick={onClose} disabled={publishMutation.isPending}>Cancel</Button>
          <Button
            variant="outline"
            onClick={() => publishMutation.mutate(true)}
            disabled={!title.trim() || publishMutation.isPending}
          >
            Save as Draft
          </Button>
          <Button
            onClick={() => publishMutation.mutate(false)}
            disabled={!title.trim() || publishMutation.isPending}
          >
            {publishMutation.isPending ? "Publishing..." : "Publish Workout"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ErgWorkoutBuilder;
