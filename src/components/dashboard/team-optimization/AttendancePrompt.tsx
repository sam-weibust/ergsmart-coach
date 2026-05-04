import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, HelpCircle } from "lucide-react";

interface Props {
  teamId: string;
  userId: string;
}

const AttendancePrompt = ({ teamId, userId }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: pendingLineups = [] } = useQuery({
    queryKey: ["attendance-pending", teamId, userId],
    queryFn: async () => {
      const { data: lineups } = await supabase
        .from("boat_lineups")
        .select("id, name, boat_class, practice_date, practice_start_time, seats, published_at, workout_plan")
        .eq("team_id", teamId)
        .not("published_at", "is", null)
        .order("practice_date", { ascending: true });

      if (!lineups) return [];

      const relevant = lineups.filter((l: any) => {
        const seats = Array.isArray(l.seats) ? l.seats : [];
        return seats.some((s: any) => s.user_id === userId);
      });

      if (relevant.length === 0) {
        console.log(`[attendance] No lineups found for user ${userId} in team ${teamId}`);
        return [];
      }

      const ids = relevant.map((l: any) => l.id);
      const { data: attendance } = await supabase
        .from("practice_attendance")
        .select("*")
        .in("lineup_id", ids)
        .eq("user_id", userId);

      const attMap: Record<string, any> = {};
      for (const a of attendance || []) attMap[a.lineup_id] = a;

      const pending = relevant
        .map((l: any) => ({ ...l, attendance: attMap[l.id] || null }))
        .filter((l: any) => {
          const status = l.attendance?.status || "no_response";
          return status === "no_response" || !l.attendance;
        });

      console.log(`[attendance] ${pending.length} pending attendance request(s) for user ${userId} in team ${teamId}`);
      return pending;
    },
    enabled: !!teamId && !!userId,
    refetchInterval: 30000,
  });

  const respond = useMutation({
    mutationFn: async ({ lineupId, status, practiceDate, lineup }: { lineupId: string; status: string; practiceDate?: string; lineup?: any }) => {
      const { error } = await supabase.from("practice_attendance").upsert({
        lineup_id: lineupId,
        user_id: userId,
        status,
        responded_at: new Date().toISOString(),
      }, { onConflict: "lineup_id,user_id" });
      if (error) throw error;

      if (status === "no") {
        const { data: memberProfile } = await supabase
          .from("profiles")
          .select("full_name, username")
          .eq("id", userId)
          .single();
        const athleteName = memberProfile?.full_name || memberProfile?.username || "An athlete";
        const dateLabel = practiceDate
          ? new Date(practiceDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
          : "upcoming practice";

        const { data: coaches } = await supabase
          .from("team_coaches" as any)
          .select("coach_id")
          .eq("team_id", teamId);
        const coachIds = (coaches ?? []).map((c: any) => c.coach_id);

        const { data: team } = await supabase.from("teams").select("coach_id").eq("id", teamId).single();
        if (team?.coach_id && !coachIds.includes(team.coach_id)) coachIds.push(team.coach_id);

        if (coachIds.length > 0) {
          await supabase.functions.invoke("send-notification", {
            body: {
              user_ids: coachIds,
              title: "Athlete Absent",
              body: `${athleteName} marked themselves absent for ${dateLabel} practice`,
              type: "practice_reminder",
            },
          });
        }
      }
    },
    onSuccess: () => {
      toast({ title: "Response recorded!" });
      queryClient.invalidateQueries({ queryKey: ["attendance-pending", teamId, userId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (pendingLineups.length === 0) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">Practice Attendance</h4>
      {pendingLineups.map((lineup: any) => {
        const dateStr = lineup.practice_date
          ? new Date(lineup.practice_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
          : "Upcoming practice";
        const timeStr = lineup.practice_start_time ? lineup.practice_start_time.slice(0, 5) : "";
        return (
          <Card key={lineup.id} className="border-amber-400/50 bg-amber-50/30 dark:bg-amber-950/20">
            <CardContent className="py-3 px-4">
              <p className="text-sm font-medium mb-1">Are you attending practice on {dateStr}?</p>
              <p className="text-xs text-muted-foreground mb-2">
                {timeStr ? `${timeStr} — ` : ""}{lineup.name} ({lineup.boat_class})
              </p>
              {lineup.workout_plan && (
                <div className="mb-3 p-2 rounded bg-white/50 dark:bg-black/20 border-l-2 border-primary/40">
                  <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">PLANNED WORKOUT</p>
                  <p className="text-xs whitespace-pre-wrap">{lineup.workout_plan}</p>
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  className="gap-1.5 bg-green-600 hover:bg-green-700 text-white h-8"
                  onClick={() => respond.mutate({ lineupId: lineup.id, status: "yes", practiceDate: lineup.practice_date, lineup })}
                  disabled={respond.isPending}
                >
                  <CheckCircle className="h-3.5 w-3.5" />Yes
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-red-400 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 h-8"
                  onClick={() => respond.mutate({ lineupId: lineup.id, status: "no", practiceDate: lineup.practice_date, lineup })}
                  disabled={respond.isPending}
                >
                  <XCircle className="h-3.5 w-3.5" />No
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-yellow-400 text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-950/30 h-8"
                  onClick={() => respond.mutate({ lineupId: lineup.id, status: "maybe", practiceDate: lineup.practice_date, lineup })}
                  disabled={respond.isPending}
                >
                  <HelpCircle className="h-3.5 w-3.5" />Maybe
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default AttendancePrompt;
