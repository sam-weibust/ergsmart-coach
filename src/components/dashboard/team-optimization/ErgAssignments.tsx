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
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  draft: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
};

const ErgAssignments = ({ teamId, teamMembers, isCoach, profile, boats }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showBuilder, setShowBuilder] = useState(false);
  const [editAssignment, setEditAssignment] = useState<any>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [coxswainLogging, setCoxswainLogging] = useState<any>(null);

  const isCoxswain = profile?.is_coxswain === true;

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["erg-assignments", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("erg_assignments" as any)
        .select("*")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: myResults = [] } = useQuery({
    queryKey: ["my-erg-results", profile?.id],
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

  if (selectedAssignment && isCoach) {
    return (
      <ErgAssignmentResults
        assignment={selectedAssignment}
        teamId={teamId}
        teamMembers={teamMembers}
        isCoach={isCoach}
        profile={profile}
        onBack={() => setSelectedAssignment(null)}
      />
    );
  }

  if (selectedAssignment && !isCoach) {
    return (
      <AthleteErgAssignment
        assignment={selectedAssignment}
        profile={profile}
        onBack={() => setSelectedAssignment(null)}
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

  const myResultMap = myResults.reduce((acc: any, r: any) => {
    acc[r.assignment_id] = r.status;
    return acc;
  }, {});

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

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {!isLoading && assignments.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <Dumbbell className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No erg workouts assigned yet.</p>
            {isCoach && (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowBuilder(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Create First Workout
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {assignments.map((a: any) => {
          const myStatus = myResultMap[a.id];
          const piecesArr: any[] = a.pieces || [];
          const targets = piecesArr
            .filter((p: any) => p.target_split_seconds)
            .map((p: any) => formatSplit(p.target_split_seconds));

          const isForCoxswain = isCoxswain && boats.some((b: any) => {
            const assignedTo: string[] = a.assigned_to || [];
            return assignedTo.includes(b.id);
          });

          return (
            <Card key={a.id} className="cursor-pointer hover:bg-muted/30 transition-colors">
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0" onClick={() => setSelectedAssignment(a)}>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-medium text-sm">{a.title}</span>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[a.status] || ""}`}>
                        {a.status}
                      </Badge>
                      {!isCoach && myStatus && (
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                          myStatus === "completed" ? "bg-green-500/20 text-green-400 border-green-500/30" :
                          myStatus === "overdue" ? "bg-red-500/20 text-red-400 border-red-500/30" :
                          "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                        }`}>
                          {myStatus}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {a.scheduled_date && <span>{a.scheduled_date}</span>}
                      {piecesArr.length > 0 && <span>{piecesArr.length} pieces</span>}
                      {targets.length > 0 && <span>{targets[0]}/500m</span>}
                    </div>
                    {a.deadline && (
                      <div className="text-xs text-yellow-400 mt-0.5">
                        Due: {new Date(a.deadline).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isForCoxswain && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCoxswainLogging(a)}>
                        <Users className="h-3.5 w-3.5 mr-1" /> Log for Boat
                      </Button>
                    )}
                    {isCoach && (
                      <>
                        <button
                          onClick={() => setEditAssignment(a)}
                          className="p-1.5 text-muted-foreground hover:text-foreground rounded"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("Delete this assignment?")) deleteAssignment.mutate(a.id);
                          }}
                          className="p-1.5 text-muted-foreground hover:text-destructive rounded"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" onClick={() => setSelectedAssignment(a)} />
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
