import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Edit2, Send, ChevronDown, ChevronUp, Ship, Users,
  MessageSquare, MoreHorizontal, Loader2, Plus, X, Save,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import TeamMessageBoard from "./TeamMessageBoard";
import { SIDEBAR_ITEMS } from "./constants";
import { cn } from "@/lib/utils";

// Seat display order: Cox (0) then 8 down to 1
const SEAT_ORDER = [0, 8, 7, 6, 5, 4, 3, 2, 1];

interface Props {
  teamId: string;
  teamName: string;
  teamMembers: any[];
  profile: any;
  boats: any[];
  seasonId?: string | null;
  onNavigate: (section: string) => void;
}

const CoachTodayView = ({ teamId, teamName, teamMembers, profile, boats, seasonId, onNavigate }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const todayStr = new Date().toISOString().split("T")[0];

  const [editingWorkout, setEditingWorkout] = useState(false);
  const [workoutEditText, setWorkoutEditText] = useState("");
  const [rosterOpen, setRosterOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // lineupEdits: { [lineupId]: { [seatNumber]: { user_id, name } | null } }
  const [lineupEdits, setLineupEdits] = useState<Record<string, Record<number, any>>>({});
  const [seatDialog, setSeatDialog] = useState<{ lineupId: string; seatNumber: number } | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: practiceEntry } = useQuery({
    queryKey: ["today-practice-entry", teamId, todayStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("practice_entries")
        .select("*")
        .eq("team_id", teamId)
        .eq("practice_date", todayStr)
        .maybeSingle();
      return data;
    },
  });

  const { data: todayLineups = [], isLoading: lineupsLoading } = useQuery({
    queryKey: ["today-lineups-all", teamId, todayStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("boat_lineups")
        .select("*")
        .eq("team_id", teamId)
        .eq("practice_date", todayStr)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  const { data: todayAttendance = [] } = useQuery({
    queryKey: ["today-attendance-coach", teamId, todayStr],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("attendance")
        .select("*")
        .eq("team_id", teamId)
        .eq("date", todayStr);
      return data || [];
    },
  });

  const { data: latestMessage } = useQuery({
    queryKey: ["latest-board-message", teamId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("team_board_posts")
        .select("content, author:profiles(full_name)")
        .eq("team_id", teamId)
        .is("parent_id", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // ── Realtime: attendance ──────────────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel(`coach-attendance-${teamId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "attendance",
        filter: `team_id=eq.${teamId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ["today-attendance-coach", teamId, todayStr] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [teamId, todayStr, queryClient]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const saveDraft = useMutation({
    mutationFn: async (text: string) => {
      if (practiceEntry?.id) {
        const { error } = await supabase
          .from("practice_entries")
          .update({ workout_draft: text, updated_at: new Date().toISOString() } as any)
          .eq("id", practiceEntry.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("practice_entries").insert({
          team_id: teamId,
          practice_date: todayStr,
          workout_draft: text,
          created_by: profile?.id,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Draft saved" });
      setEditingWorkout(false);
      queryClient.invalidateQueries({ queryKey: ["today-practice-entry", teamId, todayStr] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const publishWorkout = useMutation({
    mutationFn: async (text: string) => {
      if (practiceEntry?.id) {
        const { error } = await supabase
          .from("practice_entries")
          .update({
            workout_description: text,
            workout_draft: null,
            workout_published_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", practiceEntry.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("practice_entries").insert({
          team_id: teamId,
          practice_date: todayStr,
          workout_description: text,
          workout_published_at: new Date().toISOString(),
          created_by: profile?.id,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Workout published!", description: "Athletes can now see today's workout." });
      setEditingWorkout(false);
      queryClient.invalidateQueries({ queryKey: ["today-practice-entry", teamId, todayStr] });
      const coachName = profile?.full_name || profile?.username || "Your coach";
      supabase.functions.invoke("send-notification", {
        body: {
          team_id: teamId,
          title: "Workout Posted",
          body: `${coachName} posted today's workout. Check the app to see your assignment.`,
          data: { type: "workout_published", team_id: teamId, date: todayStr },
          exclude_coaches: true,
        },
      }).catch(() => {});
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const publishLineup = useMutation({
    mutationFn: async ({ lineupId, seats }: { lineupId: string; seats: any[] }) => {
      const { error } = await supabase
        .from("boat_lineups")
        .update({ seats, published_at: new Date().toISOString() })
        .eq("id", lineupId);
      if (error) throw error;
    },
    onSuccess: (_, { lineupId }) => {
      toast({ title: "Lineup published!" });
      setLineupEdits(prev => { const n = { ...prev }; delete n[lineupId]; return n; });
      queryClient.invalidateQueries({ queryKey: ["today-lineups-all", teamId, todayStr] });
      const coachName = profile?.full_name || profile?.username || "Your coach";
      const dateLabel = new Date(todayStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
      supabase.functions.invoke("send-notification", {
        body: {
          team_id: teamId,
          title: "Lineup Posted",
          body: `${coachName} posted the lineup for ${dateLabel}. Check the app to see your seat.`,
          data: { type: "lineup_published", team_id: teamId, date: todayStr },
          exclude_coaches: true,
        },
      }).catch(() => {});
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const assignSeat = useCallback((lineupId: string, seatNumber: number, member: { user_id: string; name: string } | null) => {
    setLineupEdits(prev => ({
      ...prev,
      [lineupId]: { ...(prev[lineupId] || {}), [seatNumber]: member },
    }));
    setSeatDialog(null);
  }, []);

  const handlePublishLineup = (lineup: any) => {
    const edits = lineupEdits[lineup.id] || {};
    let seats: any[] = Array.isArray(lineup.seats) ? lineup.seats.map((s: any) => ({ ...s })) : [];
    Object.entries(edits).forEach(([seatNum, member]) => {
      const num = parseInt(seatNum);
      const idx = seats.findIndex((s: any) => s.seat_number === num);
      if (member === null) {
        if (idx >= 0) seats[idx] = { ...seats[idx], user_id: null, name: null };
      } else if (member) {
        if (idx >= 0) {
          seats[idx] = { ...seats[idx], user_id: (member as any).user_id, name: (member as any).name };
        } else {
          seats.push({ seat_number: num, user_id: (member as any).user_id, name: (member as any).name });
        }
      }
    });
    publishLineup.mutate({ lineupId: lineup.id, seats });
  };

  // ── Derived ──────────────────────────────────────────────────────────────────

  const attendanceByUser = Object.fromEntries(todayAttendance.map((a: any) => [a.user_id, a]));
  const confirmedCount = todayAttendance.filter((a: any) => a.status === "present").length;
  const absentCount = todayAttendance.filter((a: any) => a.status === "absent").length;
  const noResponseCount = teamMembers.length - confirmedCount - absentCount;

  const hasDraft = !!(practiceEntry as any)?.workout_draft;
  const hasPublished = !!(practiceEntry as any)?.workout_description;

  const moreSections = SIDEBAR_ITEMS.filter(i => i.key !== "today");

  const teamMemberList = teamMembers.map((m: any) => ({
    user_id: m.user_id,
    name: m.profile?.full_name || m.profile?.username || "Unknown",
  })).sort((a, b) => a.name.localeCompare(b.name));

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Section 1: Workout ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Today's Workout
              {hasDraft && !editingWorkout && (
                <Badge className="bg-yellow-500/20 text-yellow-700 border-yellow-500/40 text-[10px]">Draft</Badge>
              )}
            </CardTitle>
            {!editingWorkout && (
              <Button
                size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                onClick={() => {
                  setWorkoutEditText((practiceEntry as any)?.workout_draft || (practiceEntry as any)?.workout_description || "");
                  setEditingWorkout(true);
                }}
              >
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editingWorkout ? (
            <div className="space-y-2">
              <Textarea
                value={workoutEditText}
                onChange={e => setWorkoutEditText(e.target.value)}
                placeholder="Describe today's workout..."
                rows={4}
                className="text-sm resize-none"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm" variant="outline" className="gap-1.5 h-8 text-xs"
                  onClick={() => saveDraft.mutate(workoutEditText)}
                  disabled={saveDraft.isPending || !workoutEditText.trim()}
                >
                  {saveDraft.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save Draft
                </Button>
                <Button
                  size="sm" className="gap-1.5 h-8 text-xs"
                  onClick={() => publishWorkout.mutate(workoutEditText)}
                  disabled={publishWorkout.isPending || !workoutEditText.trim()}
                >
                  {publishWorkout.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Publish
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditingWorkout(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : hasDraft ? (
            <div className="space-y-3">
              <p className="text-sm text-foreground/70 whitespace-pre-wrap italic">{(practiceEntry as any).workout_draft}</p>
              {hasPublished && (
                <p className="text-xs text-muted-foreground">
                  Published: {(practiceEntry as any).workout_description?.slice(0, 60)}…
                </p>
              )}
              <Button
                size="sm" className="gap-1.5 h-8 text-xs"
                onClick={() => publishWorkout.mutate((practiceEntry as any).workout_draft)}
                disabled={publishWorkout.isPending}
              >
                <Send className="h-3 w-3" />Publish to Athletes
              </Button>
            </div>
          ) : hasPublished ? (
            <p className="text-sm text-foreground whitespace-pre-wrap">{(practiceEntry as any).workout_description}</p>
          ) : (
            <button
              className="w-full text-left text-sm text-muted-foreground border-2 border-dashed border-border rounded-xl p-4 hover:border-primary/40 transition-colors"
              onClick={() => { setWorkoutEditText(""); setEditingWorkout(true); }}
            >
              + Write today's workout
            </button>
          )}
        </CardContent>
      </Card>

      {/* ── Section 2: Lineups ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Ship className="h-4 w-4 text-primary" />Lineups
          </h3>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onNavigate("lineups")}>
            <Plus className="h-3 w-3" />New
          </Button>
        </div>

        {lineupsLoading ? (
          <p className="text-xs text-muted-foreground py-2">Loading...</p>
        ) : todayLineups.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center space-y-3">
              <p className="text-sm text-muted-foreground">No lineups for today.</p>
              <Button size="sm" variant="outline" className="text-xs" onClick={() => onNavigate("lineups")}>
                Create Lineup
              </Button>
            </CardContent>
          </Card>
        ) : (
          todayLineups.map((lineup: any) => {
            const isPublished = !!lineup.published_at;
            const edits = lineupEdits[lineup.id] || {};
            const hasEdits = Object.keys(edits).length > 0;
            const rawSeats: any[] = Array.isArray(lineup.seats) ? lineup.seats : [];
            const boat = boats.find((b: any) => b.id === lineup.boat_id);

            // Build merged display seats in C, 8..1 order
            const knownSeatNums = new Set([
              ...rawSeats.map((s: any) => s.seat_number),
              ...Object.keys(edits).map(Number),
            ]);
            const displayOrder = SEAT_ORDER.filter(n => knownSeatNums.has(n));

            const displaySeats = displayOrder.map(seatNum => {
              if (seatNum in edits) {
                const ed = edits[seatNum];
                return { seat_number: seatNum, user_id: ed?.user_id || null, name: ed?.name || null, _edited: true };
              }
              const fromDb = rawSeats.find((s: any) => s.seat_number === seatNum);
              return fromDb || { seat_number: seatNum, user_id: null, name: null };
            });

            return (
              <Card key={lineup.id} className={cn(hasEdits && "ring-1 ring-yellow-500/30")}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground flex-1">
                      {boat?.name || lineup.name}
                    </span>
                    <Badge variant="outline" className="text-[10px]">{lineup.boat_class}</Badge>
                    {!isPublished && (
                      <Badge className="bg-yellow-500/20 text-yellow-700 border-yellow-500/40 text-[10px]">Draft</Badge>
                    )}
                    {hasEdits && (
                      <Badge className="bg-yellow-500/20 text-yellow-700 border-yellow-500/40 text-[10px]">Unsaved edits</Badge>
                    )}
                    <Button
                      size="sm" className="h-7 text-xs shrink-0 gap-1"
                      onClick={() => handlePublishLineup(lineup)}
                      disabled={publishLineup.isPending}
                    >
                      <Send className="h-3 w-3" />
                      {isPublished && !hasEdits ? "Re-publish" : "Publish"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-0.5">
                    {displaySeats.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2 text-center">
                        No seats configured.{" "}
                        <button className="text-primary underline" onClick={() => onNavigate("lineups")}>
                          Open builder
                        </button>
                      </p>
                    ) : displaySeats.map((seat: any) => (
                      <button
                        key={seat.seat_number}
                        onClick={() => setSeatDialog({ lineupId: lineup.id, seatNumber: seat.seat_number })}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left w-full transition-colors",
                          seat.user_id ? "hover:bg-muted/50" : "border border-dashed border-border/60 hover:border-primary/40 hover:bg-primary/5",
                          (seat as any)._edited && "bg-yellow-500/10"
                        )}
                      >
                        <span className="text-xs text-muted-foreground w-8 shrink-0 font-mono">
                          {seat.seat_number === 0 ? "Cox" : `S${seat.seat_number}`}
                        </span>
                        {seat.user_id ? (
                          <span className="text-foreground">{seat.name || "Unknown"}</span>
                        ) : (
                          <span className="text-muted-foreground/60 italic text-xs">Tap to assign</span>
                        )}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* ── Section 3: Roster (collapsed) ───────────────────────────────────────── */}
      <Collapsible open={rosterOpen} onOpenChange={setRosterOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-3 cursor-pointer select-none">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Roster
                  <span className="text-xs text-muted-foreground font-normal">
                    · {confirmedCount} confirmed · {absentCount} absent · {noResponseCount} no response
                  </span>
                </CardTitle>
                {rosterOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-1 pb-4">
              {teamMembers.map((m: any) => {
                const att = attendanceByUser[m.user_id];
                const status = att?.status;
                return (
                  <div key={m.id} className="flex items-center gap-2 py-1 text-sm">
                    <span className={cn(
                      "h-2.5 w-2.5 rounded-full shrink-0",
                      status === "present" ? "bg-green-500" :
                      status === "absent" ? "bg-red-500" :
                      "bg-muted-foreground/30"
                    )} />
                    <span className="text-foreground flex-1 truncate">
                      {m.profile?.full_name || m.profile?.username || "Unnamed"}
                    </span>
                    <span className="text-xs text-muted-foreground capitalize shrink-0">
                      {status === "present" ? "confirmed" : status === "absent" ? "absent" : "—"}
                    </span>
                  </div>
                );
              })}
              {teamMembers.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">No team members.</p>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* ── Section 4: Messages (collapsed) ────────────────────────────────────── */}
      <Collapsible open={messagesOpen} onOpenChange={setMessagesOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-3 cursor-pointer select-none">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2 min-w-0">
                  <MessageSquare className="h-4 w-4 text-primary shrink-0" />
                  Messages
                  {latestMessage && !messagesOpen && (
                    <span className="text-xs text-muted-foreground font-normal truncate">
                      · {latestMessage.author?.full_name || "Coach"}: {String(latestMessage.content || "").slice(0, 50)}
                    </span>
                  )}
                </CardTitle>
                {messagesOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 pb-4">
              <TeamMessageBoard
                teamId={teamId}
                teamName={teamName}
                teamMembers={teamMembers}
                isCoach={true}
                profile={profile}
                seasonId={seasonId ?? null}
                boats={boats}
                onNavigate={onNavigate}
              />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* ── More Tools button ─────────────────────────────────────────────────── */}
      <Button variant="outline" className="w-full gap-2" onClick={() => setMoreOpen(true)}>
        <MoreHorizontal className="h-4 w-4" />
        More Tools
      </Button>

      {/* ── Seat Assignment Dialog ───────────────────────────────────────────── */}
      <Dialog open={!!seatDialog} onOpenChange={open => !open && setSeatDialog(null)}>
        <DialogContent className="max-w-sm max-h-[80vh] flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="text-base">
              Assign {seatDialog?.seatNumber === 0 ? "Coxswain" : `Seat ${seatDialog?.seatNumber}`}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 px-2 pb-4 space-y-0.5">
            <button
              className="w-full text-left px-3 py-3 rounded-lg text-sm hover:bg-destructive/10 text-destructive transition-colors flex items-center gap-2"
              onClick={() => seatDialog && assignSeat(seatDialog.lineupId, seatDialog.seatNumber, null)}
            >
              <X className="h-3.5 w-3.5" />Clear seat
            </button>
            {teamMemberList.map(member => (
              <button
                key={member.user_id}
                className="w-full text-left px-3 py-3 rounded-lg text-sm hover:bg-muted transition-colors"
                onClick={() => seatDialog && assignSeat(seatDialog.lineupId, seatDialog.seatNumber, member)}
              >
                {member.name}
              </button>
            ))}
            {teamMemberList.length === 0 && (
              <p className="text-xs text-muted-foreground px-3 py-2">No team members found.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── More Tools Sheet ─────────────────────────────────────────────────── */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Coach Tools</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-2 mt-4 pb-4">
            {moreSections.map(item => (
              <button
                key={item.key}
                className="flex items-center gap-2 px-3 py-3 rounded-xl border border-border text-sm text-left hover:bg-muted transition-colors"
                onClick={() => { onNavigate(item.key); setMoreOpen(false); }}
              >
                <span className="text-foreground font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default CoachTodayView;
