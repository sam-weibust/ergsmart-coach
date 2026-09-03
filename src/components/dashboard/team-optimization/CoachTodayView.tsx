import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Pencil, Send, ChevronRight, Plus, X, Save, Loader2, MoreHorizontal,
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

  // Coach-only draft row (practice_entry_drafts is not readable by athletes).
  const { data: workoutDraft } = useQuery({
    queryKey: ["today-workout-draft", teamId, todayStr],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("practice_entry_drafts")
        .select("draft_text")
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
      // Drafts live in practice_entry_drafts, which is coach-only at the RLS
      // level. They used to be a column on practice_entries — a row athletes
      // are allowed to read — so any athlete could query the unpublished text.
      const { error } = await (supabase as any)
        .from("practice_entry_drafts")
        .upsert(
          {
            team_id: teamId,
            practice_date: todayStr,
            draft_text: text,
            updated_by: profile?.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "team_id,practice_date" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Draft saved" });
      setEditingWorkout(false);
      queryClient.invalidateQueries({ queryKey: ["today-workout-draft", teamId, todayStr] });
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
      // Publishing consumes the draft.
      await (supabase as any)
        .from("practice_entry_drafts")
        .delete()
        .eq("team_id", teamId)
        .eq("practice_date", todayStr);
    },
    onSuccess: () => {
      toast({ title: "Workout published!", description: "Athletes can now see today's workout." });
      setEditingWorkout(false);
      queryClient.invalidateQueries({ queryKey: ["today-practice-entry", teamId, todayStr] });
      queryClient.invalidateQueries({ queryKey: ["today-workout-draft", teamId, todayStr] });
      const coachName = profile?.full_name || profile?.username || "Your coach";
      supabase.functions.invoke("send-notification", {
        body: {
          team_id: teamId,
          // `type` must be top level — send-notification reads it there to pick
          // the notification_preferences column and to stamp the in-app row.
          // Nested inside `data` it was ignored, so every athlete got an
          // untyped "general" notification and opt-outs were bypassed.
          type: "workout_published",
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
      // publish_lineup marks the lineup published and rewrites its attendance
      // rows in one transaction. Doing it client-side left the two steps
      // non-atomic and tripped the practice_attendance unique constraint on
      // re-publish (see 20260809000002_publish_lineup_rpc.sql).
      const { error } = await (supabase as any).rpc("publish_lineup", {
        p_lineup_id: lineupId,
        p_seats: seats,
      });
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
          // Top level — see the note in publishWorkout above.
          type: "lineup_published",
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

  const draftText = (workoutDraft as any)?.draft_text as string | undefined;
  const hasDraft = !!draftText;
  const hasPublished = !!(practiceEntry as any)?.workout_description;

  const moreSections = SIDEBAR_ITEMS.filter(i => i.key !== "today");

  const teamMemberList = teamMembers.map((m: any) => ({
    user_id: m.user_id,
    name: m.profile?.full_name || m.profile?.username || "Unknown",
  })).sort((a, b) => a.name.localeCompare(b.name));

  // ── Render ────────────────────────────────────────────────────────────────────
  // Header (team name left / today's date right, thin border-bottom, no logo)
  // lives in the parent CoachApp.tsx shell, not here — see the header comment
  // there. Rendering it again in this file would duplicate it.

  return (
    <div>

      {/* ── Section 1: Workout ─────────────────────────────────────────────────── */}
      <section className="group/workout pb-4 border-b border-border">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="label-caption">Workout</span>
            {hasDraft && !editingWorkout && (
              <span className="inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                DRAFT
              </span>
            )}
          </div>
          {!editingWorkout && (hasDraft || hasPublished) && (
            <button
              type="button"
              aria-label="Edit workout"
              className="p-3.5 -m-3.5 shrink-0 text-subtle opacity-0 transition-opacity duration-fast hover:text-foreground focus-visible:opacity-100 group-hover/workout:opacity-100 group-focus-within/workout:opacity-100"
              onClick={() => {
                setWorkoutEditText(draftText || (practiceEntry as any)?.workout_description || "");
                setEditingWorkout(true);
              }}
            >
              <Pencil size={16} strokeWidth={1.5} />
            </button>
          )}
        </div>

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
                size="sm" variant="outline" className="h-11 gap-1.5"
                onClick={() => saveDraft.mutate(workoutEditText)}
                disabled={saveDraft.isPending || !workoutEditText.trim()}
              >
                {saveDraft.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} strokeWidth={1.5} />}
                Save Draft
              </Button>
              <Button
                size="sm" className="h-11 gap-1.5"
                onClick={() => publishWorkout.mutate(workoutEditText)}
                disabled={publishWorkout.isPending || !workoutEditText.trim()}
              >
                {publishWorkout.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} strokeWidth={1.5} />}
                Publish
              </Button>
              <Button size="sm" variant="ghost" className="h-11" onClick={() => setEditingWorkout(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : hasDraft ? (
          <div className="space-y-3 pl-3 border-l-2 border-warning">
            <p className="text-base text-foreground whitespace-pre-wrap">{draftText}</p>
            {hasPublished && (
              <p className="text-sm text-muted-foreground">
                Currently published: {(practiceEntry as any).workout_description?.slice(0, 60)}…
              </p>
            )}
            <Button
              size="sm" variant="outline"
              className="h-11 gap-1.5 border-warning text-warning hover:border-warning hover:bg-warning/10 hover:text-warning"
              onClick={() => publishWorkout.mutate(draftText!)}
              disabled={publishWorkout.isPending}
            >
              {publishWorkout.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} strokeWidth={1.5} />}
              Publish to Athletes
            </Button>
          </div>
        ) : hasPublished ? (
          <p className="pl-3 border-l-2 border-success text-base text-foreground whitespace-pre-wrap">
            {(practiceEntry as any).workout_description}
          </p>
        ) : (
          <button
            type="button"
            className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border p-4 text-sm text-subtle transition-colors duration-fast hover:border-primary/40 hover:text-muted-foreground"
            onClick={() => { setWorkoutEditText(""); setEditingWorkout(true); }}
          >
            <Plus size={16} strokeWidth={1.5} />
            Write today's workout
          </button>
        )}
      </section>

      {/* ── Section 2: Lineups ─────────────────────────────────────────────────── */}
      <section className="py-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <span className="label-caption">Lineups</span>
          <button
            type="button"
            className="-mr-2 flex min-h-11 items-center gap-1 px-2 text-sm text-primary"
            onClick={() => onNavigate("lineups")}
          >
            <Plus size={16} strokeWidth={1.5} />
            New
          </button>
        </div>

        {lineupsLoading ? (
          <div className="divide-y divide-border">
            {[0, 1, 2].map(i => (
              <div key={i} className="py-4 space-y-2 first:pt-0">
                <div className="h-5 w-32 rounded-sm bg-surface-2 animate-pulse-soft" />
                <div className="h-4 w-48 rounded-sm bg-surface-2 animate-pulse-soft" />
              </div>
            ))}
          </div>
        ) : todayLineups.length === 0 ? (
          <div className="py-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">No lineups for today.</p>
            <Button size="sm" variant="outline" className="h-11" onClick={() => onNavigate("lineups")}>
              Create Lineup
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {todayLineups.map((lineup: any) => {
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
                <div key={lineup.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-lg font-semibold text-foreground">
                      {boat?.name || lineup.name}
                    </span>
                    <span className="text-sm text-muted-foreground">{lineup.boat_class}</span>
                    {!isPublished && (
                      <span className="inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                        UNPUBLISHED
                      </span>
                    )}
                    {hasEdits && (
                      <span className="inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                        UNSAVED EDITS
                      </span>
                    )}
                    <div className="flex-1" />
                    {(!isPublished || hasEdits) && (
                      <Button
                        size="sm" variant="outline" className="h-11 shrink-0 gap-1.5"
                        onClick={() => handlePublishLineup(lineup)}
                        disabled={publishLineup.isPending}
                      >
                        {publishLineup.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} strokeWidth={1.5} />}
                        Publish
                      </Button>
                    )}
                  </div>
                  <div>
                    {displaySeats.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">
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
                          "flex min-h-11 w-full items-center gap-3 rounded-md py-2 text-left transition-colors duration-fast hover:bg-surface-3 active:bg-surface-3",
                          (seat as any)._edited && "bg-warning/10"
                        )}
                      >
                        <span className="w-5 shrink-0 text-xs text-subtle">
                          {seat.seat_number === 0 ? "Cox" : seat.seat_number}
                        </span>
                        {seat.user_id ? (
                          <span className="text-base text-foreground">{seat.name || "Unknown"}</span>
                        ) : (
                          <span className="rounded-md border border-dashed border-border-strong px-2 py-1 text-sm italic text-subtle">
                            Tap to assign
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Section 3: Roster (collapsed by default) ────────────────────────────── */}
      <Collapsible open={rosterOpen} onOpenChange={setRosterOpen}>
        <section className="py-4 border-b border-border">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex min-h-11 w-full items-center justify-between gap-2 text-left">
              <div>
                <div className="label-caption">Roster</div>
                <div className="mt-0.5 text-sm text-muted-foreground">
                  {confirmedCount} of {teamMembers.length} confirmed
                </div>
              </div>
              <ChevronRight
                size={16} strokeWidth={1.5}
                className={cn("shrink-0 text-subtle transition-transform duration-fast", rosterOpen && "rotate-90")}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-3 divide-y divide-border">
              {teamMembers.map((m: any) => {
                const att = attendanceByUser[m.user_id];
                const status = att?.status;
                return (
                  <div key={m.id} className="flex items-center gap-2 min-h-11 py-2">
                    <span className="flex-1 truncate text-base text-foreground">
                      {m.profile?.full_name || m.profile?.username || "Unnamed"}
                    </span>
                    <span className={cn(
                      "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
                      status === "present" ? "bg-success/15 text-success" :
                      status === "absent" ? "bg-destructive/15 text-destructive" :
                      "bg-surface-3 text-muted-foreground"
                    )}>
                      {status === "present" ? "Confirmed" : status === "absent" ? "Absent" : "No response"}
                    </span>
                  </div>
                );
              })}
              {teamMembers.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">No team members.</p>
              )}
            </div>
          </CollapsibleContent>
        </section>
      </Collapsible>

      {/* ── Section 4: Messages (collapsed by default) ──────────────────────────── */}
      <Collapsible open={messagesOpen} onOpenChange={setMessagesOpen}>
        <section className="py-4">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex min-h-11 w-full items-center justify-between gap-3 text-left">
              <div className="min-w-0 flex-1">
                <div className="label-caption">Messages</div>
                {!messagesOpen && (
                  <div className="mt-0.5 truncate text-sm text-muted-foreground">
                    {latestMessage
                      ? `${latestMessage.author?.full_name || "Coach"}: ${String(latestMessage.content || "").slice(0, 50)}`
                      : "No messages yet"}
                  </div>
                )}
              </div>
              <ChevronRight
                size={16} strokeWidth={1.5}
                className={cn("shrink-0 text-subtle transition-transform duration-fast", messagesOpen && "rotate-90")}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-3">
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
            </div>
          </CollapsibleContent>
        </section>
      </Collapsible>

      {/* ── More Tools button ─────────────────────────────────────────────────── */}
      <div className="pt-4">
        <Button variant="outline" className="h-11 w-full gap-2" onClick={() => setMoreOpen(true)}>
          <MoreHorizontal size={16} strokeWidth={1.5} />
          More Tools
        </Button>
      </div>

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
              className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-3 text-left text-sm text-destructive transition-colors duration-fast hover:bg-destructive/10 active:bg-destructive/10"
              onClick={() => seatDialog && assignSeat(seatDialog.lineupId, seatDialog.seatNumber, null)}
            >
              <X size={16} strokeWidth={1.5} />
              Clear seat
            </button>
            {teamMemberList.map(member => (
              <button
                key={member.user_id}
                className="flex min-h-11 w-full items-center rounded-md px-3 py-3 text-left text-sm transition-colors duration-fast hover:bg-surface-3 active:bg-surface-3"
                onClick={() => seatDialog && assignSeat(seatDialog.lineupId, seatDialog.seatNumber, member)}
              >
                {member.name}
              </button>
            ))}
            {teamMemberList.length === 0 && (
              <p className="text-sm text-muted-foreground px-3 py-2">No team members found.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── More Tools Sheet ─────────────────────────────────────────────────── */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-xl">
          <SheetHeader>
            <SheetTitle>Coach Tools</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-2 mt-4 pb-4">
            {moreSections.map(item => (
              <button
                key={item.key}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-3 text-left text-sm transition-colors duration-fast hover:bg-surface-3 active:bg-surface-3"
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
