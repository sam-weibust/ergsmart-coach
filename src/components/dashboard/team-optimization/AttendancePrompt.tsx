import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, HelpCircle, Clock } from "lucide-react";

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
      // Get published lineups for this team where athlete is in the lineup and hasn't responded (or is no_response)
      const { data: lineups } = await supabase
        .from("boat_lineups")
        .select("id, name, boat_class, practice_date, practice_start_time, seats, published_at")
        .eq("team_id", teamId)
        .not("published_at", "is", null)
        .order("practice_date", { ascending: true });

      if (!lineups) return [];

      // Filter to lineups where this athlete is seated
      const relevant = lineups.filter((l: any) => {
        const seats = Array.isArray(l.seats) ? l.seats : [];
        return seats.some((s: any) => s.user_id === userId);
      });

      if (relevant.length === 0) return [];

      // Get their attendance records
      const ids = relevant.map((l: any) => l.id);
      const { data: attendance } = await supabase
        .from("practice_attendance")
        .select("*")
        .in("lineup_id", ids)
        .eq("user_id", userId);

      const attMap: Record<string, any> = {};
      for (const a of attendance || []) attMap[a.lineup_id] = a;

      // Return lineups with attendance status, filter to those needing response
      return relevant.map((l: any) => ({
        ...l,
        attendance: attMap[l.id] || null,
      })).filter((l: any) => {
        // Show if no response or no_response status
        const status = l.attendance?.status || "no_response";
        // Check if deadline passed (2 hours before practice)
        if (l.practice_date && l.practice_start_time) {
          const [h, m] = l.practice_start_time.split(":").map(Number);
          const practiceTime = new Date(l.practice_date);
          practiceTime.setHours(h, m, 0, 0);
          const deadline = new Date(practiceTime.getTime() - 2 * 60 * 60 * 1000);
          if (new Date() > deadline) return false;
        }
        return status === "no_response" || !l.attendance;
      });
    },
    enabled: !!teamId && !!userId,
    refetchInterval: 30000,
  });

  const respond = useMutation({
    mutationFn: async ({ lineupId, status }: { lineupId: string; status: string }) => {
      const { error } = await supabase.from("practice_attendance").upsert({
        lineup_id: lineupId,
        user_id: userId,
        status,
        responded_at: new Date().toISOString(),
      }, { onConflict: "lineup_id,user_id" });
      if (error) throw error;
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
          ? new Date(lineup.practice_date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
          : "Upcoming practice";
        const timeStr = lineup.practice_start_time ? lineup.practice_start_time.slice(0, 5) : "";
        return (
          <Card key={lineup.id} className="border-amber-400/50 bg-amber-50/30 dark:bg-amber-950/20">
            <CardContent className="py-3 px-4">
              <p className="text-sm font-medium mb-1">Are you attending practice?</p>
              <p className="text-xs text-muted-foreground mb-3">
                {dateStr}{timeStr ? ` at ${timeStr}` : ""} — {lineup.name} ({lineup.boat_class})
              </p>
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  className="gap-1.5 bg-green-600 hover:bg-green-700 text-white h-8"
                  onClick={() => respond.mutate({ lineupId: lineup.id, status: "yes" })}
                  disabled={respond.isPending}
                >
                  <CheckCircle className="h-3.5 w-3.5" />Yes
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-red-400 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 h-8"
                  onClick={() => respond.mutate({ lineupId: lineup.id, status: "no" })}
                  disabled={respond.isPending}
                >
                  <XCircle className="h-3.5 w-3.5" />No
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-yellow-400 text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-950/30 h-8"
                  onClick={() => respond.mutate({ lineupId: lineup.id, status: "maybe" })}
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
