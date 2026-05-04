import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, GitCompare, Sparkles, ChevronLeft, AlertCircle } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from "recharts";
import { formatSplit, formatTime } from "./constants";

interface Props {
  teamId: string;
  isCoach: boolean;
  profile: any;
  seasonId?: string | null;
  boats?: any[];
}

const SESSION_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899"];

interface SessionData {
  id: string;
  date: string;
  boatName: string;
  boatClass: string;
  boatId: string;
  coachNotes: string;
  lineup: string;
  lineupSeats: any[];
  lineupId: string | null;
  pieces: any[];
  attendance: number;
  totalRoster: number;
  conditions: string;
  windConditions: string;
  waterConditions: string;
  avgSplit: number;
  avgStrokeRate: number;
  totalDistance: number;
  totalTime: number;
  pieceCount: number;
}

function formatSplitSec(sec: number): string {
  if (!sec) return "--:--";
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return `${m}:${s.padStart(4, "0")}`;
}

const SplitTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0f1f3d] border border-white/20 rounded-lg p-2 text-xs">
      <p className="text-white/60 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {formatSplitSec(p.value)}
        </p>
      ))}
    </div>
  );
};

function invertedSplitTick({ x, y, payload }: any) {
  return (
    <text x={x} y={y} dy={4} fill="#94a3b8" fontSize={10} textAnchor="end">
      {formatSplitSec(payload.value)}
    </text>
  );
}

