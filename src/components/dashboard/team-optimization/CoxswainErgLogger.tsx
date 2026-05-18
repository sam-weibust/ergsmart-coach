import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { TimeInput } from "@/components/ui/TimeInput";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Users } from "lucide-react";
import { formatSplit, displayName } from "./constants";

function timeStrToSeconds(s: string): number | null {
  if (!s) return null;
  const [m, sec] = s.split(":").map(Number);
  return (m || 0) * 60 + (sec || 0);
}

interface AthleteEntry {
  athleteId: string;
  name: string;
  pieces: Array<{
    piece_number: number;
    actual_split: string;
    actual_stroke_rate: number | null;
    notes: string;
  }>;
  completionNotes: string;
}

interface Props {
  assignment: any;
  teamId: string;
  teamMembers: any[];
  profile: any;
  boats: any[];
  onClose: () => void;
}

const CoxswainErgLogger = ({ assignment, teamId, teamMembers, profile, boats, onClose }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const pieces: any[] = assignment.pieces || [];

  // Find boats this coxswain is assigned to that match the assignment
  const assignedTo: string[] = assignment.assigned_to || [];
  const myCoxBoats = boats.filter((b: any) => {
    if (!assignedTo.includes(b.id) && !assignedTo.includes("team")) return false;
    const seats: any[] = b.seats || [];
    return seats.some((s: any) => s.is_cox && s.user_id === profile.id);
  });

  const [selectedBoatId, setSelectedBoatId] = useState<string>(myCoxBoats[0]?.id ?? "");

  const selectedBoat = boats.find((b: any) => b.id === selectedBoatId);
  const boatAthletes = selectedBoat
    ? ((selectedBoat.seats || []) as any[])
        .filter((s: any) => !s.is_cox && s.user_id)
        .map((s: any) => teamMembers.find((m: any) => m.user_id === s.user_id))
        .filter(Boolean)
    : [];

  const [entries, setEntries] = useState<AthleteEntry[]>(() =>
    boatAthletes.map((m: any) => ({
      athleteId: m.user_id,
      name: displayName(m.profile),
      pieces: pieces.map((p: any) => ({
        piece_number: p.piece_number,
        actual_split: "",
        actual_stroke_rate: null,
        notes: "",
      })),
      completionNotes: "",
    }))
  );

  // Rebuild entries when boat changes
  const handleBoatChange = (boatId: string) => {
    setSelectedBoatId(boatId);
    const boat = boats.find((b: any) => b.id === boatId);
    const athletes = boat
      ? ((boat.seats || []) as any[])
          .filter((s: any) => !s.is_cox && s.user_id)
          .map((s: any) => teamMembers.find((m: any) => m.user_id === s.user_id))
          .filter(Boolean)
      : [];
    setEntries(
      athletes.map((m: any) => ({
        athleteId: m.user_id,
        name: displayName(m.profile),
        pieces: pieces.map((p: any) => ({
          piece_number: p.piece_number,
          actual_split: "",
          actual_stroke_rate: null,
          notes: "",
        })),
        completionNotes: "",
      }))
    );
  };

  const updateEntry = (athleteIdx: number, field: string, value: any) => {
    setEntries(prev => prev.map((e, i) => i === athleteIdx ? { ...e, [field]: value } : e));
  };

  const updatePiece = (athleteIdx: number, pieceIdx: number, field: string, value: any) => {
    setEntries(prev => prev.map((e, i) => {
      if (i !== athleteIdx) return e;
      return {
        ...e,
        pieces: e.pieces.map((p, pi) => pi === pieceIdx ? { ...p, [field]: value } : p),
      };
    }));
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      for (const entry of entries) {
        const piecesData = entry.pieces.map(p => ({
          piece_number: p.piece_number,
          actual_split_seconds: timeStrToSeconds(p.actual_split),
          actual_stroke_rate: p.actual_stroke_rate,
          notes: p.notes,
        }));

        await supabase
          .from("erg_assignment_results" as any)
          .upsert({
            assignment_id: assignment.id,
            athlete_id: entry.athleteId,
            status: "completed",
            manual_pieces: piecesData,
            completion_notes: entry.completionNotes,
            logged_by_user_id: profile.id,
            logged_by_role: "coxswain",
            completed_at: new Date().toISOString(),
          }, { onConflict: "assignment_id,athlete_id" });
      }
    },
    onSuccess: () => {
      toast({ title: "Results submitted for all athletes" });
      queryClient.invalidateQueries({ queryKey: ["erg-assignment-results", assignment.id] });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-base">Log for Boat — {assignment.title}</h2>
        </div>
      </div>

      {myCoxBoats.length > 1 && (
        <div>
          <Label className="text-xs mb-1 block">Select Boat</Label>
          <select
            value={selectedBoatId}
            onChange={e => handleBoatChange(e.target.value)}
            className="w-full border border-input rounded px-2 py-1.5 bg-background text-sm"
          >
            {myCoxBoats.map((b: any) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}

      {entries.length === 0 && (
        <p className="text-sm text-muted-foreground">No athletes found in this boat.</p>
      )}

      <div className="space-y-4">
        {entries.map((entry, athleteIdx) => (
          <Card key={entry.athleteId}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{entry.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pieces.map((p: any, pieceIdx: number) => (
                <div key={p.piece_number} className="border border-border rounded-lg p-2 space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Piece {p.piece_number} — {p.piece_type}
                    {p.distance && ` · ${p.distance}m`}
                    {p.target_split_seconds && (
                      <span className="text-blue-400 ml-2">Target: {formatSplit(p.target_split_seconds)}/500m</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs mb-1 block">Actual Split /500m</Label>
                      <TimeInput
                        value={entry.pieces[pieceIdx]?.actual_split ?? ""}
                        onChange={v => updatePiece(athleteIdx, pieceIdx, "actual_split", v)}
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">SR (spm)</Label>
                      <Input
                        type="number"
                        placeholder={p.target_stroke_rate ? String(p.target_stroke_rate) : "spm"}
                        value={entry.pieces[pieceIdx]?.actual_stroke_rate ?? ""}
                        onChange={e => updatePiece(athleteIdx, pieceIdx, "actual_stroke_rate", e.target.value ? Number(e.target.value) : null)}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <div>
                <Label className="text-xs mb-1 block">Notes</Label>
                <Textarea
                  rows={1}
                  placeholder="Optional notes..."
                  value={entry.completionNotes}
                  onChange={e => updateEntry(athleteIdx, "completionNotes", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {entries.length > 0 && (
        <div className="flex gap-2 sticky bottom-0 bg-background py-3 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={submitMutation.isPending}>Cancel</Button>
          <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending} className="flex-1">
            {submitMutation.isPending ? "Submitting..." : `Submit for ${entries.length} Athlete${entries.length !== 1 ? "s" : ""}`}
          </Button>
        </div>
      )}
    </div>
  );
};

export default CoxswainErgLogger;
