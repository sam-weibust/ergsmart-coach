import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronDown, ChevronUp, Ship, Users, MessageSquare,
  CheckCircle2, XCircle, Loader2, ClipboardList,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import TeamMessageBoard from "./TeamMessageBoard";

// Display order: Cox (0), then 8 down to 1
const SEAT_ORDER = [0, 8, 7, 6, 5, 4, 3, 2, 1];

interface Props {
  teamId: string;
  teamName: string;
  teamMembers: any[];
  isCox: boolean;
  profile: any;
  boats?: any[];
  seasonId?: string | null;
  onLogPractice?: () => void;
}

const AthleteTeamTab = ({
  teamId, teamName, teamMembers, isCox, profile, boats = [], seasonId, onLogPractice,
}: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const todayStr = new Date().toISOString().split("T")[0];
  const todayLabel = new Date(todayStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  const [rosterOpen, setRosterOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: myCheckIn } = useQuery({
    queryKey: ["my-team-checkin", teamId, todayStr, profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;
      const { data } = await (supabase as any)
        .from("attendance")
        .select("*")
        .eq("user_id", profile.id)
        .eq("team_id", teamId)
        .eq("date", todayStr)
        .maybeSingle();
      return data;
    },
    enabled: !!profile?.id,
  });

  const { data: practiceEntry } = useQuery({
    queryKey: ["today-published-workout", teamId, todayStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("practice_entries")
        .select("workout_description, workout_published_at")
        .eq("team_id", teamId)
        .eq("practice_date", todayStr)
        .maybeSingle();
      return data;
    },
  });

  const { data: todayLineups = [] } = useQuery({
    queryKey: ["today-lineups-published", teamId, todayStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("boat_lineups")
        .select("*")
        .eq("team_id", teamId)
        .eq("practice_date", todayStr)
        .not("published_at", "is", null)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  const { data: todayAttendance = [] } = useQuery({
    queryKey: ["today-attendance-team", teamId, todayStr],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("attendance")
        .select("user_id, status")
        .eq("team_id", teamId)
        .eq("date", todayStr);
      return data || [];
    },
  });

  // ── Realtime: attendance updates ─────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel(`team-attendance-athlete-${teamId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "attendance",
        filter: `team_id=eq.${teamId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ["today-attendance-team", teamId, todayStr] });
        queryClient.invalidateQueries({ queryKey: ["my-team-checkin", teamId, todayStr, profile?.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [teamId, todayStr, queryClient, profile?.id]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const checkIn = useMutation({
    mutationFn: async (status: "present" | "absent") => {
      if (!profile?.id) throw new Error("Not authenticated");

      const { error } = await (supabase as any)
        .from("attendance")
        .upsert(
          { user_id: profile.id, team_id: teamId, date: todayStr, status },
          { onConflict: "user_id,team_id,date" }
        );
      if (error) throw error;

      // Notify coaches if absent
      if (status === "absent") {
        const { data: memberProfile } = await supabase
          .from("profiles")
          .select("full_name, username")
          .eq("id", profile.id)
          .single();
        const athleteName = memberProfile?.full_name || memberProfile?.username || "An athlete";

        const { data: coaches } = await (supabase as any)
          .from("team_coaches")
          .select("user_id")
          .eq("team_id", teamId);
        const coachIds: string[] = (coaches ?? []).map((c: any) => c.user_id);

        const { data: team } = await supabase.from("teams").select("coach_id").eq("id", teamId).single();
        if (team?.coach_id && !coachIds.includes(team.coach_id)) coachIds.push(team.coach_id);

        if (coachIds.length > 0) {
          supabase.functions.invoke("send-notification", {
            body: {
              user_ids: coachIds,
              title: "Athlete Absent",
              body: `${athleteName} can't make it to ${todayLabel} practice`,
              type: "practice_reminder",
            },
          }).catch(() => {});
        }
      }
    },
    onSuccess: (_, status) => {
      toast({
        title: status === "present" ? "Confirmed! See you at practice." : "Got it. Your coach has been notified.",
      });
      queryClient.invalidateQueries({ queryKey: ["my-team-checkin", teamId, todayStr, profile?.id] });
      queryClient.invalidateQueries({ queryKey: ["today-attendance-team", teamId, todayStr] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Derived ───────────────────────────────────────────────────────────────

  const attendanceByUser = Object.fromEntries(todayAttendance.map((a: any) => [a.user_id, a]));
  const myStatus = myCheckIn?.status as "present" | "absent" | undefined;
  const publishedWorkout = (practiceEntry as any)?.workout_description;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Section 1: Attendance ─────────────────────────────────────────────── */}
      <Card className="border-2 border-primary/20">
        <CardContent className="pt-4 pb-4">
          <p className="text-sm font-semibold text-foreground">Attendance</p>
          <p className="text-xs text-muted-foreground mt-0.5 mb-4">{todayLabel}</p>

          {myStatus ? (
            <div className="space-y-3">
              <div className={cn(
                "flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium",
                myStatus === "present"
                  ? "bg-green-500/10 text-green-700 border-green-500/30"
                  : "bg-red-500/10 text-red-700 border-red-500/30"
              )}>
                {myStatus === "present"
                  ? <><CheckCircle2 className="h-4 w-4 shrink-0" />You're confirmed for practice</>
                  : <><XCircle className="h-4 w-4 shrink-0" />You marked yourself absent</>
                }
              </div>
              <Button
                size="sm" variant="outline" className="text-xs h-7"
                onClick={() => checkIn.mutate(myStatus === "present" ? "absent" : "present")}
                disabled={checkIn.isPending}
              >
                {checkIn.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                Change response
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Button
                className="h-14 text-sm bg-green-600 hover:bg-green-700 text-white gap-2 font-semibold"
                onClick={() => checkIn.mutate("present")}
                disabled={checkIn.isPending}
              >
                {checkIn.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <CheckCircle2 className="h-5 w-5" />
                }
                I'll Be There
              </Button>
              <Button
                className="h-14 text-sm bg-red-600 hover:bg-red-700 text-white gap-2 font-semibold"
                onClick={() => checkIn.mutate("absent")}
                disabled={checkIn.isPending}
              >
                {checkIn.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <XCircle className="h-5 w-5" />
                }
                Can't Make It
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Section 2: Today's Workout (read-only published) ──────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Today's Workout</CardTitle>
        </CardHeader>
        <CardContent>
          {publishedWorkout ? (
            <p className="text-sm text-foreground whitespace-pre-wrap">{publishedWorkout}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Workout not posted yet.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Section 3: Lineups (read-only, highlight own seat) ────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Ship className="h-4 w-4 text-primary" />Lineups
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {todayLineups.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No lineup posted yet.</p>
          ) : (
            todayLineups.map((lineup: any) => {
              const rawSeats: any[] = Array.isArray(lineup.seats) ? lineup.seats : [];
              const boat = boats.find((b: any) => b.id === lineup.boat_id);
              const displaySeats = SEAT_ORDER
                .filter(n => rawSeats.some((s: any) => s.seat_number === n))
                .map(n => rawSeats.find((s: any) => s.seat_number === n));
              const isInBoat = rawSeats.some((s: any) => s.user_id === profile?.id);

              return (
                <div
                  key={lineup.id}
                  className={cn(
                    "rounded-xl border p-3 space-y-2",
                    isInBoat && "border-primary/30 bg-primary/5"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{boat?.name || lineup.name}</span>
                    <Badge variant="outline" className="text-[10px]">{lineup.boat_class}</Badge>
                  </div>
                  <div className="space-y-0.5">
                    {displaySeats.map((seat: any) => {
                      const isMe = seat.user_id === profile?.id;
                      return (
                        <div
                          key={seat.seat_number}
                          className={cn(
                            "flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm",
                            isMe && "bg-primary text-primary-foreground"
                          )}
                        >
                          <span className={cn(
                            "text-xs w-8 shrink-0 font-mono",
                            isMe ? "text-primary-foreground/70" : "text-muted-foreground"
                          )}>
                            {seat.seat_number === 0 ? "Cox" : `S${seat.seat_number}`}
                          </span>
                          <span className={cn("flex-1 truncate", isMe && "font-semibold")}>
                            {seat.name || "—"}
                          </span>
                          {isMe && (
                            <Badge className="bg-white/20 text-primary-foreground border-white/30 text-[10px] px-1.5 py-0 shrink-0">
                              YOU
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                    {displaySeats.length === 0 && (
                      <p className="text-xs text-muted-foreground px-3 py-1">No seats assigned.</p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* ── Section 4: Roster (collapsed) ────────────────────────────────────── */}
      <Collapsible open={rosterOpen} onOpenChange={setRosterOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-3 cursor-pointer select-none">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Teammates
                  <span className="text-xs text-muted-foreground font-normal">· {teamMembers.length}</span>
                </CardTitle>
                {rosterOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-0.5 pb-4">
              {teamMembers.map((m: any) => {
                const att = attendanceByUser[m.user_id];
                const status = att?.status;
                const isMe = m.user_id === profile?.id;
                return (
                  <div key={m.id} className={cn("flex items-center gap-2 py-1.5 text-sm", isMe && "font-medium")}>
                    <span className={cn(
                      "h-2.5 w-2.5 rounded-full shrink-0",
                      status === "present" ? "bg-green-500" :
                      status === "absent" ? "bg-red-500" :
                      "bg-muted-foreground/30"
                    )} />
                    <span className="text-foreground flex-1 truncate">
                      {m.profile?.full_name || m.profile?.username || "Teammate"}
                      {isMe && <span className="text-muted-foreground font-normal"> (you)</span>}
                    </span>
                  </div>
                );
              })}
              {teamMembers.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">No teammates found.</p>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* ── Section 5: Messages (collapsed) ─────────────────────────────────── */}
      <Collapsible open={messagesOpen} onOpenChange={setMessagesOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-3 cursor-pointer select-none">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" />Messages
                </CardTitle>
                {messagesOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 pb-4">
              <TeamMessageBoard
                teamId={teamId}
                teamName={teamName}
                teamMembers={teamMembers}
                isCoach={false}
                profile={profile}
                seasonId={seasonId ?? null}
                boats={boats}
                onNavigate={() => {}}
              />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* ── Coxswain: Log Practice button ────────────────────────────────────── */}
      {isCox && onLogPractice && (
        <Button variant="outline" className="w-full gap-2" onClick={onLogPractice}>
          <ClipboardList className="h-4 w-4" />
          Log Practice
        </Button>
      )}
    </div>
  );
};

export default AthleteTeamTab;