const WorkoutComparison = ({ teamId, isCoach, profile, seasonId, boats = [] }: Props) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [comparing, setComparing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<{ sections: Record<string, string>; raw: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const analysisCache = useRef<Map<string, any>>(new Map());

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["workout-comparison-sessions", teamId, seasonId],
    queryFn: async () => {
      let q = supabase
        .from("practice_entries")
        .select(`
          id, practice_date, coach_notes, status,
          boat_id, lineup_id,
          boat_lineups (
            id, name, seats, boat_class,
            on_water_pieces (
              id, piece_number, piece_type, distance, time_seconds,
              average_split_seconds, splits, stroke_rate
            )
          ),
          team_boats (id, name, boat_class)
        `)
        .eq("team_id", teamId)
        .eq("status", "logged")
        .order("practice_date", { ascending: false })
        .limit(50);

      if (seasonId) {
        const season = await supabase
          .from("team_seasons")
          .select("start_date, end_date")
          .eq("id", seasonId)
          .maybeSingle();
        if (season.data) {
          q = q
            .gte("practice_date", season.data.start_date)
            .lte("practice_date", season.data.end_date);
        }
      }

      const { data, error } = await q;
      if (error) throw error;

      // For each practice entry, get attendance count
      const sessionIds = (data || []).map((d: any) => d.id);
      let attendanceMap: Record<string, number> = {};
      if (sessionIds.length) {
        const { data: att } = await supabase
          .from("practice_attendance")
          .select("lineup_id, status")
          .in("lineup_id", (data || []).filter((d: any) => d.lineup_id).map((d: any) => d.lineup_id));
        if (att) {
          for (const a of att) {
            if (a.status === "yes") {
              attendanceMap[a.lineup_id] = (attendanceMap[a.lineup_id] || 0) + 1;
            }
          }
        }
      }

      return (data || [])
        .filter((d: any) => {
          const pieces = d.boat_lineups?.on_water_pieces || [];
          return pieces.length > 0 || d.coach_notes;
        })
        .map((d: any): SessionData => {
          const pieces: any[] = d.boat_lineups?.on_water_pieces || [];
          const sortedPieces = [...pieces].sort((a, b) => a.piece_number - b.piece_number);
          const lineup = d.boat_lineups;
          const boat = d.team_boats;
          const boatName = boat?.name || lineup?.name || "Unknown Boat";
          const boatClass = boat?.boat_class || lineup?.boat_class || "—";

          const splitsWithData = sortedPieces.filter((p) => p.average_split_seconds > 0);
          const avgSplit = splitsWithData.length
            ? splitsWithData.reduce((a, p) => a + p.average_split_seconds, 0) / splitsWithData.length
            : 0;
          const rateData = sortedPieces.filter((p) => p.stroke_rate > 0);
          const avgStrokeRate = rateData.length
            ? rateData.reduce((a, p) => a + p.stroke_rate, 0) / rateData.length
            : 0;
          const totalDistance = sortedPieces.reduce((a, p) => a + (p.distance || 0), 0);
          const totalTime = sortedPieces.reduce((a, p) => a + (p.time_seconds || 0), 0);

          const seats: any[] = lineup?.seats || [];
          const lineupStr = seats
            .filter((s) => s.athlete)
            .map((s) => s.athlete?.full_name || s.athlete?.username || "?")
            .join(", ");

          // Get weather from first piece that has it, or from onwater_results (not available here — use notes)
          return {
            id: d.id,
            date: d.practice_date,
            boatName,
            boatClass,
            boatId: d.boat_id || "",
            coachNotes: d.coach_notes || "",
            lineup: lineupStr,
            lineupSeats: seats,
            lineupId: d.lineup_id,
            pieces: sortedPieces,
            attendance: attendanceMap[d.lineup_id] || 0,
            totalRoster: seats.filter((s) => s.athlete).length,
            conditions: "",
            windConditions: "",
            waterConditions: "",
            avgSplit,
            avgStrokeRate,
            totalDistance,
            totalTime,
            pieceCount: sortedPieces.length,
          };
        });
    },
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 6) {
        next.add(id);
      }
      return next;
    });
  };

  const selectedSessions = useMemo(
    () => sessions.filter((s) => selectedIds.has(s.id)),
    [sessions, selectedIds]
  );

  const colorFor = (idx: number) => SESSION_COLORS[idx % SESSION_COLORS.length];
  const labelFor = (s: SessionData) =>
    `${new Date(s.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${s.boatName}`;

  // Chart data
  const avgSplitChartData = useMemo(
    () =>
      selectedSessions.map((s, i) => ({
        name: labelFor(s),
        split: s.avgSplit,
        color: colorFor(i),
      })),
    [selectedSessions]
  );

  const strokeRateChartData = useMemo(
    () =>
      selectedSessions.map((s, i) => ({
        name: labelFor(s),
        rate: s.avgStrokeRate || 0,
        color: colorFor(i),
      })),
    [selectedSessions]
  );

  // Split per 500m — collect all 500m mark keys across all sessions
  const splitPer500Data = useMemo(() => {
    const allMarks = new Set<number>();
    for (const s of selectedSessions) {
      for (const p of s.pieces) {
        const splitsArr: number[] = Array.isArray(p.splits) ? p.splits : [];
        splitsArr.forEach((_, i) => allMarks.add((i + 1) * 500));
      }
    }
    const marks = Array.from(allMarks).sort((a, b) => a - b);
    return marks.map((mark) => {
      const row: Record<string, any> = { mark: `${mark}m` };
      selectedSessions.forEach((s, si) => {
        // Collect all splits across all pieces and flatten
        const allSplits: number[] = [];
        for (const p of s.pieces) {
          const arr: number[] = Array.isArray(p.splits) ? p.splits : [];
          allSplits.push(...arr);
        }
        const idx = mark / 500 - 1;
        if (idx < allSplits.length && allSplits[idx]) {
          row[`session_${si}`] = allSplits[idx];
        }
      });
      return row;
    });
  }, [selectedSessions]);

  // Split trend by piece
  const pieceSplitData = useMemo(() => {
    const maxPieces = Math.max(...selectedSessions.map((s) => s.pieces.length), 0);
    return Array.from({ length: maxPieces }, (_, pi) => {
      const row: Record<string, any> = { piece: `Piece ${pi + 1}` };
      selectedSessions.forEach((s, si) => {
        const p = s.pieces[pi];
        if (p?.average_split_seconds) row[`session_${si}`] = p.average_split_seconds;
      });
      return row;
    });
  }, [selectedSessions]);

  const fastestIdx = useMemo(() => {
    if (!selectedSessions.length) return -1;
    let best = -1;
    let bestSplit = Infinity;
    selectedSessions.forEach((s, i) => {
      if (s.avgSplit > 0 && s.avgSplit < bestSplit) {
        bestSplit = s.avgSplit;
        best = i;
      }
    });
    return best;
  }, [selectedSessions]);

  // Lineup diff
  const lineupDiff = useMemo(() => {
    if (selectedSessions.length < 2) return null;
    const base = selectedSessions[0];
    const others = selectedSessions.slice(1);
    const baseSeatMap: Record<string, string> = {};
    base.lineupSeats.forEach((seat) => {
      const name = seat.athlete?.full_name || seat.athlete?.username || "";
      if (name) baseSeatMap[seat.seat_label || String(seat.seat_number)] = name;
    });

    const diffs = others.map((other, oi) => {
      const otherMap: Record<string, string> = {};
      other.lineupSeats.forEach((seat) => {
        const name = seat.athlete?.full_name || seat.athlete?.username || "";
        if (name) otherMap[seat.seat_label || String(seat.seat_number)] = name;
      });

      const changes: { seat: string; from: string; to: string }[] = [];
      const allSeats = new Set([...Object.keys(baseSeatMap), ...Object.keys(otherMap)]);
      allSeats.forEach((seat) => {
        if (baseSeatMap[seat] !== otherMap[seat]) {
          changes.push({ seat, from: baseSeatMap[seat] || "—", to: otherMap[seat] || "—" });
        }
      });

      const splitDiff =
        base.avgSplit && other.avgSplit ? other.avgSplit - base.avgSplit : null;

      return { session: other, changes, splitDiff, colorIdx: oi + 1 };
    });

    return diffs;
  }, [selectedSessions]);

  const runAiAnalysis = async () => {
    const cacheKey = Array.from(selectedIds).sort().join(",");
    if (analysisCache.current.has(cacheKey)) {
      setAiAnalysis(analysisCache.current.get(cacheKey));
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const payload = selectedSessions.map((s) => ({
        date: s.date,
        boatName: s.boatName,
        boatClass: s.boatClass,
        coachNotes: s.coachNotes,
        lineup: s.lineup,
        pieces: s.pieces.map((p) => ({
          piece_number: p.piece_number,
          piece_type: p.piece_type,
          distance: p.distance,
          time_seconds: p.time_seconds,
          average_split_seconds: p.average_split_seconds,
          stroke_rate: p.stroke_rate,
        })),
        attendance: s.attendance,
        totalRoster: s.totalRoster,
        avgSplit: s.avgSplit,
        avgStrokeRate: s.avgStrokeRate,
        totalDistance: s.totalDistance,
        totalTime: s.totalTime,
        conditions: s.conditions,
        windConditions: s.windConditions,
        waterConditions: s.waterConditions,
      }));

      const { data, error } = await supabase.functions.invoke("analyze-workouts", {
        body: { sessions: payload },
      });

      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);

      analysisCache.current.set(cacheKey, data);
      setAiAnalysis(data);
    } catch (e: any) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
    }
  };

  if (!comparing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Workout Comparison</h2>
            <p className="text-sm text-white/50 mt-0.5">
              Select 2–6 sessions to compare performance side by side
            </p>
          </div>
          {selectedIds.size >= 2 && (
            <Button
              onClick={() => setComparing(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2"
            >
              <GitCompare className="h-4 w-4" />
              Compare {selectedIds.size} Sessions
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-white/40" />
          </div>
        ) : sessions.length === 0 ? (
          <Card className="bg-white/5 border-white/10">
            <CardContent className="py-12 text-center">
              <p className="text-white/40">No logged on-water sessions found for this season.</p>
              <p className="text-white/30 text-sm mt-1">Log sessions from the Practice Detail tab.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => {
              const isSelected = selectedIds.has(s.id);
              const isDisabled = !isSelected && selectedIds.size >= 6;
              return (
                <div
                  key={s.id}
                  onClick={() => !isDisabled && toggleSelect(s.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-indigo-600/20 border-indigo-500/50"
                      : isDisabled
                      ? "opacity-40 border-white/5 cursor-not-allowed"
                      : "bg-white/5 border-white/10 hover:bg-white/10"
                  }`}
                >
                  <Checkbox
                    checked={isSelected}
                    disabled={isDisabled}
                    onCheckedChange={() => !isDisabled && toggleSelect(s.id)}
                    className="border-white/30 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                  />
                  <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-x-4 gap-y-0.5">
                    <div>
                      <p className="text-white text-sm font-medium">
                        {new Date(s.date + "T00:00:00").toLocaleDateString("en-US", {
                          month: "short", day: "numeric", year: "numeric",
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-white/70 text-sm truncate">{s.boatName}</p>
                      <p className="text-white/40 text-xs">{s.boatClass}</p>
                    </div>
                    <div>
                      <p className="text-white/50 text-xs">Avg Split</p>
                      <p className="text-white text-sm font-mono">
                        {s.avgSplit ? formatSplitSec(s.avgSplit) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-white/50 text-xs">Distance</p>
                      <p className="text-white text-sm">{s.totalDistance ? `${(s.totalDistance / 1000).toFixed(1)}k` : "—"}</p>
                    </div>
                    <div>
                      <p className="text-white/50 text-xs">Pieces</p>
                      <p className="text-white text-sm">{s.pieceCount}</p>
                    </div>
                    <div>
                      <p className="text-white/50 text-xs">Attendance</p>
                      <p className="text-white text-sm">{s.attendance}/{s.totalRoster}</p>
                    </div>
                  </div>
                  {isSelected && (
                    <div
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{
                        backgroundColor: colorFor(
                          Array.from(selectedIds).indexOf(s.id)
                        ),
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {selectedIds.size === 1 && (
          <p className="text-white/40 text-sm text-center">Select at least one more session to compare</p>
        )}
      </div>
    );
  }

  // ─── COMPARISON VIEW ───────────────────────────────────────────────────────
  const hasSplit500Data = splitPer500Data.length > 0 && splitPer500Data.some((d) => Object.keys(d).length > 1);
  const hasPieceData = pieceSplitData.length > 0 && pieceSplitData.some((d) => Object.keys(d).length > 1);
  const hasLineupDiffs = lineupDiff && lineupDiff.some((d) => d.changes.length > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setComparing(false); setAiAnalysis(null); }}
          className="text-white/60 hover:text-white gap-1.5 px-2"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-white">Comparing {selectedSessions.length} Sessions</h2>
        </div>
      </div>

      {/* Color legend */}
      <div className="flex flex-wrap gap-3">
        {selectedSessions.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: colorFor(i) }} />
            <span className="text-xs text-white/70">{labelFor(s)}</span>
          </div>
        ))}
      </div>

      {/* Stat cards — Distance + Time + Attendance */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {selectedSessions.map((s, i) => (
          <Card key={s.id} className="bg-white/5 border-white/10">
            <CardContent className="p-3">
              <div className="h-1.5 rounded-full mb-2" style={{ backgroundColor: colorFor(i) }} />
              <p className="text-white/50 text-xs truncate">{labelFor(s)}</p>
              <p className="text-white font-bold mt-1">{s.totalDistance ? `${(s.totalDistance / 1000).toFixed(1)}k` : "—"}</p>
              <p className="text-white/60 text-xs">{s.totalTime ? formatTime(s.totalTime) : "—"}</p>
              <p className="text-white/50 text-xs mt-1">{s.attendance}/{s.totalRoster} athletes</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Avg split bar */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-base">Average Split per Session</CardTitle>
          <p className="text-white/40 text-xs">Lower (faster) is better — fastest session highlighted</p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={avgSplitChartData} margin={{ top: 5, right: 10, left: 50, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis
                dataKey="name"
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                angle={-25}
                textAnchor="end"
                interval={0}
                height={50}
              />
              <YAxis tick={invertedSplitTick} domain={["auto", "auto"]} reversed={false} />
              <Tooltip content={<SplitTooltip />} />
              <Bar dataKey="split" name="Avg Split" radius={[4, 4, 0, 0]}>
                {avgSplitChartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.color}
                    opacity={fastestIdx === i ? 1 : 0.6}
                    stroke={fastestIdx === i ? "#fff" : "transparent"}
                    strokeWidth={fastestIdx === i ? 1.5 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Stroke rate bar */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-base">Average Stroke Rate per Session</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={strokeRateChartData} margin={{ top: 5, right: 10, left: 10, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis
                dataKey="name"
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                angle={-25}
                textAnchor="end"
                interval={0}
                height={50}
              />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f1f3d", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8 }}
                labelStyle={{ color: "#94a3b8" }}
                itemStyle={{ color: "#fff" }}
              />
              <Bar dataKey="rate" name="Stroke Rate (spm)" radius={[4, 4, 0, 0]}>
                {strokeRateChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Split per 500m line */}
      {hasSplit500Data && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base">Split per 500m — Pacing Strategy</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={splitPer500Data} margin={{ top: 5, right: 10, left: 50, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="mark" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <YAxis tick={invertedSplitTick} domain={["auto", "auto"]} reversed={false} />
                <Tooltip content={<SplitTooltip />} />
                <Legend
                  formatter={(value) => {
                    const idx = parseInt(value.replace("session_", ""));
                    return <span style={{ color: colorFor(idx), fontSize: 11 }}>{labelFor(selectedSessions[idx])}</span>;
                  }}
                />
                {selectedSessions.map((s, i) => (
                  <Line
                    key={s.id}
                    type="monotone"
                    dataKey={`session_${i}`}
                    stroke={colorFor(i)}
                    strokeWidth={2}
                    dot={{ fill: colorFor(i), r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Split trend by piece */}
      {hasPieceData && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base">Split Trend by Piece</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={pieceSplitData} margin={{ top: 5, right: 10, left: 50, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="piece" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={invertedSplitTick} domain={["auto", "auto"]} />
                <Tooltip content={<SplitTooltip />} />
                <Legend
                  formatter={(value) => {
                    const idx = parseInt(value.replace("session_", ""));
                    return <span style={{ color: colorFor(idx), fontSize: 11 }}>{labelFor(selectedSessions[idx])}</span>;
                  }}
                />
                {selectedSessions.map((s, i) => (
                  <Bar
                    key={s.id}
                    dataKey={`session_${i}`}
                    fill={colorFor(i)}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={40}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Session details table */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-base">Session Details</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-white/40 text-xs font-medium text-left py-2 pr-4">Field</th>
                {selectedSessions.map((s, i) => (
                  <th key={s.id} className="text-left py-2 px-2">
                    <span className="text-xs font-semibold" style={{ color: colorFor(i) }}>
                      {labelFor(s)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[
                { label: "Date", value: (s: SessionData) => new Date(s.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) },
                { label: "Boat", value: (s: SessionData) => `${s.boatName} (${s.boatClass})` },
                { label: "Lineup", value: (s: SessionData) => s.lineup || "—" },
                { label: "Coach Plan", value: (s: SessionData) => s.coachNotes || "—" },
                { label: "Pieces", value: (s: SessionData) => s.pieceCount.toString() },
                { label: "Avg Split", value: (s: SessionData) => s.avgSplit ? formatSplitSec(s.avgSplit) : "—" },
                { label: "Distance", value: (s: SessionData) => s.totalDistance ? `${(s.totalDistance / 1000).toFixed(1)}km` : "—" },
                { label: "Total Time", value: (s: SessionData) => s.totalTime ? formatTime(s.totalTime) : "—" },
                { label: "Attendance", value: (s: SessionData) => `${s.attendance}/${s.totalRoster}` },
              ].map((row) => (
                <tr key={row.label}>
                  <td className="text-white/40 text-xs py-2 pr-4 font-medium">{row.label}</td>
                  {selectedSessions.map((s) => (
                    <td key={s.id} className="text-white/80 text-xs py-2 px-2 max-w-[200px] truncate">
                      {row.value(s)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Lineup diff */}
      {hasLineupDiffs && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base">Lineup Changes</CardTitle>
            <p className="text-white/40 text-xs">Seats that changed vs. the first selected session</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {lineupDiff!.map((diff) =>
              diff.changes.length === 0 ? null : (
                <div key={diff.session.id}>
                  <p className="text-xs font-medium mb-2" style={{ color: colorFor(diff.colorIdx) }}>
                    vs {labelFor(diff.session)}
                    {diff.splitDiff !== null && (
                      <span className={`ml-2 ${diff.splitDiff < 0 ? "text-green-400" : "text-red-400"}`}>
                        ({diff.splitDiff < 0 ? "" : "+"}{formatSplitSec(Math.abs(diff.splitDiff))} split change)
                      </span>
                    )}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {diff.changes.map((change) => (
                      <div key={change.seat} className="flex items-center gap-2 bg-white/5 rounded px-2 py-1.5 text-xs">
                        <Badge variant="outline" className="border-white/20 text-white/60 text-[10px] shrink-0">
                          {change.seat}
                        </Badge>
                        <span className="text-white/50 truncate">{change.from}</span>
                        <span className="text-white/30">→</span>
                        <span className="text-white truncate">{change.to}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </CardContent>
        </Card>
      )}

      {/* AI Analysis */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              AI Coaching Analysis
            </CardTitle>
            {!aiAnalysis && (
              <Button
                onClick={runAiAnalysis}
                disabled={aiLoading}
                className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 h-8 text-xs"
              >
                {aiLoading ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing…</>
                ) : (
                  <><Sparkles className="h-3.5 w-3.5" /> Analyze with AI</>
                )}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {aiError && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {aiError}
            </div>
          )}
          {aiLoading && !aiAnalysis && (
            <div className="flex items-center justify-center py-8 gap-3 text-white/40">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Generating coaching analysis…</span>
            </div>
          )}
          {aiAnalysis && (
            <div className="space-y-4">
              {[
                { key: "STRONGEST SESSION", label: "Strongest Session", color: "text-green-400" },
                { key: "PACING PATTERNS", label: "Pacing Patterns", color: "text-blue-400" },
                { key: "PERFORMANCE TREND", label: "Performance Trend", color: "text-indigo-400" },
                { key: "CONDITIONS CORRELATION", label: "Conditions Correlation", color: "text-yellow-400" },
                { key: "NEXT PRACTICE FOCUS", label: "Next Practice Focus", color: "text-cyan-400" },
                { key: "ANOMALIES", label: "Anomalies", color: "text-orange-400" },
              ].map(({ key, label, color }) => {
                const text = aiAnalysis.sections[key];
                if (!text) return null;
                return (
                  <div key={key}>
                    <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${color}`}>{label}</p>
                    <p className="text-white/80 text-sm leading-relaxed">{text}</p>
                  </div>
                );
              })}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setAiAnalysis(null); analysisCache.current.delete(Array.from(selectedIds).sort().join(",")); }}
                className="text-white/30 hover:text-white/60 text-xs mt-2"
              >
                Regenerate analysis
              </Button>
            </div>
          )}
          {!aiAnalysis && !aiLoading && !aiError && (
            <p className="text-white/40 text-sm">
              Tap "Analyze with AI" to get a detailed coaching report covering performance trends, pacing strategy, and recommendations.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WorkoutComparison;
