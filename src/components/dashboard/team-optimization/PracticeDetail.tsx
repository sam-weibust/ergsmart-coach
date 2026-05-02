import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, ChevronDown, ChevronUp, Pencil, CheckCircle } from "lucide-react";
import PieceTracker from "./PieceTracker";
import DrillTracker from "./DrillTracker";
import CoxRatings from "./CoxRatings";
import PracticeVideoUpload from "./PracticeVideoUpload";

interface Props {
  teamId: string;
  isCoach: boolean;
  profile: any;
  seasonId?: string | null;
}

const PracticeDetail = ({ teamId, isCoach, profile, seasonId }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState("");

  const { data: sessions = [] } = useQuery({
    queryKey: ["practice-entries-list", teamId, seasonId],
    queryFn: async () => {
      let q = supabase
        .from("practice_entries" as any)
        .select("*, boat:team_boats(name), lineup:boat_lineups(name, boat_class, seats, workout_plan)")
        .eq("team_id", teamId)
        .order("practice_date", { ascending: false })
        .limit(30);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!teamId,
  });

  const selectedSession = (sessions as any[]).find((s: any) => s.id === selectedId);

  const updateNotes = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("practice_entries" as any)
        .update({ coach_notes: notesText })
        .eq("id", selectedId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Notes saved" });
      queryClient.invalidateQueries({ queryKey: ["practice-entries-list", teamId] });
      setEditingNotes(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const markLogged = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("practice_entries" as any)
        .update({ status: "logged" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["practice-entries-list", teamId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Practice Details</h2>
        <p className="text-sm text-muted-foreground">Log pieces, drills, ratings, and videos for each practice</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {/* Session list */}
        <div className="space-y-2">
          {(sessions as any[]).length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No practices yet. Publish a lineup to create one.
              </CardContent>
            </Card>
          )}
          {(sessions as any[]).map((s: any) => {
            const isSelected = s.id === selectedId;
            const dateStr = s.practice_date
              ? new Date(s.practice_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
              : "Unknown date";
            return (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedId(isSelected ? null : s.id);
                  setEditingNotes(false);
                  setNotesText(s.coach_notes || "");
                }}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{dateStr}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.boat?.name || s.lineup?.boat_class || "Practice"}
                        {s.lineup?.name ? ` — ${s.lineup.name}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={s.status === "logged" ? "default" : "outline"} className="text-[10px]">
                      {s.status === "logged" ? "Logged" : "Pending"}
                    </Badge>
                    {isSelected ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Session detail */}
        {selectedSession && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">
                  {selectedSession.practice_date
                    ? new Date(selectedSession.practice_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
                    : "Practice"}
                </CardTitle>
                {selectedSession.status !== "logged" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={() => markLogged.mutate(selectedSession.id)}
                    disabled={markLogged.isPending}
                  >
                    <CheckCircle className="h-3 w-3" />Mark Logged
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Lineup */}
              {selectedSession.lineup?.seats && Array.isArray(selectedSession.lineup.seats) && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Lineup</p>
                  <div className="flex flex-wrap gap-1">
                    {(selectedSession.lineup.seats as any[]).filter((s: any) => s.user_id).map((s: any) => (
                      <Badge key={s.seat_number} variant="secondary" className="text-[10px]">
                        {s.seat_number === 0 ? "Cox" : `#${s.seat_number}`}: {s.name || "?"}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Planned by Coach */}
              {selectedSession.lineup?.workout_plan && (
                <div className="rounded-lg border-l-2 border-primary/50 pl-3 py-1">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Planned by Coach</p>
                  <p className="text-sm whitespace-pre-wrap">{selectedSession.lineup.workout_plan}</p>
                </div>
              )}

              {/* Logged by Cox */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Logged by Cox</p>
              </div>

              {/* Pieces */}
              <PieceTracker
                sessionId={selectedSession.id}
                teamId={teamId}
                userId={profile.id}
              />

              {/* Drills */}
              <DrillTracker
                sessionId={selectedSession.id}
                teamId={teamId}
                userId={profile.id}
              />

              {/* Cox Technical Ratings */}
              <CoxRatings
                sessionId={selectedSession.id}
                teamId={teamId}
                userId={profile.id}
              />

              {/* Videos */}
              <PracticeVideoUpload
                sessionId={selectedSession.id}
                teamId={teamId}
                userId={profile.id}
              />

              {/* Coach notes */}
              {(isCoach || selectedSession.coach_notes) && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-muted-foreground">Coach Notes</p>
                    {isCoach && !editingNotes && (
                      <button
                        onClick={() => { setEditingNotes(true); setNotesText(selectedSession.coach_notes || ""); }}
                        className="text-muted-foreground hover:text-primary"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {editingNotes ? (
                    <div className="space-y-1.5">
                      <Textarea
                        className="text-sm min-h-[80px] resize-none"
                        value={notesText}
                        onChange={e => setNotesText(e.target.value)}
                        placeholder="Add coach notes..."
                      />
                      <div className="flex gap-2">
                        <Button size="sm" className="h-7 text-xs" onClick={() => updateNotes.mutate()} disabled={updateNotes.isPending}>Save</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingNotes(false)}>Cancel</Button>
                      </div>
                    </div>
                  ) : selectedSession.coach_notes ? (
                    <p className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded p-2">
                      {selectedSession.coach_notes}
                    </p>
                  ) : isCoach ? (
                    <button onClick={() => setEditingNotes(true)} className="text-xs text-primary hover:underline">Add notes...</button>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default PracticeDetail;
