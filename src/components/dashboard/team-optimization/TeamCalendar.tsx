import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Wind, Waves, Users, LayoutGrid, List } from "lucide-react";
import { formatSplit } from "./constants";

interface Props {
  teamId: string;
  teamName: string;
  teamMembers: any[];
  isCoach: boolean;
  profile: any;
  seasonId?: string | null;
  boats?: any[];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function formatSplitSec(s: number) {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4,"0")}`;
}

function windIcon(w: string) {
  if (w === "light") return "🌬️ Light";
  if (w === "moderate") return "💨 Moderate";
  if (w === "heavy") return "🌪️ Heavy";
  return w;
}
function waterIcon(w: string) {
  if (w === "flat") return "🏞️ Flat";
  if (w === "choppy") return "🌊 Choppy";
  if (w === "rough") return "⛵ Rough";
  return w;
}

const TeamCalendar = ({ teamId, isCoach, profile, boats = [] }: Props) => {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [activeBoatFilter, setActiveBoatFilter] = useState<string[]>([]);

  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0);
  const rangeStart = startOfMonth.toISOString().split("T")[0];
  const rangeEnd = endOfMonth.toISOString().split("T")[0];

  const { data: results = [] } = useQuery({
    queryKey: ["onwater-calendar", teamId, year, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onwater_results")
        .select("*")
        .eq("team_id", teamId)
        .gte("result_date", rangeStart)
        .lte("result_date", rangeEnd)
        .order("result_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: lineups = [] } = useQuery({
    queryKey: ["lineups-calendar", teamId, year, month],
    queryFn: async () => {
      const { data } = await supabase
        .from("boat_lineups")
        .select("*")
        .eq("team_id", teamId)
        .gte("practice_date", rangeStart)
        .lte("practice_date", rangeEnd)
        .not("published_at", "is", null);
      return data || [];
    },
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ["attendance-calendar", teamId, year, month],
    queryFn: async () => {
      const lineupIds = lineups.map((l: any) => l.id);
      if (!lineupIds.length) return [];
      const { data } = await supabase
        .from("practice_attendance")
        .select("*")
        .in("lineup_id", lineupIds);
      return data || [];
    },
    enabled: lineups.length > 0,
  });

  // Filter results for athlete (only their boat)
  const visibleResults = useMemo(() => {
    if (isCoach) return results;
    return results.filter((r: any) =>
      !r.athlete_ids || r.athlete_ids.includes(profile.id)
    );
  }, [results, isCoach, profile.id]);

  // Group results by date
  const resultsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const r of visibleResults) {
      const d = r.result_date;
      if (!map[d]) map[d] = [];
      map[d].push(r);
    }
    return map;
  }, [visibleResults]);

  // Group lineups by date
  const lineupsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const l of lineups) {
      if (!l.practice_date) continue;
      if (!map[l.practice_date]) map[l.practice_date] = [];
      map[l.practice_date].push(l);
    }
    return map;
  }, [lineups]);

  // Build calendar grid
  const firstDow = startOfMonth.getDay();
  const daysInMonth = endOfMonth.getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function toDateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const activeBoats = boats.filter((b: any) => b.is_active);
  const filteredBoatIds = activeBoatFilter.length > 0 ? activeBoatFilter : null;

  function filterByBoat(items: any[]) {
    if (!filteredBoatIds) return items;
    return items.filter((r: any) => r.boat_id && filteredBoatIds.includes(r.boat_id));
  }

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
    setSelectedDay(null);
  };

  const selectedResults = selectedDay ? filterByBoat(resultsByDate[selectedDay] || []) : [];
  const selectedLineups = selectedDay ? filterByBoat(lineupsByDate[selectedDay] || []) : [];
  const todayStr = today.toISOString().split("T")[0];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
          <h2 className="text-lg font-semibold w-44 text-center">{MONTHS[month]} {year}</h2>
          <Button variant="ghost" size="sm" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant={viewMode === "month" ? "default" : "outline"} className="h-7 px-2 gap-1 text-xs" onClick={() => setViewMode("month")}>
            <LayoutGrid className="h-3 w-3" />Month
          </Button>
          <Button size="sm" variant={viewMode === "week" ? "default" : "outline"} className="h-7 px-2 gap-1 text-xs" onClick={() => setViewMode("week")}>
            <List className="h-3 w-3" />Week
          </Button>
        </div>
      </div>

      {/* Boat filters */}
      {activeBoats.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-muted-foreground self-center">Filter:</span>
          <button
            onClick={() => setActiveBoatFilter([])}
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${activeBoatFilter.length === 0 ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground/30 hover:border-primary"}`}
          >All boats</button>
          {activeBoats.map((b: any) => {
            const active = activeBoatFilter.includes(b.id);
            return (
              <button
                key={b.id}
                onClick={() => setActiveBoatFilter(prev =>
                  active ? prev.filter(id => id !== b.id) : [...prev, b.id]
                )}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground/30 hover:border-primary"}`}
              >{b.name}</button>
            );
          })}
        </div>
      )}

      {/* Calendar grid */}
      <Card>
        <CardContent className="p-2 sm:p-4">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map(d => (
              <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">{d}</div>
            ))}
          </div>
          {/* Cells */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const dateStr = toDateStr(day);
              const hasResults = (filterByBoat(resultsByDate[dateStr] || [])).length > 0;
              const hasLineup = (filterByBoat(lineupsByDate[dateStr] || [])).length > 0;
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDay;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                  className={`relative rounded-lg p-1 min-h-[48px] sm:min-h-[60px] flex flex-col items-start transition-colors text-left
                    ${isSelected ? "bg-primary text-primary-foreground" : isToday ? "bg-primary/10 hover:bg-primary/20" : "hover:bg-muted"}
                  `}
                >
                  <span className={`text-xs font-medium mb-1 ${isToday && !isSelected ? "text-primary" : ""}`}>{day}</span>
                  <div className="flex flex-wrap gap-0.5">
                    {hasResults && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
                    {hasLineup && <span className="h-1.5 w-1.5 rounded-full bg-green-500" />}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-blue-500 inline-block" />On-water session</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />Published lineup</span>
          </div>
        </CardContent>
      </Card>

      {/* Day detail */}
      {selectedDay && (
        <div className="space-y-3">
          <h3 className="font-semibold text-base">
            {new Date(selectedDay + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </h3>

          {selectedResults.length === 0 && selectedLineups.length === 0 && (
            <p className="text-sm text-muted-foreground">No practice data for this day.</p>
          )}

          {/* Group by boat */}
          {(() => {
            const boatIds = new Set([
              ...selectedResults.map((r: any) => r.boat_id || r.boat_class),
              ...selectedLineups.map((l: any) => l.boat_id || l.boat_class),
            ]);
            return Array.from(boatIds).map(bid => {
              const boatResults = selectedResults.filter((r: any) => (r.boat_id || r.boat_class) === bid);
              const boatLineups = selectedLineups.filter((l: any) => (l.boat_id || l.boat_class) === bid);
              const boatName = boats.find((b: any) => b.id === bid)?.name || bid;

              // Attendance for this lineup
              const lineup = boatLineups[0];
              const lineupAttendance = lineup
                ? attendance.filter((a: any) => a.lineup_id === lineup.id)
                : [];
              const confirmed = lineupAttendance.filter((a: any) => a.status === "yes").length;
              const total = Array.isArray(lineup?.seats) ? lineup.seats.filter((s: any) => s.user_id).length : 0;

              return (
                <Card key={String(bid)}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      {boatName}
                      {lineup && (
                        <Badge variant="outline" className="text-xs">{lineup.boat_class || ""}</Badge>
                      )}
                      {total > 0 && (
                        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3 w-3" />{confirmed}/{total} confirmed
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Lineup seats */}
                    {lineup && Array.isArray(lineup.seats) && lineup.seats.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Lineup</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                          {lineup.seats.map((s: any) => (
                            <div key={s.seat_number} className="flex gap-1.5 text-xs">
                              <span className="text-muted-foreground w-10 shrink-0">{s.seat_number === 0 ? "Cox" : `Seat ${s.seat_number}`}</span>
                              <span className="font-medium truncate">{s.name || "—"}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Workout data */}
                    {boatResults.map((r: any) => (
                      <div key={r.id} className="space-y-2">
                        <div className="flex flex-wrap gap-2 text-xs">
                          {r.piece_type && <Badge variant="outline">{r.piece_type}</Badge>}
                          {r.distance_meters && <span className="text-muted-foreground">{r.distance_meters}m</span>}
                          {r.time_seconds && (
                            <span className="font-mono">
                              {Math.floor(r.time_seconds / 60)}:{String(Math.round(r.time_seconds % 60)).padStart(2, "0")}
                            </span>
                          )}
                          {r.avg_split_seconds && (
                            <span className="text-muted-foreground">avg {formatSplit(parseFloat(String(r.avg_split_seconds)))}/500m</span>
                          )}
                          {r.stroke_rate && <span className="text-muted-foreground">{r.stroke_rate} s/m</span>}
                        </div>

                        {/* Per-500m splits */}
                        {Array.isArray(r.splits) && r.splits.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">500m Splits</p>
                            <div className="flex flex-wrap gap-1.5">
                              {r.splits.map((sp: any, idx: number) => {
                                const prev = idx > 0 ? r.splits[idx - 1]?.split_seconds : null;
                                const faster = prev !== null && sp.split_seconds < prev;
                                const slower = prev !== null && sp.split_seconds > prev;
                                return (
                                  <span
                                    key={idx}
                                    className={`text-xs font-mono px-1.5 py-0.5 rounded ${faster ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" : slower ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" : "bg-muted"}`}
                                    title={`500m ${idx + 1}`}
                                  >
                                    {formatSplitSec(sp.split_seconds)}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Conditions */}
                        {(r.wind_conditions || r.water_conditions) && (
                          <div className="flex gap-3 text-xs text-muted-foreground">
                            {r.wind_conditions && <span className="flex items-center gap-1"><Wind className="h-3 w-3" />{windIcon(r.wind_conditions)}</span>}
                            {r.water_conditions && <span className="flex items-center gap-1"><Waves className="h-3 w-3" />{waterIcon(r.water_conditions)}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
};

export default TeamCalendar;
