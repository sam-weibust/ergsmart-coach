import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Ship, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { formatSplit } from "./constants";

interface Props {
  teamId: string;
  isCoach: boolean;
  boats: any[];
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function splitDiff(a: number, b: number) {
  return a - b; // positive = slower, negative = faster
}

const LineupHistory = ({ teamId, isCoach, boats }: Props) => {
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [selectedBoatId, setSelectedBoatId] = useState<string>("all");

  const { data: lineups = [] } = useQuery({
    queryKey: ["lineup-history-lineups", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("boat_lineups")
        .select("*")
        .eq("team_id", teamId)
        .not("published_at", "is", null)
        .order("practice_date", { ascending: true });
      return data || [];
    },
  });

  const { data: results = [] } = useQuery({
    queryKey: ["lineup-history-results", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("onwater_results")
        .select("*")
        .eq("team_id", teamId)
        .not("lineup_id", "is", null)
        .order("result_date", { ascending: true });
      return data || [];
    },
  });

  const { data: practiceEntries = [] } = useQuery({
    queryKey: ["lineup-history-entries", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("practice_entries")
        .select("*")
        .eq("team_id", teamId);
      return data || [];
    },
  });

  // Group results by lineup_id
  const resultsByLineup = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const r of results) {
      if (!r.lineup_id) continue;
      if (!map[r.lineup_id]) map[r.lineup_id] = [];
      map[r.lineup_id].push(r);
    }
    return map;
  }, [results]);

  // Build a canonical "lineup fingerprint" from sorted athlete IDs
  function lineupFingerprint(lineup: any): string {
    const seats: any[] = Array.isArray(lineup.seats) ? lineup.seats : [];
    return seats
      .filter((s: any) => s.user_id)
      .map((s: any) => s.user_id)
      .sort()
      .join(",");
  }

  // Group lineups by boat_id (or boat_class), then by lineup fingerprint
  const boatGroups = useMemo(() => {
    const groups: Record<string, { boatId: string; boatName: string; lineupGroups: Record<string, any[]> }> = {};

    for (const lineup of lineups) {
      const boatKey = lineup.boat_id || lineup.boat_class;
      const boatName = boats.find((b: any) => b.id === lineup.boat_id)?.name || lineup.boat_class || "Unknown";
      if (!groups[boatKey]) {
        groups[boatKey] = { boatId: boatKey, boatName, lineupGroups: {} };
      }
      const fp = lineupFingerprint(lineup);
      if (!fp) continue;
      if (!groups[boatKey].lineupGroups[fp]) {
        groups[boatKey].lineupGroups[fp] = [];
      }
      groups[boatKey].lineupGroups[fp].push(lineup);
    }
    return groups;
  }, [lineups, boats]);

  const activeBoats = boats.filter((b: any) => b.is_active);
  const filteredBoatKeys = selectedBoatId === "all"
    ? Object.keys(boatGroups)
    : Object.keys(boatGroups).filter(k => k === selectedBoatId);

  if (!isCoach) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          Lineup history is available to coaches only.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Lineup History</h2>
          <p className="text-sm text-muted-foreground">Track each lineup's progression over time</p>
        </div>
      </div>

      {/* Boat filter */}
      {activeBoats.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedBoatId("all")}
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${selectedBoatId === "all" ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground/30 hover:border-primary"}`}
          >All boats</button>
          {activeBoats.map((b: any) => (
            <button
              key={b.id}
              onClick={() => setSelectedBoatId(b.id)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${selectedBoatId === b.id ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground/30 hover:border-primary"}`}
            >{b.name}</button>
          ))}
        </div>
      )}

      {filteredBoatKeys.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Ship className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No published lineups with results yet.</p>
          </CardContent>
        </Card>
      )}

      {filteredBoatKeys.map(boatKey => {
        const { boatName, lineupGroups } = boatGroups[boatKey];
        const fps = Object.keys(lineupGroups);

        return (
          <div key={boatKey} className="space-y-3">
            <h3 className="font-semibold text-base flex items-center gap-2">
              <Ship className="h-4 w-4" />{boatName}
            </h3>

            {fps.map(fp => {
              const fpLineups = lineupGroups[fp].sort((a: any, b: any) =>
                (a.practice_date || "").localeCompare(b.practice_date || "")
              );

              // Collect all sessions (lineup + results) for this fingerprint
              const sessions: Array<{
                date: string;
                lineup: any;
                results: any[];
                practiceEntry: any;
              }> = fpLineups.map((lineup: any) => ({
                date: lineup.practice_date || lineup.created_at?.split("T")[0] || "",
                lineup,
                results: resultsByLineup[lineup.id] || [],
                practiceEntry: practiceEntries.find((e: any) => e.lineup_id === lineup.id) || null,
              })).filter((s: any) => s.date);

              if (sessions.length === 0) return null;

              // Lineup names from first session
              const seats: any[] = Array.isArray(sessions[0].lineup.seats) ? sessions[0].lineup.seats : [];
              const rosterNames = seats.filter(s => s.user_id).map(s => s.name || s.user_id).join(", ");

              return (
                <Card key={fp}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Lineup: {rosterNames || "Unknown athletes"}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">{sessions.length} session{sessions.length !== 1 ? "s" : ""}</p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {sessions.map((session, idx) => {
                      const prevSession = idx > 0 ? sessions[idx - 1] : null;
                      const sessionId = `${fp}-${session.date}`;
                      const isExpanded = expandedSession === sessionId;
                      const hasResults = session.results.length > 0;
                      const firstResult = session.results[0];
                      const prevResult = prevSession?.results[0];

                      // Compute per-split comparison
                      let splitComparison: Array<{ split_seconds: number; diff: number | null }> = [];
                      let overallDiff: number | null = null;

                      if (firstResult?.splits && prevResult?.splits) {
                        const curSplits: any[] = firstResult.splits;
                        const prevSplits: any[] = prevResult.splits;
                        splitComparison = curSplits.map((sp: any, i: number) => ({
                          split_seconds: sp.split_seconds,
                          diff: prevSplits[i] != null ? sp.split_seconds - prevSplits[i].split_seconds : null,
                        }));
                      }

                      if (firstResult?.avg_split_seconds && prevResult?.avg_split_seconds) {
                        overallDiff = firstResult.avg_split_seconds - prevResult.avg_split_seconds;
                      }

                      return (
                        <div
                          key={sessionId}
                          className="rounded-lg border bg-card/50 overflow-hidden"
                        >
                          <button
                            className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/30 transition-colors"
                            onClick={() => setExpandedSession(isExpanded ? null : sessionId)}
                          >
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-sm font-medium">
                                {new Date(session.date + "T12:00:00").toLocaleDateString("en-US", {
                                  weekday: "short", month: "short", day: "numeric", year: "numeric"
                                })}
                              </span>
                              {!hasResults && (
                                <Badge variant="outline" className="text-xs text-orange-500 border-orange-500">Pending</Badge>
                              )}
                              {hasResults && firstResult?.distance_meters && (
                                <span className="text-xs text-muted-foreground">{firstResult.distance_meters}m</span>
                              )}
                              {hasResults && firstResult?.avg_split_seconds && (
                                <span className="text-xs font-mono">{formatSplit(firstResult.avg_split_seconds)}/500m</span>
                              )}
                              {overallDiff !== null && (
                                <span className={`text-xs flex items-center gap-0.5 font-medium ${overallDiff < 0 ? "text-green-500" : "text-red-500"}`}>
                                  {overallDiff < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                                  {Math.abs(overallDiff).toFixed(1)}s/500m {overallDiff < 0 ? "faster" : "slower"}
                                </span>
                              )}
                            </div>
                            {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                          </button>

                          {isExpanded && (
                            <div className="px-3 pb-3 space-y-3 border-t">
                              {/* Seat list */}
                              <div className="pt-3">
                                <p className="text-xs font-medium text-muted-foreground mb-1">Lineup</p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                                  {(Array.isArray(session.lineup.seats) ? session.lineup.seats : []).map((s: any) => (
                                    <div key={s.seat_number} className="flex gap-1.5 text-xs">
                                      <span className="text-muted-foreground w-10 shrink-0">{s.seat_number === 0 ? "Cox" : `Seat ${s.seat_number}`}</span>
                                      <span className="font-medium truncate">{s.name || "—"}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Workout data */}
                              {hasResults && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">Workout</p>
                                  <div className="flex flex-wrap gap-2 text-xs mb-2">
                                    {firstResult.piece_type && <Badge variant="outline">{firstResult.piece_type}</Badge>}
                                    {firstResult.distance_meters && <span>{firstResult.distance_meters}m</span>}
                                    {firstResult.time_seconds && <span className="font-mono">{formatTime(firstResult.time_seconds)}</span>}
                                    {firstResult.avg_split_seconds && <span className="font-mono">{formatSplit(firstResult.avg_split_seconds)}/500m avg</span>}
                                    {firstResult.stroke_rate && <span>{firstResult.stroke_rate} s/m</span>}
                                  </div>

                                  {/* 500m splits with comparison */}
                                  {Array.isArray(firstResult.splits) && firstResult.splits.length > 0 && (
                                    <div>
                                      <p className="text-xs font-medium text-muted-foreground mb-1">500m Splits</p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {firstResult.splits.map((sp: any, i: number) => {
                                          const cmp = splitComparison[i];
                                          const diff = cmp?.diff ?? null;
                                          const colorClass = diff === null ? "bg-muted" : diff < 0 ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" : diff > 0 ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" : "bg-muted";
                                          return (
                                            <div key={i} className="flex flex-col items-center gap-0.5">
                                              <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${colorClass}`}>
                                                {formatSplit(sp.split_seconds)}
                                              </span>
                                              {diff !== null && (
                                                <span className={`text-[10px] ${diff < 0 ? "text-green-500" : diff > 0 ? "text-red-500" : "text-muted-foreground"}`}>
                                                  {diff < 0 ? "" : "+"}{diff.toFixed(1)}s
                                                </span>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {/* vs previous session summary */}
                                  {overallDiff !== null && (
                                    <div className={`mt-2 p-2 rounded text-xs font-medium flex items-center gap-1.5 ${overallDiff < 0 ? "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300" : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"}`}>
                                      {overallDiff < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                                      This lineup is {Math.abs(overallDiff).toFixed(1)}s/500m {overallDiff < 0 ? "faster" : "slower"} than last session
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Coach notes */}
                              {session.practiceEntry?.coach_notes && (
                                <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-0.5">Coach Notes</p>
                                  <p className="text-xs">{session.practiceEntry.coach_notes}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

export default LineupHistory;
