import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Wind, Waves, TrendingUp, TrendingDown } from "lucide-react";
import { formatSplit, displayName } from "./constants";

interface Props {
  teamId: string;
  teamMembers: any[];
  isCoach: boolean;
  profile: any;
  boats?: any[];
}

function formatSplitSec(s: number) {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4, "0")}`;
}

function formatTimeSec(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const WorkoutHistory = ({ teamId, isCoach, profile, teamMembers, boats = [] }: Props) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: results = [], isLoading } = useQuery({
    queryKey: ["onwater-history", teamId, profile.id, isCoach],
    queryFn: async () => {
      let q = supabase
        .from("onwater_results")
        .select("*")
        .eq("team_id", teamId)
        .order("result_date", { ascending: false })
        .limit(100);
      const { data, error } = await q;
      if (error) throw error;
      // If athlete, filter to sessions they participated in
      if (!isCoach) {
        return (data || []).filter((r: any) =>
          !r.athlete_ids || r.athlete_ids.includes(profile.id)
        );
      }
      return data || [];
    },
  });

  const allAthletes = teamMembers.map((m: any) => m.profile || m).filter((a: any) => a?.id);

  // For each result, find the previous session with the same boat_id (or boat_class)
  function getPrevSession(result: any, index: number): any | null {
    const key = result.boat_id || result.boat_class;
    for (let i = index + 1; i < results.length; i++) {
      const r = results[i];
      const rKey = r.boat_id || r.boat_class;
      if (rKey === key && r.piece_type === result.piece_type) return r;
    }
    return null;
  }

  if (isLoading) return <div className="flex items-center justify-center p-8 text-muted-foreground">Loading...</div>;

  if (results.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">No on-water sessions logged yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Workout History</h2>
        <p className="text-sm text-muted-foreground">On-water sessions with split comparison</p>
      </div>

      <div className="space-y-3">
        {results.map((result: any, idx: number) => {
          const isExpanded = expandedId === result.id;
          const prev = getPrevSession(result, idx);
          const boatName = boats.find((b: any) => b.id === result.boat_id)?.name || result.boat_class || "Unknown boat";
          const splits: any[] = Array.isArray(result.splits) ? result.splits : [];
          const prevSplits: any[] = prev && Array.isArray(prev.splits) ? prev.splits : [];

          // Comparison delta
          let delta: number | null = null;
          if (result.avg_split_seconds && prev?.avg_split_seconds) {
            delta = parseFloat(String(result.avg_split_seconds)) - parseFloat(String(prev.avg_split_seconds));
          }

          return (
            <Card key={result.id}>
              <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : result.id)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-sm">{boatName}</CardTitle>
                      <Badge variant="outline" className="text-xs">{result.piece_type}</Badge>
                      {result.distance_meters && (
                        <span className="text-xs text-muted-foreground">{result.distance_meters}m</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(result.result_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      {result.avg_split_seconds && (
                        <span className="ml-2 font-mono font-medium text-foreground">
                          avg {formatSplit(parseFloat(String(result.avg_split_seconds)))}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {delta !== null && (
                      <span className={`text-xs flex items-center gap-0.5 font-medium ${delta < 0 ? "text-green-600" : "text-red-500"}`}>
                        {delta < 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {Math.abs(delta).toFixed(1)}s/500m {delta < 0 ? "faster" : "slower"}
                      </span>
                    )}
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="space-y-4 pt-0">
                  {/* Stats row */}
                  <div className="flex flex-wrap gap-4 text-xs">
                    {result.time_seconds && <div><p className="text-muted-foreground">Total Time</p><p className="font-mono font-medium">{formatTimeSec(result.time_seconds)}</p></div>}
                    {result.avg_split_seconds && <div><p className="text-muted-foreground">Avg Split</p><p className="font-mono font-medium">{formatSplit(parseFloat(String(result.avg_split_seconds)))}</p></div>}
                    {result.stroke_rate && <div><p className="text-muted-foreground">Stroke Rate</p><p className="font-medium">{result.stroke_rate} s/m</p></div>}
                    {result.distance_meters && <div><p className="text-muted-foreground">Distance</p><p className="font-medium">{result.distance_meters}m</p></div>}
                  </div>

                  {/* Conditions */}
                  {(result.wind_conditions || result.water_conditions) && (
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      {result.wind_conditions && (
                        <span className="flex items-center gap-1">
                          <Wind className="h-3 w-3" />
                          {result.wind_conditions === "light" ? "🌬️ Light wind" : result.wind_conditions === "moderate" ? "💨 Moderate wind" : "🌪️ Heavy wind"}
                        </span>
                      )}
                      {result.water_conditions && (
                        <span className="flex items-center gap-1">
                          <Waves className="h-3 w-3" />
                          {result.water_conditions === "flat" ? "🏞️ Flat water" : result.water_conditions === "choppy" ? "🌊 Choppy" : "⛵ Rough"}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Per-500m splits with comparison */}
                  {splits.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">500m Splits{prev && " (vs. last session)"}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {splits.map((sp: any, i: number) => {
                          const prevSp = prevSplits[i];
                          const faster = prevSp && sp.split_seconds < prevSp.split_seconds;
                          const slower = prevSp && sp.split_seconds > prevSp.split_seconds;
                          const diff = prevSp ? (sp.split_seconds - prevSp.split_seconds) : null;
                          return (
                            <div
                              key={i}
                              className={`p-2 rounded-lg text-xs text-center ${faster ? "bg-green-100 dark:bg-green-900/30" : slower ? "bg-red-100 dark:bg-red-900/30" : "bg-muted/50"}`}
                            >
                              <p className="text-muted-foreground mb-0.5">{(i + 1) * 500}m</p>
                              <p className="font-mono font-medium">{formatSplitSec(sp.split_seconds)}</p>
                              {diff !== null && (
                                <p className={`text-[10px] mt-0.5 ${faster ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                                  {diff < 0 ? "▲" : "▼"} {Math.abs(diff).toFixed(1)}s
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Lineup comparison summary */}
                  {delta !== null && prev && (
                    <div className={`text-xs p-2 rounded-lg ${delta < 0 ? "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300" : "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300"}`}>
                      This lineup is <strong>{Math.abs(delta).toFixed(1)}s/500m {delta < 0 ? "faster" : "slower"}</strong> than last time ({new Date(prev.result_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}).
                    </div>
                  )}

                  {/* Athlete list */}
                  {Array.isArray(result.athlete_ids) && result.athlete_ids.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Athletes</p>
                      <div className="flex flex-wrap gap-1">
                        {result.athlete_ids.map((uid: string) => {
                          const a = allAthletes.find((x: any) => x.id === uid);
                          return a ? (
                            <Badge key={uid} variant="secondary" className="text-xs">{displayName(a)}</Badge>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}

                  {result.notes && <p className="text-xs text-muted-foreground italic">{result.notes}</p>}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default WorkoutHistory;
