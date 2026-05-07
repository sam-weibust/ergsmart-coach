import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sun, Cloud, CloudRain, CloudSnow, Wind, MapPin, Users, Ship, Calendar, MessageSquare, Save, Edit2, Loader2, CheckCircle2, Dumbbell } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  teamId: string;
  teamName: string;
  teamMembers: any[];
  isCoach: boolean;
  profile: any;
  seasonId?: string | null;
  boats?: any[];
  onNavigate: (section: string) => void;
}

function weatherLabel(code: number): { label: string; icon: React.ReactNode } {
  if (code === 0) return { label: "Sunny", icon: <Sun className="h-5 w-5 text-yellow-400" /> };
  if (code <= 3) return { label: "Partly Cloudy", icon: <Cloud className="h-5 w-5 text-gray-400" /> };
  if (code <= 48) return { label: "Foggy", icon: <Wind className="h-5 w-5 text-gray-400" /> };
  if (code <= 67) return { label: "Rainy", icon: <CloudRain className="h-5 w-5 text-blue-400" /> };
  if (code <= 77) return { label: "Snowy", icon: <CloudSnow className="h-5 w-5 text-blue-400" /> };
  if (code <= 82) return { label: "Rainy", icon: <CloudRain className="h-5 w-5 text-blue-400" /> };
  return { label: "Stormy", icon: <CloudRain className="h-5 w-5 text-purple-500" /> };
}

function AttendanceDot({ status }: { status?: string }) {
  if (status === "yes") return <span className="h-2.5 w-2.5 rounded-full bg-green-500 inline-block shrink-0" title="Confirmed" />;
  if (status === "no") return <span className="h-2.5 w-2.5 rounded-full bg-red-500 inline-block shrink-0" title="Absent" />;
  if (status === "maybe") return <span className="h-2.5 w-2.5 rounded-full bg-yellow-400 inline-block shrink-0" title="Maybe" />;
  return <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40 inline-block shrink-0" title="No response" />;
}

