import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sun, Cloud, CloudRain, CloudSnow, Wind, MapPin, Users, Ship, Calendar, MessageSquare, Save, Edit2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { displayName } from "./constants";

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
  if (code <= 77) return { label: "Snowy", icon: <CloudSnow className="h-5 w-5 text-blue-200" /> };
  if (code <= 82) return { label: "Rainy", icon: <CloudRain className="h-5 w-5 text-blue-400" /> };
  return { label: "Stormy", icon: <CloudRain className="h-5 w-5 text-purple-400" /> };
}

function AttendanceDot({ status }: { status?: string }) {
  if (status === "yes") return <span className="h-2.5 w-2.5 rounded-full bg-green-500 inline-block shrink-0" title="Confirmed" />;
  if (status === "no") return <span className="h-2.5 w-2.5 rounded-full bg-red-500 inline-block shrink-0" title="Absent" />;
  if (status === "maybe") return <span className="h-2.5 w-2.5 rounded-full bg-yellow-400 inline-block shrink-0" title="Maybe" />;
  return <span className="h-2.5 w-2.5 rounded-full bg-gray-500 inline-block shrink-0" title="No response" />;
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

  const attendanceByUser = Object.fromEntries((todayAttendance ?? []).map((a: any) => [a.user_id, a]));

  const safeMembers = teamMembers ?? [];
  const absentMembers = safeMembers.filter((m: any) => attendanceByUser[m?.id]?.status === "no");
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
        <h2 className="text-lg font-bold text-white">Today — {new Date(todayStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</h2>
      </div>

      {/* Weather */}
      {weather && (
        <Card className="bg-[#0f1e35] border-white/10">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                {weatherLabel(weather.weather_code ?? 0).icon}
                <span className="text-white font-medium">{weatherLabel(weather.weather_code ?? 0).label}</span>
              </div>
              <span className="text-white/80 text-sm">{Math.round(weather.temperature_2m ?? 0)}°F</span>
              <span className="text-white/60 text-sm flex items-center gap-1"><Wind className="h-3.5 w-3.5" />{Math.round(weather.wind_speed_10m ?? 0)} mph</span>
              {weather.precipitation_probability != null && (
                <span className="text-white/60 text-sm">💧 {weather.precipitation_probability}% precip</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Athlete view: my seat */}
      {!isCoach && myLineup && mySeat && (
        <Card className="bg-[#0f1e35] border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white flex items-center gap-2"><Ship className="h-4 w-4 text-blue-400" />Your Seat Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="text-2xl font-bold text-white">{mySeat.seat_number === 0 ? "Cox" : `Seat ${mySeat.seat_number}`}</div>
              <div>
                <p className="text-white/80 text-sm">{myLineup.name}</p>
                <Badge variant="outline" className="text-xs border-white/20 text-white/60">{myLineup.boat_class}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's Lineups */}
      {todayLineups.length > 0 && (
        <Card className="bg-[#0f1e35] border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white flex items-center gap-2">
              <Ship className="h-4 w-4 text-blue-400" />Today's Lineups
              {totalSeats > 0 && (
                <span className="ml-auto text-xs text-white/60">{confirmedCount}/{totalSeats} confirmed</span>
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
                    <span className="text-white/90 font-medium text-sm">{boat?.name || lineup.name}</span>
                    <Badge variant="outline" className="text-xs border-white/20 text-white/50">{lineup.boat_class}</Badge>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {seats.map((s: any) => (
                      <div key={s.seat_number} className={`flex items-center gap-1.5 text-xs p-1.5 rounded ${!isCoach && s.user_id === profile?.id ? "bg-blue-500/20 border border-blue-500/40" : "bg-white/5"}`}>
                        <AttendanceDot status={s.user_id ? attMap[s.user_id] : undefined} />
                        <span className="text-white/50 shrink-0 w-10">{s.seat_number === 0 ? "Cox" : `Seat ${s.seat_number}`}</span>
                        <span className="text-white/80 truncate">{s.name || "—"}</span>
                      </div>
                    ))}
                  </div>
                  {lineup.workout_plan && (
                    <p className="text-xs text-white/60 pt-1 border-t border-white/10">{lineup.workout_plan}</p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Attendance breakdown (coach) */}
      {isCoach && (
        <Card className="bg-[#0f1e35] border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white flex items-center gap-2"><Users className="h-4 w-4 text-blue-400" />Attendance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {absentMembers.length > 0 && (
              <div className="mb-2 p-2 rounded bg-red-500/10 border border-red-500/30">
                <p className="text-xs text-red-400 font-medium mb-1">Absent ({absentMembers.length})</p>
                {absentMembers.map((m: any) => {
                  const rec = attendanceByUser[m.id];
                  return (
                    <div key={m.id} className="flex items-center gap-2 text-xs text-red-300 py-0.5">
                      <AttendanceDot status="no" />
                      <span>{displayName(m)}</span>
                      {rec?.responded_at && (
                        <span className="text-red-400/60 ml-auto">{new Date(rec.responded_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {safeMembers.filter((m: any) => attendanceByUser[m?.id]?.status !== "no").map((m: any) => {
              const rec = attendanceByUser[m?.id];
              return (
                <div key={m?.id} className="flex items-center gap-2 text-xs text-white/70 py-0.5">
                  <AttendanceDot status={rec?.status} />
                  <span>{displayName(m)}</span>
                  {rec?.responded_at && (
                    <span className="text-white/40 ml-auto">{new Date(rec.responded_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                  )}
                </div>
              );
            })}
            {safeMembers.length === 0 && <p className="text-xs text-white/40">No team members.</p>}
          </CardContent>
        </Card>
      )}

      {/* Today's Workout */}
      <Card className="bg-[#0f1e35] border-white/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-white flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-400" />Today's Workout
            {isCoach && practiceEntry && !editingWorkout && (
              <button
                onClick={() => { setWorkoutText(practiceEntry.workout_description || ""); setEditingWorkout(true); }}
                className="ml-auto text-white/40 hover:text-white/80 transition-colors"
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
                className="text-sm bg-white/5 border-white/20 text-white placeholder:text-white/30 resize-none"
              />
              <div className="flex gap-2">
                <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => saveWorkout.mutate(workoutText)} disabled={saveWorkout.isPending}>
                  {saveWorkout.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}Save
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs text-white/60" onClick={() => setEditingWorkout(false)}>Cancel</Button>
              </div>
            </div>
          ) : practiceEntry?.workout_description ? (
            <p className="text-sm text-white/80 whitespace-pre-wrap">{practiceEntry.workout_description}</p>
          ) : isCoach ? (
            <Button
              size="sm"
              variant="outline"
              className="border-white/20 text-white/70 hover:bg-white/10 text-xs"
              onClick={() => { setWorkoutText(""); setEditingWorkout(true); }}
            >
              Write Today's Workout
            </Button>
          ) : (
            <p className="text-xs text-white/40">No workout posted yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Regattas */}
      <Card className="bg-[#0f1e35] border-white/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-white flex items-center gap-2"><MapPin className="h-4 w-4 text-blue-400" />Upcoming Regattas (30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {regattas.length === 0 ? (
            <p className="text-xs text-white/40">No regattas scheduled in the next 30 days.</p>
          ) : (
            <div className="space-y-2">
              {regattas.map((r: any) => {
                const days = Math.round((new Date(r.date).getTime() - new Date(todayStr).getTime()) / 86400000);
                return (
                  <div key={r.id} className="flex items-center gap-3 text-sm">
                    <div className="text-center bg-blue-500/20 rounded px-2 py-1 min-w-[48px]">
                      <p className="text-blue-400 font-bold text-sm leading-none">{days === 0 ? "Today" : `${days}d`}</p>
                    </div>
                    <div>
                      <p className="text-white/90 font-medium">{r.name}</p>
                      <p className="text-white/50 text-xs">
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
        <Card className="bg-[#0f1e35] border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="border-white/20 text-white/70 hover:bg-white/10 text-xs gap-1.5" onClick={() => onNavigate("lineups")}>
              <Ship className="h-3.5 w-3.5" />Publish Lineup
            </Button>
            <Button size="sm" variant="outline" className="border-white/20 text-white/70 hover:bg-white/10 text-xs gap-1.5" onClick={() => onNavigate("calendar")}>
              <Calendar className="h-3.5 w-3.5" />Log Workout
            </Button>
            <Button size="sm" variant="outline" className="border-white/20 text-white/70 hover:bg-white/10 text-xs gap-1.5" onClick={() => onNavigate("board")}>
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
        <p className="text-white/60 text-sm">Something went wrong loading today's view.</p>
        <button
          onClick={() => window.location.reload()}
          className="text-xs text-blue-400 underline"
        >
          Tap to refresh
        </button>
      </div>
    );
  }
};

export default TodayTab;
