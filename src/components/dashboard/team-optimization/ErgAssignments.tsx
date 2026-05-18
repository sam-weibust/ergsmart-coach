import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, ChevronRight, Dumbbell, Users, Pencil, Trash2 } from "lucide-react";
import { formatSplit, displayName } from "./constants";
import ErgWorkoutBuilder from "./ErgWorkoutBuilder";
import ErgAssignmentResults from "./ErgAssignmentResults";
import AthleteErgAssignment from "./AthleteErgAssignment";
import CoxswainErgLogger from "./CoxswainErgLogger";

interface Props {
  teamId: string;
  teamMembers: any[];
  isCoach: boolean;
  profile: any;
  boats: any[];
  initialAssignment?: any; // jump straight to detail from TodayTab
}

const RESULT_STATUS_CLASS: Record<string, string> = {
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  pending:   "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  overdue:   "bg-red-500/20 text-red-400 border-red-500/30",
  excused:   "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const ErgAssignments = ({ teamId, teamMembers, isCoach, profile, boats, initialAssignment }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showBuilder, setShowBuilder] = useState(false);
  const [editAssignment, setEditAssignment] = useState<any>(null);
  const [selected, setSelected] = useState<any>(initialAssignment ?? null);
  const [coxswainLogging, setCoxswainLogging] = useState<any>(null);

  const isCoxswain = profile?.is_coxswain === true;
  const today = new Date().toISOString().split("T")[0];

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["erg-assignments", teamId, isCoach ? "coach" : profile?.id],
    queryFn: async () => {
      const q = supabase
        .from("erg_assignments" as any)
        .select("*")
        .eq("team_id", teamId)
        .neq("status", "draft")
        .order("scheduled_date", { ascending: false });

      const { data, error } = await q;
      if (error) {
        console.error("[ErgAssignments] fetch error:", error.message);
        return [];
      }
      return data || [];
    },
    enabled: !!teamId,
  });

  const { data: myResults = [] } = useQuery({
    queryKey: ["my-erg-results-map", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase
        .from("erg_assignment_results" as any)
        .select("assignment_id, status")
        .eq("athlete_id", profile.id);
      return data || [];
    },
    enabled: !isCoach && !!profile?.id,
  });

  const deleteAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erg_assignments" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Deleted" });
      queryClient.invalidateQueries({ queryKey: ["erg-assignments", teamId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Sub-views ──────────────────────────────────────────────────────────────
  if (showBuilder || editAssignment) {
    return (
      <ErgWorkoutBuilder
        teamId={teamId}
        teamMembers={teamMembers}
        profile={profile}
        boats={boats}
        editAssignment={editAssignment}
        onClose={() => { setShowBuilder(false); setEditAssignment(null); }}
      />
    );
  }

  if (selected && isCoach) {
    return (
      <ErgAssignmentResults
        assignment={selected}
        teamId={teamId}
        teamMembers={teamMembers}
        isCoach={true}
        profile={profile}
        onBack={() => setSelected(null)}
      />
    );
  }

  if (selected && !isCoach) {
    return (
      <AthleteErgAssignment
        assignment={selected}
        profile={profile}
        onBack={() => setSelected(null)}
      />
    );
  }

  if (coxswainLogging) {
    return (
      <CoxswainErgLogger
        assignment={coxswainLogging}
        teamId={teamId}
        teamMembers={teamMembers}
        profile={profile}
        boats={boats}
        onClose={() => setCoxswainLogging(null)}
      />
    );
  }

  // ── List ───────────────────────────────────────────────────────────────────
  const myResultMap = myResults.reduce((acc: any, r: any) => {
    acc[r.assignment_id] = r.status;
    return acc;
  }, {});

  // Athletes: filter to assigned-to-them or team-wide
  const visibleAssignments = isCoach
    ? assignments
    : assignments.filter((a: any) => {
        const assignedTo: string[] = a.assigned_to || [];
        return (
          assignedTo.includes("team") ||
          assignedTo.includes(profile?.id) ||
          boats.some((b: any) => assignedTo.includes(b.id))
        );
      });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dumbbell className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Erg Workouts</h2>
        </div>
        {isCoach && (
          <Button size="sm" onClick={() => setShowBuilder(true)}>
            <Plus className="h-4 w-4 mr-1" /> Assign Workout
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && visibleAssignments.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <Dumbbell className="h-8 w-8 mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {isCoach ? "No erg workouts created yet." : "No erg workouts assigned to you yet."}
            </p>
            {isCoach && (
              <Button variant="outline" size="sm" className="mt-2" onClick={() => setShowBuilder(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Create First Workout
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {visibleAssignments.map((a: any) => {
          const myStatus = myResultMap[a.id];
          const piecesArr: any[] = a.pieces || [];
          const firstTarget = piecesArr.find((p: any) => p.target_split_seconds || p.target_split_type === "relative_2k");
          const isUpcoming = a.scheduled_date && a.scheduled_date >= today;

          const isForCoxswain = isCoxswain && boats.some((b: any) => {
            const assignedTo: string[] = a.assigned_to || [];
            return assignedTo.includes(b.id) || assignedTo.includes("team");
          });

          return (
            <Card
              key={a.id}
              className="cursor-pointer hover:bg-muted/30 active:bg-muted/50 transition-colors"
              onClick={() => setSelected(a)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="font-semibold text-sm">{a.title}</span>
                      {isUpcoming && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-400 border-blue-500/20">
                          Upcoming
                        </Badge>
                      )}
                      {!isCoach && myStatus && (
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${RESULT_STATUS_CLASS[myStatus] || ""}`}>
                          {myStatus}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {a.scheduled_date && <span>{a.scheduled_date}</span>}
                      {piecesArr.length > 0 && (
                        <span>{piecesArr.length} piece{piecesArr.length !== 1 ? "s" : ""}</span>
                      )}
                      {firstTarget && (
                        <span className="text-blue-400 font-medium">
                          {firstTarget.target_split_type === "relative_2k"
                            ? (() => {
                                const off = firstTarget.target_split_offset_seconds ?? 0;
                                return off >= 0 ? `2K + ${off}s` : `2K − ${Math.abs(off)}s`;
                              })()
                            : `${formatSplit(firstTarget.target_split_seconds)}/500m`}
                        </span>
                      )}
                    </div>
                    {a.deadline && (
                      <p className="text-xs text-yellow-400 mt-0.5">
                        Due {new Date(a.deadline).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    {isForCoxswain && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => setCoxswainLogging(a)}
                      >
                        <Users className="h-3.5 w-3.5 mr-1" /> Log Boat
                      </Button>
                    )}
                    {isCoach && (
                      <>
                        <button
                          onClick={() => setEditAssignment(a)}
                          className="p-2 text-muted-foreground hover:text-foreground rounded min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete "${a.title}"?`)) deleteAssignment.mutate(a.id);
                          }}
                          className="p-2 text-muted-foreground hover:text-destructive rounded min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default ErgAssignments;