const TodayTab = ({ teamId, teamName, teamMembers = [], isCoach, profile, boats = [], onNavigate }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const todayStr = new Date().toISOString().split("T")[0];
  const [editingWorkout, setEditingWorkout] = useState(false);
  const [workoutText, setWorkoutText] = useState("");
  const [weather, setWeather] = useState<any>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: todayLineups = [] } = useQuery({
    queryKey: ["today-lineups", teamId, todayStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("boat_lineups")
        .select("*")
        .eq("team_id", teamId)
        .gte("published_at", todayStr + "T00:00:00")
        .lte("published_at", todayStr + "T23:59:59");
      return data || [];
    },
  });

  const lineupIds = todayLineups.map((l: any) => l.id);

  const { data: todayAttendance = [] } = useQuery({
    queryKey: ["today-attendance", teamId, todayStr],
    queryFn: async () => {
      if (!lineupIds.length) return [];
      const { data } = await supabase
        .from("practice_attendance")
        .select("*")
        .in("lineup_id", lineupIds);
      return data || [];
    },
    enabled: lineupIds.length > 0,
  });

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

  const { data: regattas = [] } = useQuery({
    queryKey: ["upcoming-regattas", teamId, todayStr],
    queryFn: async () => {
      const thirtyDays = new Date();
      thirtyDays.setDate(thirtyDays.getDate() + 30);
      const { data } = await supabase
        .from("regattas" as any)
        .select("*")
        .eq("team_id", teamId)
        .gte("date", todayStr)
        .lte("date", thirtyDays.toISOString().split("T")[0])
        .order("date", { ascending: true });
      return data || [];
    },
  });

  const { data: teamData } = useQuery({
    queryKey: ["team-location", teamId],
    queryFn: async () => {
      const { data } = await supabase.from("teams").select("latitude, longitude").eq("id", teamId).single();
      return data;
    },
  });

  async function fetchWeather(lat: number, lon: number) {
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation_probability,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph`
      );
      const json = await res.json();
      setWeather(json?.current ?? null);
    } catch {}
  }

  useEffect(() => {
    if (!teamData?.latitude || !teamData?.longitude) return;
    fetchWeather(teamData.latitude, teamData.longitude);
    intervalRef.current = setInterval(() => {
      fetchWeather(teamData.latitude!, teamData.longitude!);
    }, 30 * 60 * 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [teamData?.latitude, teamData?.longitude]);

  const saveWorkout = useMutation({
    mutationFn: async (description: string) => {
      if (practiceEntry?.id) {
        const { error } = await supabase
          .from("practice_entries")
          .update({ workout_description: description, updated_at: new Date().toISOString() })
          .eq("id", practiceEntry.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("practice_entries").insert({
          team_id: teamId,
          practice_date: todayStr,
          workout_description: description,
          created_by: profile?.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Workout saved" });
      setEditingWorkout(false);
      queryClient.invalidateQueries({ queryKey: ["today-practice-entry", teamId, todayStr] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const { data: dailyWorkout } = useQuery({
    queryKey: ["team-daily-workout", teamId, todayStr],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("team_daily_workouts")
        .select("*")
        .eq("team_id", teamId)
        .eq("date", todayStr)
        .maybeSingle();
      return data;
    },
  });

  // Athlete simple check-in (attendance table)
  const { data: myCheckIn } = useQuery({
    queryKey: ["my-team-checkin", teamId, todayStr, profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;
      const { data } = await supabase
        .from("attendance" as any)
        .select("*")
        .eq("user_id", profile.id)
        .eq("team_id", teamId)
        .eq("date", todayStr)
        .maybeSingle();
      return data;
    },
    enabled: !!profile?.id && !isCoach,
  });

  const checkIn = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("attendance" as any)
        .upsert(
          { user_id: profile.id, team_id: teamId, date: todayStr, status: "present" },
          { onConflict: "user_id,team_id,date" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Checked in!" });
      queryClient.invalidateQueries({ queryKey: ["my-team-checkin", teamId, todayStr, profile?.id] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const attendanceByUser = Object.fromEntries((todayAttendance ?? []).map((a: any) => [a.user_id, a]));

  const safeMembers = teamMembers ?? [];
  const absentMembers = safeMembers.filter((m: any) => attendanceByUser[m?.user_id]?.status === "no");
  const confirmedCount = (todayAttendance ?? []).filter((a: any) => a.status === "yes").length;
  const totalSeats = (todayLineups ?? []).reduce((sum: number, l: any) => {
    return sum + (Array.isArray(l?.seats) ? l.seats.filter((s: any) => s?.user_id).length : 0);
  }, 0);

  const myLineup = (todayLineups ?? []).find((l: any) =>
    Array.isArray(l?.seats) && l.seats.some((s: any) => s?.user_id === profile?.id)
  );
  const mySeat = myLineup?.seats?.find((s: any) => s?.user_id === profile?.id);

  try { return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Sun className="h-5 w-5 text-yellow-400" />
        <h2 className="text-lg font-bold text-foreground">Today — {new Date(todayStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</h2>
      </div>

      {/* Weather */}
      {weather && (
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                {weatherLabel(weather.weather_code ?? 0).icon}
                <span className="text-foreground font-medium">{weatherLabel(weather.weather_code ?? 0).label}</span>
              </div>
              <span className="text-foreground text-sm">{Math.round(weather.temperature_2m ?? 0)}°F</span>
              <span className="text-muted-foreground text-sm flex items-center gap-1"><Wind className="h-3.5 w-3.5" />{Math.round(weather.wind_speed_10m ?? 0)} mph</span>
              {weather.precipitation_probability != null && (
                <span className="text-muted-foreground text-sm">💧 {weather.precipitation_probability}% precip</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Athlete view: my seat */}
      {!isCoach && myLineup && mySeat && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground flex items-center gap-2"><Ship className="h-4 w-4 text-primary" />Your Seat Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="text-2xl font-bold text-foreground">{mySeat.seat_number === 0 ? "Cox" : `Seat ${mySeat.seat_number}`}</div>
              <div>
                <p className="text-foreground text-sm">{myLineup.name}</p>
                <Badge variant="outline" className="text-xs">{myLineup.boat_class}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Athlete check-in */}
      {!isCoach && (
        <Card>
          <CardContent className="py-4 px-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Practice Attendance</p>
              <p className="text-xs text-muted-foreground mt-0.5">Let your coach know you're here today.</p>
            </div>
            {myCheckIn ? (
              <Badge className="bg-green-500/20 text-green-600 border border-green-500/40 gap-1.5 px-3 py-1.5 text-sm shrink-0">
                <CheckCircle2 className="h-4 w-4" /> Checked In
              </Badge>
            ) : (
              <Button
                size="sm"
                className="shrink-0"
                onClick={() => checkIn.mutate()}
                disabled={checkIn.isPending}
              >
                {checkIn.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check In"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Today's Lineups */}
      {todayLineups.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <Ship className="h-4 w-4 text-primary" />Today's Lineups
              {totalSeats > 0 && (
                <span className="ml-auto text-xs text-muted-foreground">{confirmedCount}/{totalSeats} confirmed</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {todayLineups.map((lineup: any) => {
              const seats = Array.isArray(lineup.seats) ? lineup.seats : [];
              const lineupAttendance = todayAttendance.filter((a: any) => a.lineup_id === lineup.id);
              const attMap = Object.fromEntries(lineupAttendance.map((a: any) => [a.user_id, a.status]));
              const boat = boats.find((b: any) => b.id === lineup.boat_id);
              return (
                <div key={lineup.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-medium text-sm">{boat?.name || lineup.name}</span>
                    <Badge variant="outline" className="text-xs">{lineup.boat_class}</Badge>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {seats.map((s: any) => (
                      <div key={s.seat_number} className={`flex items-center gap-1.5 text-xs p-1.5 rounded ${!isCoach && s.user_id === profile?.id ? "bg-primary/10 border border-primary/30" : "bg-muted/30"}`}>
                        <AttendanceDot status={s.user_id ? attMap[s.user_id] : undefined} />
                        <span className="text-muted-foreground shrink-0 w-10">{s.seat_number === 0 ? "Cox" : `Seat ${s.seat_number}`}</span>
                        <span className="text-foreground truncate">{s.name || "—"}</span>
                      </div>
                    ))}
                  </div>
                  {lineup.workout_plan && (
                    <p className="text-xs text-muted-foreground pt-1 border-t border-border">{lineup.workout_plan}</p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Attendance breakdown (coach) */}
      {isCoach && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground flex items-center gap-2"><Users className="h-4 w-4 text-primary" />Attendance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {absentMembers.length > 0 && (
              <div className="mb-2 p-2 rounded bg-red-500/10 border border-red-500/30">
                <p className="text-xs text-red-600 font-medium mb-1">Absent ({absentMembers.length})</p>
                {absentMembers.map((m: any) => {
                  const rec = attendanceByUser[m.user_id];
                  return (
                    <div key={m.id} className="flex items-center gap-2 text-xs text-red-600 py-0.5">
                      <AttendanceDot status="no" />
                      <span>{m.profile?.full_name || m.profile?.username || m.profile?.email?.split("@")[0] || "Unnamed Athlete"}</span>
                      {rec?.responded_at && (
                        <span className="text-red-500/60 ml-auto">{new Date(rec.responded_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {safeMembers.filter((m: any) => attendanceByUser[m?.user_id]?.status !== "no").map((m: any) => {
              const rec = attendanceByUser[m?.user_id];
              return (
                <div key={m?.id} className="flex items-center gap-2 text-xs text-foreground py-0.5">
                  <AttendanceDot status={rec?.status} />
                  <span>{m.profile?.full_name || m.profile?.username || m.profile?.email?.split("@")[0] || "Unnamed Athlete"}</span>
                  {rec?.responded_at && (
                    <span className="text-muted-foreground ml-auto">{new Date(rec.responded_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                  )}
                </div>
              );
            })}
            {safeMembers.length === 0 && <p className="text-xs text-muted-foreground">No team members.</p>}
          </CardContent>
        </Card>
      )}

      {/* Today's Workout */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />Today's Workout
            {isCoach && practiceEntry && !editingWorkout && (
              <button
                onClick={() => { setWorkoutText(practiceEntry.workout_description || ""); setEditingWorkout(true); }}
                className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {editingWorkout ? (
            <div className="space-y-2">
              <Textarea
                value={workoutText}
                onChange={e => setWorkoutText(e.target.value)}
                placeholder="Describe today's practice plan..."
                rows={4}
                className="text-sm resize-none"
              />
              <div className="flex gap-2">
                <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => saveWorkout.mutate(workoutText)} disabled={saveWorkout.isPending}>
                  {saveWorkout.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}Save
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setEditingWorkout(false)}>Cancel</Button>
              </div>
            </div>
          ) : dailyWorkout?.workout_data ? (
            (() => {
              const workout = dailyWorkout.workout_data as any;
              return (
                <div className="space-y-2">
                  {(workout.name || workout.boat_class || workout.zone) && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {workout.name && (
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{workout.name}</span>
                      )}
                      {workout.boat_class && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 font-medium">{workout.boat_class}</span>
                      )}
                      {workout.zone && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{workout.zone}</span>
                      )}
                      {workout.duration && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">{workout.duration}</span>
                      )}
                    </div>
                  )}
                  {workout.warmup && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Warmup</p>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{workout.warmup}</p>
                    </div>
                  )}
                  {workout.description && (
                    <p className="text-sm text-foreground whitespace-pre-wrap">{workout.description}</p>
                  )}
                  {workout.rates && (
                    <p className="text-xs text-muted-foreground">Rates: {workout.rates}</p>
                  )}
                  {workout.cooldown && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Cooldown</p>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{workout.cooldown}</p>
                    </div>
                  )}
                  {workout.notes && (
                    <p className="text-xs text-muted-foreground italic">{workout.notes}</p>
                  )}
                </div>
              );
            })()
          ) : practiceEntry?.workout_description ? (
            <p className="text-sm text-foreground whitespace-pre-wrap">{practiceEntry.workout_description}</p>
          ) : isCoach ? (
            <div className="space-y-3">
              <div className="text-center py-8 text-muted-foreground border-2 border-dashed border-border rounded-xl">
                <Dumbbell className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium text-foreground">No workout pushed yet today</p>
                <p className="text-xs mt-1">Push a lineup with a workout to show it here.</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => { setWorkoutText(""); setEditingWorkout(true); }}
              >
                Write Today's Workout
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No workout posted yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Regattas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-foreground flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />Upcoming Regattas (30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {regattas.length === 0 ? (
            <p className="text-xs text-muted-foreground">No regattas scheduled in the next 30 days.</p>
          ) : (
            <div className="space-y-2">
              {regattas.map((r: any) => {
                const days = Math.round((new Date(r.date).getTime() - new Date(todayStr).getTime()) / 86400000);
                return (
                  <div key={r.id} className="flex items-center gap-3 text-sm">
                    <div className="text-center bg-primary/10 rounded px-2 py-1 min-w-[48px]">
                      <p className="text-primary font-bold text-sm leading-none">{days === 0 ? "Today" : `${days}d`}</p>
                    </div>
                    <div>
                      <p className="text-foreground font-medium">{r.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {new Date(r.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                        {r.location ? ` — ${r.location}` : ""}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick actions — coach only */}
      {isCoach && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="text-xs gap-1.5 text-foreground" onClick={() => onNavigate("lineups")}>
              <Ship className="h-3.5 w-3.5" />Publish Lineup
            </Button>
            <Button size="sm" variant="outline" className="text-xs gap-1.5 text-foreground" onClick={() => onNavigate("calendar")}>
              <Calendar className="h-3.5 w-3.5" />Log Workout
            </Button>
            <Button size="sm" variant="outline" className="text-xs gap-1.5 text-foreground" onClick={() => onNavigate("board")}>
              <MessageSquare className="h-3.5 w-3.5" />Message Team
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  ); } catch (err) {
    console.error("TodayTab render error:", err);
    return (
      <div className="p-6 text-center space-y-3">
        <p className="text-muted-foreground text-sm">Something went wrong loading today's view.</p>
        <button
          onClick={() => window.location.reload()}
          className="text-xs text-primary underline"
        >
          Tap to refresh
        </button>
      </div>
    );
  }
};

export default TodayTab;
