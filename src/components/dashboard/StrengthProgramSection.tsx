import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getSessionUser } from "@/lib/getUser";
import {
  Dumbbell, ChevronDown, ChevronUp, CheckCircle2, Info, History, Play, RotateCcw
} from "lucide-react";

interface Props {
  profile: any;
}

const DAY_ORDER = ["day_a", "day_b", "day_c", "day_d"];

export default function StrengthProgramSection({ profile }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [variant, setVariant] = useState<"4-day" | "3-day">("4-day");
  const [expandedDay, setExpandedDay] = useState<string | null>("day_a");
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [sessionWeights, setSessionWeights] = useState<Record<string, Record<string, string>>>({});
  const [view, setView] = useState<"program" | "history">("program");

  const { data: program } = useQuery({
    queryKey: ["default-strength-program"],
    queryFn: async () => {
      const { data } = await supabase
        .from("default_strength_programs")
        .select("*")
        .eq("is_default", true)
        .maybeSingle();
      return data;
    },
  });

  const { data: logs } = useQuery({
    queryKey: ["strength-program-logs", profile?.id],
    enabled: !!profile?.id && view === "history",
    queryFn: async () => {
      const { data } = await supabase
        .from("strength_program_logs")
        .select("*")
        .eq("user_id", profile.id)
        .order("session_date", { ascending: false })
        .limit(30);
      return data || [];
    },
  });

  const logMutation = useMutation({
    mutationFn: async ({ dayKey, exercises }: { dayKey: string; exercises: any[] }) => {
      const user = await getSessionUser();
      if (!user || !program) throw new Error("Not authenticated");
      const { error } = await supabase.from("strength_program_logs").insert({
        user_id: user.id,
        program_id: program.id,
        day_key: dayKey,
        exercises,
        session_date: new Date().toISOString().split("T")[0],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Session logged" });
      setActiveSession(null);
      setSessionWeights({});
      qc.invalidateQueries({ queryKey: ["strength-program-logs", profile?.id] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!program) return <div className="text-sm text-muted-foreground p-4">Loading program…</div>;

  const pd = program.program_data as any;
  const days = pd?.days || {};
  const schedule = variant === "4-day" ? pd?.schedule_4_day : pd?.schedule_3_day;

  const visibleDayKeys = variant === "4-day"
    ? DAY_ORDER
    : DAY_ORDER.filter(k => k !== "day_d");

  function finishSession(dayKey: string) {
    const day = days[dayKey];
    if (!day) return;
    const exercises = day.exercises.map((ex: any) => ({
      name: ex.name,
      sets: ex.sets,
      reps: ex.reps,
      weight_used: sessionWeights[dayKey]?.[ex.name] || "",
    }));
    logMutation.mutate({ dayKey, exercises });
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Dumbbell className="h-5 w-5 text-primary" />
            {program.name}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{program.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={view === "program" ? "default" : "outline"}
            onClick={() => setView("program")}
          >
            <Dumbbell className="h-3.5 w-3.5 mr-1.5" />Program
          </Button>
          <Button
            size="sm"
            variant={view === "history" ? "default" : "outline"}
            onClick={() => setView("history")}
          >
            <History className="h-3.5 w-3.5 mr-1.5" />History
          </Button>
        </div>
      </div>

      {view === "history" ? (
        <HistoryView logs={logs || []} days={days} />
      ) : (
        <>
          {/* Variant toggle */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Version:</span>
            <button
              onClick={() => setVariant("4-day")}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                variant === "4-day"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-foreground"
              }`}
            >
              4-Day
            </button>
            <button
              onClick={() => setVariant("3-day")}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                variant === "3-day"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-foreground"
              }`}
            >
              3-Day
            </button>
            <span className="text-xs text-muted-foreground ml-1">
              {schedule?.join(" · ")}
            </span>
          </div>

          {/* Intensity guide */}
          <div className="rounded-xl border bg-muted/40 px-4 py-3">
            <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
              Intensity by Erg Week
            </p>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {Object.entries(pd?.intensity_by_erg_week || {}).map(([key, val]: any) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${
                    key === "easy" ? "bg-green-500" :
                    key === "medium" ? "bg-yellow-500" :
                    key === "hard" ? "bg-red-500" : "bg-blue-400"
                  }`} />
                  <span className="text-muted-foreground">{val.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Days */}
          <div className="space-y-3">
            {visibleDayKeys.map((dayKey) => {
              const day = days[dayKey];
              if (!day) return null;
              const isExpanded = expandedDay === dayKey;
              const isActive = activeSession === dayKey;

              return (
                <div key={dayKey} className="rounded-xl border bg-background overflow-hidden">
                  {/* Day header */}
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                    onClick={() => setExpandedDay(isExpanded ? null : dayKey)}
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs">
                        {day.day_of_week}
                      </Badge>
                      <span className="font-semibold text-sm">{day.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{day.exercises?.length} exercises</span>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {/* Day content */}
                  {isExpanded && (
                    <div className="border-t px-4 py-3 space-y-4">
                      {/* Warmup */}
                      <div className="rounded-lg bg-muted/50 px-3 py-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                          Warmup — {pd?.warmup?.duration}
                        </p>
                        <ul className="text-xs text-muted-foreground space-y-0.5">
                          {pd?.warmup?.exercises?.map((e: string, i: number) => (
                            <li key={i}>• {e}</li>
                          ))}
                        </ul>
                      </div>

                      {/* Exercises */}
                      <div className="space-y-3">
                        {day.exercises.map((ex: any, i: number) => (
                          <div key={i} className="space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="text-sm font-semibold">{ex.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {ex.sets} sets × {ex.reps} reps
                                  {ex.intensity ? ` · ${ex.intensity}` : ""}
                                </p>
                                {ex.cue && (
                                  <p className="text-xs text-primary/80 mt-0.5 italic">"{ex.cue}"</p>
                                )}
                              </div>
                              {isActive && (
                                <input
                                  type="text"
                                  placeholder="Weight"
                                  value={sessionWeights[dayKey]?.[ex.name] || ""}
                                  onChange={(e) => setSessionWeights(prev => ({
                                    ...prev,
                                    [dayKey]: { ...prev[dayKey], [ex.name]: e.target.value }
                                  }))}
                                  className="w-24 text-xs border border-border rounded-md px-2 py-1 bg-background"
                                />
                              )}
                            </div>
                            {/* Rowing note */}
                            {ex.rowing_note && (
                              <div className="flex gap-1.5 bg-blue-50 dark:bg-blue-950/30 rounded-lg px-2.5 py-1.5">
                                <Info className="h-3 w-3 text-blue-500 shrink-0 mt-0.5" />
                                <p className="text-xs text-blue-700 dark:text-blue-300">{ex.rowing_note}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Session controls */}
                      <div className="flex items-center gap-2 pt-1 border-t">
                        {!isActive ? (
                          <Button
                            size="sm"
                            onClick={() => setActiveSession(dayKey)}
                            className="flex items-center gap-1.5"
                          >
                            <Play className="h-3.5 w-3.5" />
                            Start Session
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              onClick={() => finishSession(dayKey)}
                              disabled={logMutation.isPending}
                              className="flex items-center gap-1.5"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {logMutation.isPending ? "Saving…" : "Complete Session"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { setActiveSession(null); setSessionWeights({}); }}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Taper note */}
          <div className="rounded-xl border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 px-4 py-3">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Taper Protocol</p>
            <div className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5">
              {Object.entries(pd?.taper_protocol || {}).map(([k, v]: any) => (
                <p key={k}>• {v}</p>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function HistoryView({ logs, days }: { logs: any[]; days: any }) {
  if (!logs.length) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No sessions logged yet. Start a session from the Program tab.
      </div>
    );
  }

  // Group by exercise name for trend view
  const exerciseTotals: Record<string, { date: string; weight: string }[]> = {};
  logs.forEach((log) => {
    (log.exercises || []).forEach((ex: any) => {
      if (!ex.name || !ex.weight_used) return;
      if (!exerciseTotals[ex.name]) exerciseTotals[ex.name] = [];
      exerciseTotals[ex.name].push({ date: log.session_date, weight: ex.weight_used });
    });
  });

  return (
    <div className="space-y-4">
      {/* Session list */}
      <div className="space-y-2">
        {logs.slice(0, 10).map((log) => {
          const day = days[log.day_key];
          return (
            <div key={log.id} className="rounded-xl border bg-background px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{day?.label || log.day_key}</p>
                  <p className="text-xs text-muted-foreground">{log.session_date}</p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {(log.exercises || []).filter((e: any) => e.weight_used).length} weights logged
                </Badge>
              </div>
              {(log.exercises || []).some((e: any) => e.weight_used) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(log.exercises || [])
                    .filter((e: any) => e.weight_used)
                    .map((e: any, i: number) => (
                      <span key={i} className="text-xs bg-muted rounded-full px-2 py-0.5">
                        {e.name}: {e.weight_used}
                      </span>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Exercise weight trends */}
      {Object.keys(exerciseTotals).length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Weight History by Exercise</h3>
          {Object.entries(exerciseTotals).slice(0, 8).map(([name, entries]) => (
            <div key={name} className="rounded-xl border bg-background px-4 py-3">
              <p className="text-sm font-semibold">{name}</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {entries.slice(0, 6).map((e, i) => (
                  <span key={i} className="text-xs bg-muted rounded-full px-2 py-0.5">
                    {e.date}: {e.weight}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
