import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ChevronDown, ChevronUp, Ship, TrendingDown, TrendingUp, Minus,
  Target, Video, Zap, Battery, Moon, AlertTriangle,
} from "lucide-react";
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

function RaceReadinessBadge({ score, trend }: { score: number | null; trend: "up" | "down" | "flat" | null }) {
  if (score === null) return null;
  const color = score >= 75 ? "bg-green-500/20 text-green-700 border-green-300 dark:text-green-400"
    : score >= 50 ? "bg-yellow-500/20 text-yellow-700 border-yellow-300 dark:text-yellow-400"
    : "bg-red-500/20 text-red-700 border-red-300 dark:text-red-400";
  return (
    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${color}`}>
      <Target className="h-3 w-3" />
      Race Ready: {Math.round(score)}%
      {trend === "up" && <TrendingDown className="h-3 w-3 text-green-600" />}
      {trend === "down" && <TrendingUp className="h-3 w-3 text-red-600" />}
      {trend === "flat" && <Minus className="h-3 w-3" />}
    </div>
  );
}

function WellnessDot({ userId, wellnessMap }: { userId: string; wellnessMap: Record<string, any> }) {
  const w = wellnessMap[userId];
  if (!w) return null;
  const lowEnergy = w.energy != null && w.energy < 5;
  const highSoreness = w.soreness != null && w.soreness > 7;
  const poorSleep = w.sleep_hours != null && w.sleep_hours < 6;
  if (!lowEnergy && !highSoreness && !poorSleep) return null;
  return (
    <span title={[
      lowEnergy ? `Low energy: ${w.energy}/10` : null,
      highSoreness ? `High soreness: ${w.soreness}/10` : null,
      poorSleep ? `Sleep: ${w.sleep_hours}h` : null,
    ].filter(Boolean).join(", ")}>
      <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
    </span>
  );
}

function VideoCompare({ sessions, teamId }: { sessions: any[]; teamId: string }) {
  const [open, setOpen] = useState(false);
  const [leftId, setLeftId] = useState<string | null>(sessions[0]?.id || null);
  const [rightId, setRightId] = useState<string | null>(sessions[1]?.id || null);
  const leftRef = useRef<HTMLVideoElement>(null);
  const rightRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const sessionsWithVideos = sessions.filter(s => (s.videos || []).length > 0);
  if (sessionsWithVideos.length < 2) return null;

  const leftVideos = sessionsWithVideos.find(s => s.id === leftId)?.videos || [];
  const rightVideos = sessionsWithVideos.find(s => s.id === rightId)?.videos || [];
  const leftUrl = leftVideos[0]?.signed_url;
  const rightUrl = rightVideos[0]?.signed_url;

  function togglePlay() {
    if (playing) {
      leftRef.current?.pause();
      rightRef.current?.pause();
    } else {
      leftRef.current?.play();
      rightRef.current?.play();
    }
    setPlaying(!playing);
  }

  function seek(t: number) {
    if (leftRef.current) leftRef.current.currentTime = t;
    if (rightRef.current) rightRef.current.currentTime = t;
  }

  return (
    <>
      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setOpen(true)}>
        <Video className="h-3 w-3" />Compare Videos
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Video Comparison</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Session selectors */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Left", value: leftId, onChange: setLeftId },
                { label: "Right", value: rightId, onChange: setRightId },
              ].map(({ label, value, onChange }) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground mb-1">{label} session</p>
                  <select
                    value={value || ""}
                    onChange={e => onChange(e.target.value || null)}
                    className="w-full text-xs border rounded px-2 py-1.5 bg-background"
                  >
                    <option value="">Select...</option>
                    {sessionsWithVideos.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.date} ({(s.videos || []).length} video{s.videos?.length !== 1 ? "s" : ""})
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {/* Side-by-side videos */}
            <div className="grid grid-cols-2 gap-2">
              {[{ url: leftUrl, ref: leftRef }, { url: rightUrl, ref: rightRef }].map((v, i) => (
                <div key={i} className="rounded-lg overflow-hidden bg-black aspect-video flex items-center justify-center">
                  {v.url ? (
                    <video ref={v.ref} src={v.url} className="w-full h-full object-contain" />
                  ) : (
                    <p className="text-xs text-muted-foreground">No video</p>
                  )}
                </div>
              ))}
            </div>

            {/* Playback controls */}
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={togglePlay} className="gap-1.5">
                {playing ? "Pause" : "Play Both"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => seek(0)}>Rewind</Button>
              <input
                type="range"
                min="0"
                max="100"
                className="flex-1"
                onChange={e => {
                  const dur = leftRef.current?.duration || 0;
                  seek((parseInt(e.target.value) / 100) * dur);
                }}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
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
        .from("practice_entries" as any)
        .select("*")
        .eq("team_id", teamId);
      return data || [];
    },
  });

  const { data: pieces = [] } = useQuery({
    queryKey: ["lineup-history-pieces", teamId],
    queryFn: async () => {
      const entryIds = (practiceEntries as any[]).map((e: any) => e.id);
      if (entryIds.length === 0) return [];
      const { data } = await supabase
        .from("on_water_pieces" as any)
        .select("*")
        .in("session_id", entryIds)
        .order("piece_number", { ascending: true });
      return data || [];
    },
    enabled: (practiceEntries as any[]).length > 0,
  });

  const { data: practiceVideos = [] } = useQuery({
    queryKey: ["lineup-history-videos", teamId],
    queryFn: async () => {
      const entryIds = (practiceEntries as any[]).map((e: any) => e.id);
      if (entryIds.length === 0) return [];
      const { data } = await supabase
        .from("practice_videos" as any)
        .select("*")
        .in("session_id", entryIds);
      if (!data) return [];
      const enriched = await Promise.all(data.map(async (v: any) => {
        const { data: urlData } = await supabase.storage
          .from("practice-videos")
          .createSignedUrl(v.video_path, 3600);
        return { ...v, signed_url: urlData?.signedUrl };
      }));
      return enriched;
    },
    enabled: (practiceEntries as any[]).length > 0,
  });

  // Collect all unique athlete IDs for wellness query
  const allAthleteIds = useMemo(() => {
    const ids = new Set<string>();
    for (const lineup of lineups as any[]) {
      const seats: any[] = Array.isArray(lineup.seats) ? lineup.seats : [];
      for (const s of seats) if (s.user_id) ids.add(s.user_id);
    }
    return [...ids];
  }, [lineups]);

  // Practice dates for wellness query
  const allPracticeDates = useMemo(() => {
    const dates = new Set<string>();
    for (const l of lineups as any[]) if (l.practice_date) dates.add(l.practice_date);
    return [...dates];
  }, [lineups]);

  const { data: wellnessData = [] } = useQuery({
    queryKey: ["lineup-history-wellness", teamId, allAthleteIds.join(",")],
    queryFn: async () => {
      if (allAthleteIds.length === 0 || allPracticeDates.length === 0) return [];
      const { data } = await supabase
        .from("wellness_checkins" as any)
        .select("user_id, checkin_date, energy, soreness, sleep_hours")
        .in("user_id", allAthleteIds)
        .in("checkin_date", allPracticeDates);
      return data || [];
    },
    enabled: allAthleteIds.length > 0 && allPracticeDates.length > 0 && isCoach,
  });

  // Build wellness map: date → userId → data
  const wellnessByDateUser = useMemo(() => {
    const map: Record<string, Record<string, any>> = {};
    for (const w of wellnessData as any[]) {
      if (!map[w.checkin_date]) map[w.checkin_date] = {};
      map[w.checkin_date][w.user_id] = w;
    }
    return map;
  }, [wellnessData]);

  const resultsByLineup = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const r of results as any[]) {
      if (!r.lineup_id) continue;
      if (!map[r.lineup_id]) map[r.lineup_id] = [];
      map[r.lineup_id].push(r);
    }
    return map;
  }, [results]);

  const entriesByLineup = useMemo(() => {
    const map: Record<string, any> = {};
    for (const e of practiceEntries as any[]) {
      if (e.lineup_id) map[e.lineup_id] = e;
    }
    return map;
  }, [practiceEntries]);

  const piecesByEntry = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const p of pieces as any[]) {
      if (!map[p.session_id]) map[p.session_id] = [];
      map[p.session_id].push(p);
    }
    return map;
  }, [pieces]);

  const videosByEntry = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const v of practiceVideos as any[]) {
      if (!map[v.session_id]) map[v.session_id] = [];
      map[v.session_id].push(v);
    }
    return map;
  }, [practiceVideos]);

  function lineupFingerprint(lineup: any): string {
    const seats: any[] = Array.isArray(lineup.seats) ? lineup.seats : [];
    return seats.filter((s: any) => s.user_id).map((s: any) => s.user_id).sort().join(",");
  }

  const boatGroups = useMemo(() => {
    const groups: Record<string, { boatId: string; boatName: string; lineupGroups: Record<string, any[]> }> = {};
    for (const lineup of lineups as any[]) {
      const boatKey = lineup.boat_id || lineup.boat_class;
      const boatName = boats.find((b: any) => b.id === lineup.boat_id)?.name || lineup.boat_class || "Unknown";
      if (!groups[boatKey]) groups[boatKey] = { boatId: boatKey, boatName, lineupGroups: {} };
      const fp = lineupFingerprint(lineup);
      if (!fp) continue;
      if (!groups[boatKey].lineupGroups[fp]) groups[boatKey].lineupGroups[fp] = [];
      groups[boatKey].lineupGroups[fp].push(lineup);
    }
    return groups;
  }, [lineups, boats]);

  // Compute race readiness score for a set of sessions (last 4 race_pace pieces with targets)
  function computeRaceReadiness(sessions: any[]): { score: number | null; trend: "up" | "down" | "flat" | null } {
    const last4 = sessions.slice(-4);
    const allPieces: any[] = [];
    for (const s of last4) {
      const entry = entriesByLineup[s.lineup.id];
      if (entry) {
        const ps = piecesByEntry[entry.id] || [];
        for (const p of ps) {
          if (p.piece_type === "race" && p.target_split_seconds && p.average_split_seconds) {
            allPieces.push(p);
          }
        }
      }
    }
    if (allPieces.length === 0) return { score: null, trend: null };
    const hitting = allPieces.filter(p => p.average_split_seconds <= p.target_split_seconds).length;
    const score = (hitting / allPieces.length) * 100;

    // Trend: compare first half vs second half
    const half = Math.floor(allPieces.length / 2);
    if (allPieces.length >= 4) {
      const first = allPieces.slice(0, half).filter(p => p.average_split_seconds <= p.target_split_seconds).length / half;
      const second = allPieces.slice(half).filter(p => p.average_split_seconds <= p.target_split_seconds).length / (allPieces.length - half);
      const trend = second > first + 0.1 ? "up" : second < first - 0.1 ? "down" : "flat";
      return { score, trend };
    }
    return { score, trend: null };
  }

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

              const sessions: Array<{
                id: string;
                date: string;
                lineup: any;
                results: any[];
                practiceEntry: any;
                videos: any[];
              }> = fpLineups.map((lineup: any) => {
                const entry = entriesByLineup[lineup.id];
                return {
                  id: lineup.id,
                  date: lineup.practice_date || lineup.created_at?.split("T")[0] || "",
                  lineup,
                  results: resultsByLineup[lineup.id] || [],
                  practiceEntry: entry || null,
                  videos: entry ? (videosByEntry[entry.id] || []) : [],
                };
              }).filter((s: any) => s.date);

              if (sessions.length === 0) return null;

              const raceReadiness = computeRaceReadiness(sessions);
              const seats: any[] = Array.isArray(sessions[0].lineup.seats) ? sessions[0].lineup.seats : [];
              const rosterNames = seats.filter(s => s.user_id).map(s => s.name || s.user_id).join(", ");

              return (
                <Card key={fp}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                          {rosterNames || "Unknown athletes"}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">{sessions.length} session{sessions.length !== 1 ? "s" : ""}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <RaceReadinessBadge score={raceReadiness.score} trend={raceReadiness.trend} />
                        <VideoCompare sessions={sessions} teamId={teamId} />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {sessions.map((session, idx) => {
                      const prevSession = idx > 0 ? sessions[idx - 1] : null;
                      const sessionId = `${fp}-${session.date}`;
                      const isExpanded = expandedSession === sessionId;
                      const hasResults = session.results.length > 0;
                      const firstResult = session.results[0];
                      const prevResult = prevSession?.results[0];
                      const wellnessMap = wellnessByDateUser[session.date] || {};

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

                      // Get race_pace pieces for this session
                      const sessionEntry = session.practiceEntry;
                      const racePieces = sessionEntry ? (piecesByEntry[sessionEntry.id] || []) : [];
                      const hasVideos = session.videos.length > 0;

                      return (
                        <div key={sessionId} className="rounded-lg border bg-card/50 overflow-hidden">
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
                              {!hasResults && !racePieces.length && (
                                <Badge variant="outline" className="text-xs text-orange-500 border-orange-500">Pending</Badge>
                              )}
                              {hasResults && firstResult?.distance_meters && (
                                <span className="text-xs text-muted-foreground">{firstResult.distance_meters}m</span>
                              )}
                              {hasResults && firstResult?.avg_split_seconds && (
                                <span className="text-xs font-mono">{formatSplit(firstResult.avg_split_seconds)}/500m</span>
                              )}
                              {racePieces.length > 0 && (
                                <Badge variant="outline" className="text-xs gap-1">
                                  <Zap className="h-2.5 w-2.5" />{racePieces.length} piece{racePieces.length !== 1 ? "s" : ""} logged
                                </Badge>
                              )}
                              {hasVideos && (
                                <Badge variant="outline" className="text-xs gap-1">
                                  <Video className="h-2.5 w-2.5" />{session.videos.length} video{session.videos.length !== 1 ? "s" : ""}
                                </Badge>
                              )}
                              {overallDiff !== null && (
                                <span className={`text-xs flex items-center gap-0.5 font-medium ${overallDiff < 0 ? "text-green-500" : "text-red-500"}`}>
                                  {overallDiff < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                                  {Math.abs(overallDiff).toFixed(1)}s/500m
                                </span>
                              )}
                            </div>
                            {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                          </button>

                          {isExpanded && (
                            <div className="px-3 pb-3 space-y-3 border-t">
                              {/* Planned by Coach */}
                              {session.lineup.workout_plan && (
                                <div className="pt-3 rounded-lg border-l-2 border-primary/50 pl-3 py-1">
                                  <p className="text-xs font-semibold text-muted-foreground mb-1">Planned by Coach</p>
                                  <p className="text-sm whitespace-pre-wrap">{session.lineup.workout_plan}</p>
                                </div>
                              )}

                              {/* Seat list with wellness */}
                              <div className={session.lineup.workout_plan ? "" : "pt-3"}>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Lineup</p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                                  {(Array.isArray(session.lineup.seats) ? session.lineup.seats : []).map((s: any) => (
                                    <div key={s.seat_number} className="flex gap-1.5 text-xs items-center">
                                      <span className="text-muted-foreground w-10 shrink-0">{s.seat_number === 0 ? "Cox" : `Seat ${s.seat_number}`}</span>
                                      <span className="font-medium truncate">{s.name || "—"}</span>
                                      {s.user_id && <WellnessDot userId={s.user_id} wellnessMap={wellnessMap} />}
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Logged by Cox */}
                              {racePieces.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground mb-1">Logged by Cox</p>
                                  <div className="space-y-1">
                                    {racePieces.map((p: any) => {
                                      const hitTarget = p.target_split_seconds && p.average_split_seconds
                                        ? p.average_split_seconds <= p.target_split_seconds
                                        : null;
                                      const typeLabels: Record<string, string> = { intervals: "Intervals", steady_state: "Steady State", drills: "Drills", race: "Race" };
                                      const typeLabel = typeLabels[p.piece_type] || p.piece_type;
                                      return (
                                        <div key={p.id} className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${hitTarget === true ? "bg-green-50 dark:bg-green-950/30" : hitTarget === false ? "bg-red-50 dark:bg-red-950/30" : "bg-muted/50"}`}>
                                          <span className="text-muted-foreground shrink-0">#{p.piece_number}</span>
                                          <span className="px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-medium shrink-0">{typeLabel}</span>
                                          {p.distance && <span>{p.distance}m</span>}
                                          {p.average_split_seconds && (
                                            <span className={`font-mono font-semibold ${hitTarget === true ? "text-green-700 dark:text-green-400" : hitTarget === false ? "text-red-700 dark:text-red-400" : ""}`}>
                                              {formatSplit(p.average_split_seconds)}/500m
                                            </span>
                                          )}
                                          {p.target_split_seconds && (
                                            <span className="text-muted-foreground flex items-center gap-0.5">
                                              <Target className="h-2.5 w-2.5" />{formatSplit(p.target_split_seconds)}
                                            </span>
                                          )}
                                          {hitTarget === true && <TrendingDown className="h-3 w-3 text-green-600 ml-auto" />}
                                          {hitTarget === false && <TrendingUp className="h-3 w-3 text-red-600 ml-auto" />}
                                          {p.notes && <span className="text-muted-foreground truncate max-w-[80px]">{p.notes}</span>}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* OnWater result splits */}
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

                                  {Array.isArray(firstResult.splits) && firstResult.splits.length > 0 && (
                                    <div>
                                      <p className="text-xs font-medium text-muted-foreground mb-1">500m Splits</p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {firstResult.splits.map((sp: any, i: number) => {
                                          const cmp = splitComparison[i];
                                          const diff = cmp?.diff ?? null;
                                          const colorClass = diff === null ? "bg-muted"
                                            : diff < 0 ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                                            : diff > 0 ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                                            : "bg-muted";
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

                                  {overallDiff !== null && (
                                    <div className={`mt-2 p-2 rounded text-xs font-medium flex items-center gap-1.5 ${overallDiff < 0 ? "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300" : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"}`}>
                                      {overallDiff < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                                      This lineup is {Math.abs(overallDiff).toFixed(1)}s/500m {overallDiff < 0 ? "faster" : "slower"} than last session
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Videos */}
                              {hasVideos && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">Videos</p>
                                  <div className="grid grid-cols-3 gap-1.5">
                                    {session.videos.map((v: any) => (
                                      <div key={v.id} className="relative rounded overflow-hidden bg-black aspect-video group">
                                        {v.signed_url ? (
                                          <video src={v.signed_url} controls className="w-full h-full object-contain" />
                                        ) : (
                                          <div className="flex items-center justify-center h-full">
                                            <Video className="h-4 w-4 text-white/50" />
                                          </div>
                                        )}
                                        {v.description && (
                                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate">
                                            {v.description}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
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
