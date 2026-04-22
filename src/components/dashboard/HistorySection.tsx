import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Activity, Dumbbell, Download, ChevronDown, Trash2, Link as LinkIcon } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import ShareWorkoutDialog from "./ShareWorkoutDialog";
import ForceCurvePostWorkout from "./ForceCurvePostWorkout";
import { RacePaceBoat } from "./RacePaceBoat";
import { WorkoutAnnotations } from "./WorkoutAnnotations";
import { ShareWorkoutButton } from "./WorkoutShareCard";
import { getSessionUser } from '@/lib/getUser';

interface HistorySectionProps {
  profile: any;
}

const kgToLbs = (kg: number) => Math.round(kg * 2.20462);
const PAGE_SIZE = 10;

// Format stored C2 pace field (deciseconds/500m) → "M:SS"
function formatPace(deciseconds: number): string {
  const totalSec = deciseconds / 10;
  const mins = Math.floor(totalSec / 60);
  const secs = Math.round(totalSec % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

// Format split time in seconds → "M:SS"
function formatSplitTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

// Calculate pace per 500m from distance (m) and time (deciseconds) → "M:SS"
function calcPacePer500(distM: number, timeDeciSec: number): string | null {
  if (!distM || !timeDeciSec) return null;
  const paceS = (timeDeciSec / 10 / distM) * 500;
  const mins = Math.floor(paceS / 60);
  const secs = Math.round(paceS % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

// Parse PostgreSQL interval string (HH:MM:SS or MM:SS or MM:SS.d) → total seconds
function parseIntervalSec(interval: string | null | undefined): number | null {
  if (!interval) return null;
  const parts = interval.split(":");
  if (parts.length === 3) return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  return null;
}

// Format total seconds → "h:mm:ss" or "m:ss"
function formatTotalTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Human-readable workout type label
function workoutTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    JustRow: "Just Row",
    FixedTimeInterval: "Fixed Time Interval",
    FixedDistanceInterval: "Fixed Distance Interval",
    FixedCalInterval: "Fixed Calorie Interval",
    multi_piece: "Multi-Piece",
    multi_piece_summary: "Multi-Piece Session",
  };
  return labels[type] ?? type.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim();
}

const HistorySection = ({ profile }: HistorySectionProps) => {
  const [ergWorkouts, setErgWorkouts] = useState<any[]>([]);
  const [strengthWorkouts, setStrengthWorkouts] = useState<any[]>([]);
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [ergPage, setErgPage] = useState(0);
  const [strengthPage, setStrengthPage] = useState(0);

  const { data: coachInfo } = useQuery({
    queryKey: ["coach-check", profile?.id],
    queryFn: async () => {
      const user = await getSessionUser();
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

  const deleteWorkout = async (workout: any) => {
    if (workout.external_id) {
      const user = await getSessionUser();
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

  const deleteAllWorkouts = async () => {
    setDeletingAll(true);
    try {
      const user = await getSessionUser();
      if (!user) return;
      await supabase.from("deleted_c2_workouts").delete().eq("user_id", user.id);
      await supabase.from("erg_workouts").delete().eq("user_id", user.id);
      setErgWorkouts([]);
      setConfirmDeleteAll(false);
    } finally {
      setDeletingAll(false);
    }
  };

  const toggleCard = (id: string) => {
    setOpenCards(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
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
      <div className="flex items-center justify-between pt-2">
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

  // Treat 0 as "no monitor" — only positive values are real HR readings
  const safeHR = (val: any): number | null => (val != null && Number(val) > 0 ? Number(val) : null);

  // Pull splits/intervals from workout_data.
  // d.splits = per-500m split results; d.workout.intervals = interval workouts
  const extractIntervals = (d: any): any[] => {
    if (!d) return [];
    if (Array.isArray(d.splits) && d.splits.length > 0) return d.splits;
    if (Array.isArray(d.workout?.intervals) && d.workout.intervals.length > 0) return d.workout.intervals;
    return [];
  };

  // A single stat box used in the detail grid
  const StatBox = ({ label, value, mono = false }: { label: string; value: string | number; mono?: boolean }) => (
    <div className="bg-muted/50 rounded-lg p-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-base font-bold mt-0.5 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );

  const WorkoutDetailBody = ({ workout }: { workout: any }) => {
    const d: any = workout.workout_data;
    const intervals = extractIntervals(d);

    // Force curves (saved by LiveErgView)
    const rawStrokeData = workout.stroke_data as any;
    const forceCurves: number[][] | null =
      rawStrokeData && typeof rawStrokeData === "object" && !Array.isArray(rawStrokeData) && Array.isArray(rawStrokeData.forceCurves)
        ? rawStrokeData.forceCurves
        : null;
    const hrAvg = d ? safeHR(d.heart_rate?.average) : safeHR(workout.heart_rate_average ?? workout.avg_heart_rate);
    const hrMax = d ? safeHR(d.heart_rate?.max)     : safeHR(workout.heart_rate_max ?? workout.max_heart_rate);
    const hrMin = d ? safeHR(d.heart_rate?.min)     : safeHR(workout.heart_rate_min ?? workout.min_heart_rate);
    const hasHR = hrAvg != null;

    const intervalsHaveHR = intervals.some((s: any) => {
      const hr = typeof s.heart_rate === "object" ? safeHR(s.heart_rate?.average) : safeHR(s.heart_rate);
      return hr != null;
    });

    const calories    = d?.calories_total ?? workout.calories_total ?? workout.calories;
    const strokeRate  = d?.stroke_rate    ?? workout.stroke_rate_average ?? workout.stroke_rate;
    const dragFactor  = d?.drag_factor    ?? workout.drag_factor;
    const wps         = d?.work_per_stroke ?? workout.work_per_stroke;
    const restTime    = d?.rest_time;
    const restDist    = d?.rest_distance;

    const durationSec = parseIntervalSec(workout.duration);
    const totalTimeStr = durationSec != null
      ? formatTotalTime(durationSec)
      : (d?.time_formatted ?? workout.time_formatted ?? null);

    const totalDist = workout.distance;
    const avgPaceFallback = (() => {
      if (workout.avg_split) {
        const sec = parseIntervalSec(workout.avg_split);
        if (sec) return formatSplitTime(sec);
        // already formatted (e.g. "1:52.3" from manual entry)
        if (workout.avg_split.includes(":")) return workout.avg_split;
      }
      if (d?.pace != null) return formatPace(d.pace);
      return null;
    })();
    const avgPaceStr = (totalDist && durationSec)
      ? calcPacePer500(totalDist, durationSec * 10)
      : avgPaceFallback;

    // Build the stat items list (only defined values)
    const stats: { label: string; value: string; mono?: boolean }[] = [];
    if (totalDist)    stats.push({ label: "Distance",     value: `${totalDist}m` });
    if (totalTimeStr) stats.push({ label: "Time",          value: totalTimeStr, mono: true });
    if (avgPaceStr)   stats.push({ label: "Avg Pace",      value: `${avgPaceStr}/500m`, mono: true });
    if (strokeRate != null) stats.push({ label: "Avg SR",   value: `${strokeRate} spm` });
    if (hasHR)        stats.push({ label: "HR Avg",        value: `${hrAvg} bpm` });
    if (hrMax)        stats.push({ label: "HR Max",        value: `${hrMax} bpm` });
    if (hrMin)        stats.push({ label: "HR Min",        value: `${hrMin} bpm` });
    if (calories != null) stats.push({ label: "Calories",  value: String(calories) });
    if (dragFactor != null) stats.push({ label: "Drag Factor", value: String(dragFactor) });
    if (wps != null)  stats.push({ label: "Work/Stroke",  value: `${Math.round(wps)} J` });
    if (restTime != null && restTime > 0) stats.push({ label: "Rest Time", value: formatSplitTime(restTime / 10), mono: true });
    if (restDist != null && restDist > 0) stats.push({ label: "Rest Dist", value: `${restDist}m` });

    return (
      <div className="space-y-4">
        {/* No heart rate monitor badge */}
        {!hasHR && (
          <Badge variant="outline" className="text-muted-foreground gap-1 font-normal">
            No heart rate data
          </Badge>
        )}

        {/* Stat grid */}
        {stats.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {stats.map(s => (
              <StatBox key={s.label} label={s.label} value={s.value} mono={s.mono} />
            ))}
          </div>
        )}

        {workout.notes && (
          <p className="text-sm text-muted-foreground italic">{workout.notes}</p>
        )}

        {/* Force curve post-workout analysis */}
        {forceCurves && forceCurves.length > 0 && (
          <ForceCurvePostWorkout forceCurves={forceCurves} />
        )}

        {/* Intervals table */}
        {intervals.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {intervals.length} {intervals.length === 1 ? "Split" : "Splits / Intervals"}
            </p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-8 text-center">#</TableHead>
                    <TableHead className="text-right">Distance</TableHead>
                    <TableHead className="text-right">Time</TableHead>
                    <TableHead className="text-right">Pace/500m</TableHead>
                    <TableHead className="text-right">SR</TableHead>
                    {intervalsHaveHR && <TableHead className="text-right">HR</TableHead>}
                    <TableHead className="text-right">Rest</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {intervals.map((s: any, idx: number) => {
                    const splitHR = typeof s.heart_rate === "object"
                      ? safeHR(s.heart_rate?.average)
                      : safeHR(s.heart_rate);
                    const storedPace = s.pace ?? s.split ?? null;
                    const paceStr = storedPace != null
                      ? formatPace(storedPace)
                      : (s.distance && s.time ? calcPacePer500(s.distance, s.time) : null);
                    const rest = s.rest_time ?? s.rest ?? null;
                    return (
                      <TableRow key={idx} className={idx % 2 === 1 ? "bg-muted/20" : ""}>
                        <TableCell className="text-center text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="text-right font-mono">{s.distance != null ? `${s.distance}m` : "—"}</TableCell>
                        <TableCell className="text-right font-mono">{s.time != null ? formatSplitTime(s.time / 10) : "—"}</TableCell>
                        <TableCell className="text-right font-mono">{paceStr ?? "—"}</TableCell>
                        <TableCell className="text-right">{s.stroke_rate ?? s.avg_stroke_rate ?? "—"}</TableCell>
                        {intervalsHaveHR && <TableCell className="text-right">{splitHR ?? "—"}</TableCell>}
                        <TableCell className="text-right font-mono">{rest != null && rest > 0 ? formatSplitTime(rest / 10) : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          Workout History
        </CardTitle>
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

          {/* ── Erg tab ─────────────────────────────────────────────────────── */}
          <TabsContent value="erg" className="space-y-3 mt-4">
            {/* Toolbar */}
            <div className="flex justify-between items-center">
              <Button variant="outline" size="sm" onClick={() => exportCSV("erg")} className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
              {coachInfo?.coachId === profile?.id && ergWorkouts.length > 0 && (
                confirmDeleteAll ? (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-1.5">
                    <span className="text-sm text-destructive font-medium">
                      Delete all {ergWorkouts.length} workouts?
                    </span>
                    <Button variant="destructive" size="sm" className="h-7 px-3" disabled={deletingAll} onClick={deleteAllWorkouts}>
                      {deletingAll ? "Deleting…" : "Yes, delete all"}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-3" disabled={deletingAll} onClick={() => setConfirmDeleteAll(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setConfirmDeleteAll(true)}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete All
                  </Button>
                )
              )}
            </div>

            {/* Empty state */}
            {displayErgWorkouts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 space-y-4 text-center">
                <div className="w-16 h-16 rounded-full bg-muted/60 flex items-center justify-center">
                  <Activity className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold text-base">No workouts synced yet</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Connect your Concept2 account to import your workout history.
                  </p>
                </div>
                <Button variant="outline" className="gap-2" onClick={() => {
                  document.getElementById("devices-section")?.scrollIntoView({ behavior: "smooth" });
                }}>
                  <LinkIcon className="h-4 w-4" />
                  Connect Concept2
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {pagedErgWorkouts.map((workout) => {
                    const isMultiSummary = workout.workout_type === "multi_piece_summary";
                    const isOpen = openCards.has(workout.id);
                    const sessionExpanded = isMultiSummary && expandedSessions.has(workout.session_id);
                    const pieces = isMultiSummary ? getPiecesForSession(workout.session_id) : [];

                    const d: any = workout.workout_data;
                    const durationSec = parseIntervalSec(workout.duration);
                    const totalTimeStr = durationSec != null
                      ? formatTotalTime(durationSec)
                      : (d?.time_formatted ?? workout.time_formatted ?? null);
                    const avgPaceStr = (workout.distance && durationSec)
                      ? calcPacePer500(workout.distance, durationSec * 10)
                      : (workout.avg_split ?? (d?.pace != null ? formatPace(d.pace) : null));

                    return (
                      <div key={workout.id}>
                        <Collapsible open={isOpen} onOpenChange={() => toggleCard(workout.id)}>
                          <div className="border rounded-xl bg-card shadow-card hover:shadow-card-hover transition-all duration-200">
                            {/* Card header — clickable area */}
                            <div
                              className="flex items-start gap-3 p-4 cursor-pointer select-none"
                              onClick={() => toggleCard(workout.id)}
                            >
                              {/* Left: type badge + date + metrics */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <Badge variant="secondary" className="text-xs font-medium shrink-0">
                                    {workoutTypeLabel(workout.workout_type)}
                                  </Badge>
                                  <span className="text-sm text-muted-foreground">
                                    {new Date(workout.workout_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                  </span>
                                </div>
                                {workout.distance && (
                                  <p className="text-2xl font-bold leading-tight">{workout.distance.toLocaleString()}m</p>
                                )}
                                {(totalTimeStr || avgPaceStr) && (
                                  <div className="flex items-center gap-3 mt-0.5 text-sm text-muted-foreground">
                                    {totalTimeStr && <span className="font-mono">{totalTimeStr}</span>}
                                    {totalTimeStr && avgPaceStr && <span className="text-muted-foreground/40">·</span>}
                                    {avgPaceStr && <span className="font-mono">{avgPaceStr}/500m</span>}
                                  </div>
                                )}
                              </div>

                              {/* Right: actions + chevron */}
                              <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                <ShareWorkoutButton
                                  workout={workout}
                                  athleteName={profile?.full_name || profile?.username || "Athlete"}
                                  workoutType={workoutTypeLabel(workout.workout_type || "Erg")}
                                />
                                {profile?.id && (
                                  <ShareWorkoutDialog workoutId={workout.id} workoutType="erg" userId={profile.id} />
                                )}
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
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                      onClick={() => setPendingDeleteId(workout.id)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )
                                )}
                                {isMultiSummary && pieces.length > 0 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-muted-foreground"
                                    onClick={(e) => { e.stopPropagation(); toggleSession(workout.session_id); }}
                                  >
                                    {sessionExpanded ? "Hide pieces" : `${pieces.length} pieces`}
                                  </Button>
                                )}
                              </div>
                              <ChevronDown
                                className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 mt-1 ${isOpen ? "rotate-180" : ""}`}
                              />
                            </div>

                            {/* Expanded content */}
                            <CollapsibleContent>
                              <div className="px-4 pb-4 space-y-4">
                                <Separator />
                                <WorkoutDetailBody workout={workout} />
                                <RacePaceBoat workout={workout} />
                                <WorkoutAnnotations
                                  workoutId={workout.id}
                                  workoutType="erg"
                                  athleteId={workout.user_id}
                                  isCoach={coachInfo?.isCoach || false}
                                  coachId={coachInfo?.coachId}
                                />
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>

                        {/* Multi-piece sub-items */}
                        {sessionExpanded && pieces.length > 0 && (
                          <div className="ml-4 mt-1.5 space-y-1.5 border-l-2 border-primary/20 pl-3">
                            {pieces.map((p: any) => (
                              <div key={p.id} className="p-3 rounded-lg bg-muted/30 text-sm">
                                <div className="flex gap-4 flex-wrap text-sm">
                                  {p.distance && <span className="font-semibold">{p.distance}m</span>}
                                  {p.duration && <span className="font-mono text-muted-foreground">{p.duration}</span>}
                                  {p.avg_split && <span className="font-mono text-muted-foreground">{p.avg_split}/500m</span>}
                                  {p.avg_heart_rate && <span className="text-muted-foreground">HR: {p.avg_heart_rate}</span>}
                                  {p.stroke_rate && <span className="text-muted-foreground">SR: {p.stroke_rate}</span>}
                                </div>
                                {p.notes && <p className="text-muted-foreground italic text-xs mt-1">{p.notes}</p>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <PaginationControls page={ergPage} pageCount={ergPageCount} setPage={setErgPage} />
              </>
            )}
          </TabsContent>

          {/* ── Strength tab ─────────────────────────────────────────────────── */}
          <TabsContent value="strength" className="space-y-3 mt-4">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => exportCSV("strength")} className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            </div>

            {strengthWorkouts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 space-y-4 text-center">
                <div className="w-16 h-16 rounded-full bg-muted/60 flex items-center justify-center">
                  <Dumbbell className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold text-base">No strength workouts yet</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Log a strength session to see it here.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {pagedStrengthWorkouts.map((workout) => {
                    const isOpen = openCards.has(workout.id);
                    return (
                      <Collapsible key={workout.id} open={isOpen} onOpenChange={() => toggleCard(workout.id)}>
                        <div className="border rounded-xl bg-card shadow-card hover:shadow-card-hover transition-all duration-200">
                          <div
                            className="flex items-start gap-3 p-4 cursor-pointer select-none"
                            onClick={() => toggleCard(workout.id)}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="secondary" className="text-xs font-medium">{workout.exercise}</Badge>
                                <span className="text-sm text-muted-foreground">
                                  {new Date(workout.workout_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                </span>
                              </div>
                              <p className="text-2xl font-bold leading-tight">{kgToLbs(workout.weight)} lbs</p>
                              <p className="text-sm text-muted-foreground mt-0.5">{workout.sets} sets × {workout.reps} reps</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                              {profile?.id && (
                                <ShareWorkoutDialog workoutId={workout.id} workoutType="strength" userId={profile.id} />
                              )}
                            </div>
                            <ChevronDown
                              className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 mt-1 ${isOpen ? "rotate-180" : ""}`}
                            />
                          </div>
                          <CollapsibleContent>
                            <div className="px-4 pb-4 space-y-3">
                              <Separator />
                              {workout.notes && <p className="text-sm text-muted-foreground italic">{workout.notes}</p>}
                              <WorkoutAnnotations
                                workoutId={workout.id}
                                workoutType="strength"
                                athleteId={workout.user_id}
                                isCoach={coachInfo?.isCoach || false}
                                coachId={coachInfo?.coachId}
                              />
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    );
                  })}
                </div>
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
