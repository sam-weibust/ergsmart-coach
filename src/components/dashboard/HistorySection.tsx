import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Activity, Dumbbell, Download, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import ShareWorkoutDialog from "./ShareWorkoutDialog";
import { RacePaceBoat } from "./RacePaceBoat";
import { WorkoutAnnotations } from "./WorkoutAnnotations";

interface HistorySectionProps {
  profile: any;
}

const kgToLbs = (kg: number) => Math.round(kg * 2.20462);
const PAGE_SIZE = 10;

// Format pace from deciseconds/500m → "M:SS.d"
function formatPace(deciseconds: number): string {
  const totalSec = deciseconds / 10;
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  const tenths = Math.round((totalSec % 1) * 10);
  return `${mins}:${String(secs).padStart(2, "0")}.${tenths}`;
}

// Format split time in seconds → "M:SS"
function formatSplitTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

const HistorySection = ({ profile }: HistorySectionProps) => {
  const [ergWorkouts, setErgWorkouts] = useState<any[]>([]);
  const [strengthWorkouts, setStrengthWorkouts] = useState<any[]>([]);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [splitsByWorkoutId, setSplitsByWorkoutId] = useState<Record<string, any[]>>({});
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
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

  const fetchSplits = async (workoutId: string) => {
    if (splitsByWorkoutId[workoutId] !== undefined) return;
    const { data } = await supabase
      .from("erg_workout_splits")
      .select("*")
      .eq("workout_id", workoutId)
      .order("split_number", { ascending: true });
    setSplitsByWorkoutId(prev => ({ ...prev, [workoutId]: data || [] }));
  };

  const deleteWorkout = async (workout: any) => {
    // If this came from Concept2, record the external_id so the sync never re-imports it
    if (workout.external_id) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("deleted_c2_workouts").upsert(
          { user_id: user.id, external_id: workout.external_id },
          { onConflict: "user_id,external_id" }
        );
      }
    }
    await supabase.from("erg_workouts").delete().eq("id", workout.id);
    setErgWorkouts(prev => prev.filter(w => w.id !== workout.id));
    setPendingDeleteId(null);
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
      const headers = ["date", "type", "distance", "duration", "avg_split", "avg_heart_rate", "max_heart_rate", "min_heart_rate", "calories", "cal_hour", "stroke_rate", "drag_factor", "work_per_stroke", "notes"];
      const rows = data.map(w => [
        w.workout_date, w.workout_type, w.distance || "", w.duration || "", w.avg_split || "",
        w.avg_heart_rate || "", w.max_heart_rate || "", w.min_heart_rate || "",
        w.calories || "", w.cal_hour || "", w.stroke_rate || "", w.drag_factor || "",
        w.work_per_stroke || "", `"${(w.notes || "").replace(/"/g, '""')}"`,
      ]);
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

  // Extract a positive-or-null heart rate value (0 means no monitor connected)
  const safeHR = (val: any): number | null => (val != null && Number(val) > 0 ? Number(val) : null);

  // Pull intervals/splits out of real_time_data regardless of nesting
  const extractIntervals = (rt: any): any[] => {
    if (!rt) return [];
    if (Array.isArray(rt)) return rt;
    if (Array.isArray(rt.data)) return rt.data;
    if (Array.isArray(rt.intervals)) return rt.intervals;
    if (Array.isArray(rt.splits)) return rt.splits;
    return [];
  };

  // Detailed expandable card body — reads from workout_data JSONB when available,
  // falls back to individual columns for manually-entered workouts.
  const WorkoutDetailBody = ({ workout }: { workout: any }) => {
    const d: any = workout.workout_data;
    const rt: any = workout.real_time_data;
    const intervals = extractIntervals(rt);

    // HR from workout_data.heart_rate object (C2 workouts) or individual columns
    const hrAvg  = d ? safeHR(d.heart_rate?.average) : safeHR(workout.heart_rate_average ?? workout.avg_heart_rate);
    const hrMax  = d ? safeHR(d.heart_rate?.max)     : safeHR(workout.heart_rate_max ?? workout.max_heart_rate);
    const hrMin  = d ? safeHR(d.heart_rate?.min)     : safeHR(workout.heart_rate_min ?? workout.min_heart_rate);

    // Scalar metrics — prefer workout_data fields, fall back to columns
    const calories    = d?.calories_total ?? workout.calories_total ?? workout.calories;
    const calHour     = d?.cal_hour       ?? workout.cal_hour;
    const strokeRate  = d?.stroke_rate    ?? workout.stroke_rate_average ?? workout.stroke_rate;
    const strokeCount = d?.stroke_count   ?? workout.stroke_count;
    const dragFactor  = d?.drag_factor    ?? workout.drag_factor;
    const wps         = d?.work_per_stroke ?? workout.work_per_stroke;
    const avgWatts    = d?.watts           ?? workout.avg_watts;
    const restTime    = d?.rest_time;     // deciseconds; only show when > 0
    const restDist    = d?.rest_distance;

    return (
      <div className="space-y-3">
        {/* Summary metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-sm">
          {(d?.time_formatted ?? workout.time_formatted)
            ? <span>Time: {d?.time_formatted ?? workout.time_formatted}</span>
            : workout.duration && <span>Time: {workout.duration}</span>
          }
          {workout.avg_split && <span>Avg Split: {workout.avg_split}</span>}
          {d?.pace != null && workout.avg_split == null && (
            <span>Avg Split: {formatPace(d.pace)}</span>
          )}

          {/* Heart rate — always show the avg row so user knows if it was recorded */}
          <span className={hrAvg ? "" : "text-muted-foreground"}>
            HR Avg: {hrAvg ? `${hrAvg} bpm` : "Not recorded"}
          </span>
          {hrMax && <span>HR Max: {hrMax} bpm</span>}
          {hrMin && <span>HR Min: {hrMin} bpm</span>}

          {calories != null && <span>Calories: {calories}</span>}
          {calHour  != null && <span>Cal/hr: {Math.round(calHour)}</span>}
          {strokeRate  != null && <span>Stroke Rate: {strokeRate} spm</span>}
          {strokeCount != null && <span>Strokes: {strokeCount}</span>}
          {dragFactor  != null && <span>Drag: {dragFactor}</span>}
          {wps         != null && <span>Work/Stroke: {Math.round(wps)} J</span>}
          {avgWatts    != null && <span>Avg Watts: {avgWatts} W</span>}
          {restTime != null && restTime > 0 && <span>Rest: {formatSplitTime(restTime / 10)}</span>}
          {restDist != null && restDist > 0 && <span>Rest Dist: {restDist}m</span>}
        </div>

        {workout.notes && <p className="text-sm text-muted-foreground italic">{workout.notes}</p>}

        {/* Intervals / splits table from real_time_data */}
        {intervals.length > 0 && (
          <div className="overflow-x-auto">
            <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
              {intervals.length} {intervals.length === 1 ? "Split" : "Splits / Intervals"}
            </p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-1 pr-3">#</th>
                  <th className="text-right py-1 pr-3">Dist</th>
                  <th className="text-right py-1 pr-3">Time</th>
                  <th className="text-right py-1 pr-3">Pace/500m</th>
                  <th className="text-right py-1 pr-3">SR</th>
                  <th className="text-right py-1 pr-3">HR</th>
                  <th className="text-right py-1">Rest</th>
                </tr>
              </thead>
              <tbody>
                {intervals.map((s: any, idx: number) => {
                  const splitHR = typeof s.heart_rate === "object"
                    ? safeHR(s.heart_rate?.average)
                    : safeHR(s.heart_rate);
                  const pace    = s.pace ?? s.split ?? null;
                  const rest    = s.rest_time ?? s.rest ?? null;
                  return (
                    <tr key={idx} className="border-b border-muted/30 hover:bg-muted/20">
                      <td className="py-1 pr-3">{idx + 1}</td>
                      <td className="text-right py-1 pr-3">{s.distance != null ? `${s.distance}m` : "—"}</td>
                      <td className="text-right py-1 pr-3">{s.time != null ? formatSplitTime(s.time / 10) : "—"}</td>
                      <td className="text-right py-1 pr-3">{pace != null ? formatPace(pace) : "—"}</td>
                      <td className="text-right py-1 pr-3">{s.stroke_rate ?? s.avg_stroke_rate ?? "—"}</td>
                      <td className="text-right py-1 pr-3">{splitHR ?? "—"}</td>
                      <td className="text-right py-1">{rest != null && rest > 0 ? formatSplitTime(rest / 10) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
                              {coachInfo?.coachId === profile?.id && (
                                pendingDeleteId === workout.id ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-destructive">Delete?</span>
                                    <Button variant="destructive" size="sm" className="h-6 px-2 text-xs" onClick={() => deleteWorkout(workout)}>
                                      Yes
                                    </Button>
                                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setPendingDeleteId(null)}>
                                      No
                                    </Button>
                                  </div>
                                ) : (
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => setPendingDeleteId(workout.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )
                              )}
                            </div>
                          </div>
                          <CollapsibleContent className="space-y-3">
                            <WorkoutDetailBody workout={workout} />
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
                                {p.stroke_rate && <span>SR: {p.stroke_rate}</span>}
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
