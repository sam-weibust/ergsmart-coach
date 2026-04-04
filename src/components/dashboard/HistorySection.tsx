import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Activity, Dumbbell, Download, ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import ShareWorkoutDialog from "./ShareWorkoutDialog";
import { RacePaceBoat } from "./RacePaceBoat";
import { WorkoutAnnotations } from "./WorkoutAnnotations";

interface HistorySectionProps {
  profile: any;
}

const kgToLbs = (kg: number) => Math.round(kg * 2.20462);
const PAGE_SIZE = 10;

const HistorySection = ({ profile }: HistorySectionProps) => {
  const [ergWorkouts, setErgWorkouts] = useState<any[]>([]);
  const [strengthWorkouts, setStrengthWorkouts] = useState<any[]>([]);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [ergPage, setErgPage] = useState(0);
  const [strengthPage, setStrengthPage] = useState(0);

  const { data: coachInfo } = useQuery({
    queryKey: ["coach-check", profile?.id],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { isCoach: false, coachId: null };
      const { data: teams } = await supabase
        .from("teams")
        .select("id")
        .eq("coach_id", user.id);
      return { isCoach: (teams && teams.length > 0), coachId: user.id };
    },
    enabled: !!profile?.id,
  });

  useEffect(() => {
    if (profile) {
      fetchErgHistory();
      fetchStrengthHistory();
    }
  }, [profile]);

  const fetchErgHistory = async () => {
    const { data } = await supabase
      .from("erg_workouts")
      .select("*")
      .eq("user_id", profile.id)
      .order("workout_date", { ascending: false })
      .limit(50);
    setErgWorkouts(data || []);
  };

  const fetchStrengthHistory = async () => {
    const { data } = await supabase
      .from("strength_workouts")
      .select("*")
      .eq("user_id", profile.id)
      .order("workout_date", { ascending: false })
      .limit(20);
    setStrengthWorkouts(data || []);
  };

  const toggleSession = (sessionId: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      next.has(sessionId) ? next.delete(sessionId) : next.add(sessionId);
      return next;
    });
  };

  const displayErgWorkouts = (() => {
    const summarySessionIds = new Set(
      ergWorkouts.filter(w => w.workout_type === "multi_piece_summary").map(w => w.session_id)
    );
    return ergWorkouts.filter(w => {
      if (w.workout_type === "multi_piece" && summarySessionIds.has(w.session_id)) return false;
      return true;
    });
  })();

  const getPiecesForSession = (sessionId: string) =>
    ergWorkouts.filter(w => w.workout_type === "multi_piece" && w.session_id === sessionId);

  // Pagination
  const ergTotal = displayErgWorkouts.length;
  const ergPageCount = Math.ceil(ergTotal / PAGE_SIZE);
  const pagedErgWorkouts = displayErgWorkouts.slice(ergPage * PAGE_SIZE, (ergPage + 1) * PAGE_SIZE);

  const strengthTotal = strengthWorkouts.length;
  const strengthPageCount = Math.ceil(strengthTotal / PAGE_SIZE);
  const pagedStrengthWorkouts = strengthWorkouts.slice(strengthPage * PAGE_SIZE, (strengthPage + 1) * PAGE_SIZE);

  const exportCSV = async (type: "erg" | "strength") => {
    if (type === "erg") {
      const { data } = await supabase.from("erg_workouts").select("*").eq("user_id", profile.id).order("workout_date", { ascending: false });
      if (!data || data.length === 0) return;
      const headers = ["date", "type", "distance", "duration", "avg_split", "avg_heart_rate", "calories", "notes"];
      const rows = data.map(w => [w.workout_date, w.workout_type, w.distance || "", w.duration || "", w.avg_split || "", w.avg_heart_rate || "", w.calories || "", `"${(w.notes || "").replace(/"/g, '""')}"`]);
      downloadCSV(headers, rows, "erg_workouts.csv");
    } else {
      const { data } = await supabase.from("strength_workouts").select("*").eq("user_id", profile.id).order("workout_date", { ascending: false });
      if (!data || data.length === 0) return;
      const headers = ["date", "exercise", "sets", "reps", "weight_kg", "weight_lbs", "notes"];
      const rows = data.map(w => [w.workout_date, w.exercise, w.sets, w.reps, w.weight, kgToLbs(w.weight), `"${(w.notes || "").replace(/"/g, '""')}"`]);
      downloadCSV(headers, rows, "strength_workouts.csv");
    }
  };

  const downloadCSV = (headers: string[], rows: any[][], filename: string) => {
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const PaginationControls = ({ page, pageCount, setPage }: { page: number; pageCount: number; setPage: (p: number) => void }) => {
    if (pageCount <= 1) return null;
    return (
      <div className="flex items-center justify-between pt-4">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {page + 1} of {pageCount}
        </span>
        <Button variant="outline" size="sm" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>
          Next
        </Button>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workout History</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="erg">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="erg">
              <Activity className="h-4 w-4 mr-2" />
              Erg Workouts
            </TabsTrigger>
            <TabsTrigger value="strength">
              <Dumbbell className="h-4 w-4 mr-2" />
              Strength Workouts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="erg" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => exportCSV("erg")} className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            </div>
            {displayErgWorkouts.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No erg workouts logged yet.</p>
            ) : (
              <>
                {pagedErgWorkouts.map((workout) => {
                  const isMultiSummary = workout.workout_type === "multi_piece_summary";
                  const expanded = isMultiSummary && expandedSessions.has(workout.session_id);
                  const pieces = isMultiSummary ? getPiecesForSession(workout.session_id) : [];

                  return (
                    <div key={workout.id}>
                      <Collapsible>
                        <div className="p-4 border rounded-lg space-y-2">
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-2">
                              <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                  <ChevronDown className="h-4 w-4 transition-transform data-[state=open]:rotate-180" />
                                </Button>
                              </CollapsibleTrigger>
                              <div>
                                <h3 className="font-semibold capitalize flex items-center gap-2">
                                  {isMultiSummary ? "Multi-Piece Session" : workout.workout_type.replace("_", " ")}
                                  {isMultiSummary && (
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleSession(workout.session_id)}>
                                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                    </Button>
                                  )}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                  {new Date(workout.workout_date).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {workout.distance && <span className="text-lg font-bold">{workout.distance}m</span>}
                              {profile?.id && <ShareWorkoutDialog workoutId={workout.id} workoutType="erg" userId={profile.id} />}
                            </div>
                          </div>
                          <CollapsibleContent className="space-y-2">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              {workout.duration && <span>Time: {workout.duration}</span>}
                              {workout.avg_split && <span>Avg Split: {workout.avg_split}</span>}
                              {workout.avg_heart_rate && <span>Avg HR: {workout.avg_heart_rate} bpm</span>}
                              {workout.calories && <span>Calories: {workout.calories}</span>}
                            </div>
                            {workout.notes && <p className="text-sm text-muted-foreground italic">{workout.notes}</p>}
                            <RacePaceBoat workout={workout} />
                            <WorkoutAnnotations
                              workoutId={workout.id}
                              workoutType="erg"
                              athleteId={workout.user_id}
                              isCoach={coachInfo?.isCoach || false}
                              coachId={coachInfo?.coachId}
                            />
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                      {expanded && pieces.length > 0 && (
                        <div className="ml-6 mt-1 space-y-1">
                          {pieces.map((p: any) => (
                            <div key={p.id} className="p-2 border-l-2 border-primary/30 pl-3 text-sm bg-muted/20 rounded-r">
                              <div className="flex gap-4 flex-wrap">
                                {p.distance && <span>{p.distance}m</span>}
                                {p.duration && <span>{p.duration}</span>}
                                {p.avg_split && <span>Split: {p.avg_split}</span>}
                                {p.avg_heart_rate && <span>HR: {p.avg_heart_rate}</span>}
                              </div>
                              {p.notes && <p className="text-muted-foreground italic text-xs">{p.notes}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                <PaginationControls page={ergPage} pageCount={ergPageCount} setPage={setErgPage} />
              </>
            )}
          </TabsContent>

          <TabsContent value="strength" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => exportCSV("strength")} className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            </div>
            {strengthWorkouts.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No strength workouts logged yet.</p>
            ) : (
              <>
                {pagedStrengthWorkouts.map((workout) => (
                  <Collapsible key={workout.id}>
                    <div className="p-4 border rounded-lg space-y-2">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </CollapsibleTrigger>
                          <div>
                            <h3 className="font-semibold">{workout.exercise}</h3>
                            <p className="text-sm text-muted-foreground">
                              {new Date(workout.workout_date).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold">{kgToLbs(workout.weight)} lbs</span>
                          {profile?.id && <ShareWorkoutDialog workoutId={workout.id} workoutType="strength" userId={profile.id} />}
                        </div>
                      </div>
                      <CollapsibleContent className="space-y-2">
                        <p className="text-sm">{workout.sets} sets × {workout.reps} reps</p>
                        {workout.notes && <p className="text-sm text-muted-foreground italic">{workout.notes}</p>}
                        <WorkoutAnnotations
                          workoutId={workout.id}
                          workoutType="strength"
                          athleteId={workout.user_id}
                          isCoach={coachInfo?.isCoach || false}
                          coachId={coachInfo?.coachId}
                        />
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
                <PaginationControls page={strengthPage} pageCount={strengthPageCount} setPage={setStrengthPage} />
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default HistorySection;
