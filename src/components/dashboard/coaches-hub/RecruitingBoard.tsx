import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, User, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AthleteProfilePanel } from "./AthleteProfilePanel";
import { AthleteProfile, BoardStatus } from "./types";
import { fmtSeconds } from "./utils";

const COLUMNS: { id: BoardStatus; label: string; color: string }[] = [
  { id: "watching", label: "Watching", color: "bg-muted" },
  { id: "contacted", label: "Contacted", color: "bg-blue-100 dark:bg-blue-900/30" },
  { id: "interested", label: "Interested", color: "bg-yellow-100 dark:bg-yellow-900/30" },
  { id: "offered", label: "Offered", color: "bg-orange-100 dark:bg-orange-900/30" },
  { id: "committed", label: "Committed", color: "bg-green-100 dark:bg-green-900/30" },
  { id: "not_a_fit", label: "Not a Fit", color: "bg-red-100 dark:bg-red-900/30" },
];

interface Props {
  coachId: string;
  coachProfile: any;
}

export function RecruitingBoard({ coachId, coachProfile }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedAthlete, setSelectedAthlete] = useState<AthleteProfile | null>(null);
  const [dragOver, setDragOver] = useState<BoardStatus | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const { data: boardEntries, isLoading } = useQuery({
    queryKey: ["recruiting-board", coachId],
    queryFn: async () => {
      const { data } = await supabase
        .from("recruiting_board")
        .select("*")
        .eq("coach_id", coachId)
        .order("updated_at", { ascending: false });
      return data ?? [];
    },
  });

  const athleteIds = (boardEntries ?? []).map((e: any) => e.athlete_user_id);

  const { data: athleteProfiles } = useQuery({
    queryKey: ["board-athlete-profiles", athleteIds],
    enabled: athleteIds.length > 0,
    queryFn: async () => {
      const { data: aps } = await supabase
        .from("athlete_profiles")
        .select("*, profiles!inner(full_name, height, weight, experience_level, username)")
        .in("user_id", athleteIds);

      if (!aps?.length) return {};

      const { data: ergScores } = await supabase
        .from("erg_scores")
        .select("user_id, time_seconds, watts, watts_per_kg, recorded_at")
        .in("user_id", athleteIds)
        .eq("test_type", "2k")
        .order("recorded_at", { ascending: false });

      const bestScores: Record<string, any> = {};
      for (const s of ergScores ?? []) {
        if (!bestScores[s.user_id] || s.time_seconds < bestScores[s.user_id].time_seconds) {
          bestScores[s.user_id] = s;
        }
      }

      const { data: combines } = await supabase
        .from("combine_entries")
        .select("user_id, virtual_combine_score")
        .in("user_id", athleteIds);
      const combineByUser: Record<string, any> = {};
      for (const c of combines ?? []) { if (!combineByUser[c.user_id]) combineByUser[c.user_id] = c; }

      const map: Record<string, AthleteProfile> = {};
      for (const ap of aps) {
        map[ap.user_id] = {
          ...ap,
          best_2k: bestScores[ap.user_id] ?? null,
          combine_score: combineByUser[ap.user_id]?.virtual_combine_score ?? null,
        };
      }
      return map;
    },
  });

  const moveMutation = useMutation({
    mutationFn: async ({ athleteUserId, status }: { athleteUserId: string; status: BoardStatus }) => {
      await supabase.from("recruiting_board")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("coach_id", coachId)
        .eq("athlete_user_id", athleteUserId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recruiting-board"] }),
    onError: () => toast({ title: "Failed to move athlete", variant: "destructive" }),
  });

  const updateNotesMutation = useMutation({
    mutationFn: async ({ athleteUserId, notes }: { athleteUserId: string; notes: string }) => {
      await supabase.from("recruiting_board")
        .update({ notes, updated_at: new Date().toISOString() })
        .eq("coach_id", coachId)
        .eq("athlete_user_id", athleteUserId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recruiting-board"] });
      toast({ title: "Notes saved" });
    },
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (!boardEntries?.length) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-lg font-medium">No athletes on your board yet</p>
        <p className="text-sm mt-1">Add athletes from the Discover feed to get started</p>
      </div>
    );
  }

  const byStatus: Record<BoardStatus, any[]> = {
    watching: [], contacted: [], interested: [], offered: [], committed: [], not_a_fit: [],
  };
  for (const entry of boardEntries ?? []) {
    const s = entry.status as BoardStatus;
    if (byStatus[s]) byStatus[s].push(entry);
  }

  return (
    <div>
      {/* Kanban board - horizontal scroll */}
      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
        {COLUMNS.map((col) => {
          const entries = byStatus[col.id];
          return (
            <div
              key={col.id}
              className={`shrink-0 w-60 rounded-xl border border-border overflow-hidden ${dragOver === col.id ? "border-primary ring-1 ring-primary" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(col.id); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                if (dragging) moveMutation.mutate({ athleteUserId: dragging, status: col.id });
                setDragging(null);
              }}
            >
              <div className={`px-3 py-2 ${col.color} border-b border-border`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{col.label}</span>
                  <Badge variant="secondary" className="text-xs h-5 min-w-[20px] flex items-center justify-center">{entries.length}</Badge>
                </div>
              </div>
              <div className="p-2 space-y-2 min-h-[300px]">
                {entries.map((entry) => {
                  const ap = athleteProfiles?.[entry.athlete_user_id];
                  return (
                    <BoardCard
                      key={entry.id}
                      entry={entry}
                      ap={ap ?? null}
                      onDragStart={() => setDragging(entry.athlete_user_id)}
                      onClick={() => ap && setSelectedAthlete(ap)}
                      onSaveNotes={(notes) => updateNotesMutation.mutate({ athleteUserId: entry.athlete_user_id, notes })}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <AthleteProfilePanel
        athlete={selectedAthlete}
        coachId={coachId}
        coachProfile={coachProfile}
        onClose={() => setSelectedAthlete(null)}
        onOpenEmail={() => setSelectedAthlete(null)}
      />
    </div>
  );
}

function BoardCard({
  entry,
  ap,
  onDragStart,
  onClick,
  onSaveNotes,
}: {
  entry: any;
  ap: AthleteProfile | null;
  onDragStart: () => void;
  onClick: () => void;
  onSaveNotes: (n: string) => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState(entry.notes ?? "");
  const name = ap?.profiles?.full_name ?? "Athlete";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="bg-card border border-border rounded-lg p-2.5 cursor-grab active:cursor-grabbing hover:border-primary/40 transition-all"
    >
      <div className="flex items-center gap-2" onClick={onClick}>
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
          {ap?.avatar_url ? (
            <img src={ap.avatar_url} alt={name} className="w-full h-full object-cover rounded-full" />
          ) : (
            <User className="h-4 w-4 text-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{name}</p>
          <p className="text-[10px] text-muted-foreground">
            {ap?.grad_year ? `'${String(ap.grad_year).slice(2)}` : ""}{" "}
            {ap?.best_2k ? fmtSeconds(ap.best_2k.time_seconds) : ""}
          </p>
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); setNotesOpen(!notesOpen); }}
        className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown className={`h-3 w-3 transition-transform ${notesOpen ? "rotate-180" : ""}`} />
        {entry.notes ? "Notes" : "Add notes"}
      </button>
      {notesOpen && (
        <div className="mt-1.5 space-y-1" onClick={(e) => e.stopPropagation()}>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Log contact, observations..."
            className="text-xs min-h-[60px] resize-none"
          />
          <Button size="sm" className="h-6 text-xs w-full" onClick={() => { onSaveNotes(notes); setNotesOpen(false); }}>
            Save
          </Button>
        </div>
      )}
    </div>
  );
}
