import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Plus, Waves, Loader2, Lock } from "lucide-react";
import { BOAT_CLASSES, formatSplit, displayName } from "./constants";

interface Props {
  teamId: string;
  teamName: string;
  teamMembers: any[];
  isCoach: boolean;
  profile: any;
  seasonId?: string | null;
  boats?: any[];
}

function parseTimeStr(t: string): number | null {
  const m = t.match(/^(\d+):(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseFloat(m[2]);
}

function calcAvgSplit(timeSeconds: number, distanceMeters: number): number {
  return (timeSeconds / distanceMeters) * 500;
}

function formatTimeDisplay(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const PIECE_TYPES = ["2k", "4k", "6k", "500m", "1500m", "steady state", "technical"] as const;

const OnWaterResults = ({ teamId, isCoach, profile, teamMembers, seasonId, boats = [] }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    result_date: new Date().toISOString().split("T")[0],
    piece_type: "2k",
    distance_meters: "2000",
    boat_class: "8+",
    boat_id: "",
    time: "",
    conditions: "",
    notes: "",
    wind_conditions: "",
    water_conditions: "",
    stroke_rate: "",
    splits: "",
  });
  const [manualAthletes, setManualAthletes] = useState<string[]>([]);
  const activeBoats = boats.filter((b: any) => b.is_active);

  // Check if current user is a coxswain
  const { data: userProfile } = useQuery({
    queryKey: ["profile-cox-check", profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("is_coxswain, full_name")
        .eq("id", profile.id)
        .maybeSingle();
      return data;
    },
    enabled: !!profile?.id,
  });

  const isCoxswain = !!userProfile?.is_coxswain;
  const canLog = isCoach || isCoxswain;

  // If coxswain is logging, look up today's published lineup for the selected boat
  const { data: publishedLineup } = useQuery({
    queryKey: ["published-lineup-for-date", teamId, form.result_date, form.boat_id || form.boat_class],
    queryFn: async () => {
      let q = supabase
        .from("boat_lineups")
        .select("id, name, seats, practice_date")
        .eq("team_id", teamId)
        .eq("practice_date", form.result_date)
        .not("published_at", "is", null);
      if (form.boat_id) q = q.eq("boat_id", form.boat_id);
      else q = q.eq("boat_class", form.boat_class);
      const { data } = await q.maybeSingle();
      return data;
    },
    enabled: !!form.result_date && (!!form.boat_id || !!form.boat_class) && isCoxswain,
  });

  const allAthletes = teamMembers.map((m: any) => m.profile || m).filter((a: any) => a?.id);

  // Athletes from published lineup for coxswain auto-populate
  const lineupAthletes = publishedLineup
    ? (Array.isArray(publishedLineup.seats) ? publishedLineup.seats : [])
        .filter((s: any) => s.user_id && s.seat_number !== 0)
        .map((s: any) => s.user_id)
    : [];

  const { data: results = [], isLoading } = useQuery({
    queryKey: ["onwater-results", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onwater_results")
        .select("*")
        .eq("team_id", teamId)
        .order("result_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: ergScores = [] } = useQuery({
    queryKey: ["erg-scores-overview", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("erg_scores")
        .select("user_id, watts, test_type, avg_split_seconds")
        .eq("team_id", teamId)
        .eq("test_type", "2k");
      return data || [];
    },
  });

  const scatterData = results
    .filter(r => r.piece_type === "2k" && r.avg_split_seconds)
    .map(r => {
      const ergAvg = ergScores.reduce((acc: number, s: any) => acc + (Number(s.avg_split_seconds) || 0), 0) / Math.max(ergScores.length, 1);
      return {
        water_split: r.avg_split_seconds ? parseFloat(String(r.avg_split_seconds)) : null,
        erg_split: ergAvg || null,
        label: r.result_date,
      };
    }).filter(d => d.water_split);

  // Parse splits string "1:45.2, 1:47.0, 1:43.5" into [{split_seconds: 105.2}, ...]
  function parseSplits(splitsStr: string): any[] {
    if (!splitsStr.trim()) return [];
    return splitsStr.split(",").map((s, i) => {
      const t = s.trim();
      const m = t.match(/^(\d+):(\d+(?:\.\d+)?)$/);
      if (!m) return null;
      const secs = parseInt(m[1]) * 60 + parseFloat(m[2]);
      return { interval: (i + 1) * 500, split_seconds: secs };
    }).filter(Boolean);
  }

  const addResult = useMutation({
    mutationFn: async () => {
      const time_seconds = parseTimeStr(form.time);
      const distance = parseInt(form.distance_meters) || null;
      const avg_split = time_seconds && distance ? calcAvgSplit(time_seconds, distance) : null;
      const splitsArr = parseSplits(form.splits);
      const boat = activeBoats.find((b: any) => b.id === form.boat_id);
      const resolvedBoatClass = boat ? boat.boat_class : form.boat_class;

      // Determine athlete_ids: from published lineup or manual selection
      const athleteIds = lineupAthletes.length > 0 ? lineupAthletes : manualAthletes;

      const { error } = await supabase.from("onwater_results").insert({
        team_id: teamId,
        result_date: form.result_date,
        piece_type: form.piece_type,
        distance_meters: distance,
        boat_class: resolvedBoatClass,
        boat_id: form.boat_id || null,
        season_id: seasonId || null,
        time_seconds,
        avg_split_seconds: avg_split,
        conditions: form.conditions || null,
        notes: form.notes || null,
        wind_conditions: form.wind_conditions || null,
        water_conditions: form.water_conditions || null,
        stroke_rate: form.stroke_rate ? parseFloat(form.stroke_rate) : null,
        splits: splitsArr.length > 0 ? splitsArr : null,
        created_by: profile.id,
        logged_by: profile.id,
        lineup_id: publishedLineup?.id || null,
        athlete_ids: athleteIds.length > 0 ? athleteIds : null,
      } as any);
      if (error) throw error;

      // If coxswain logged, notify athletes in the boat
      if (isCoxswain && athleteIds.length > 0) {
        const coxName = userProfile?.full_name || profile?.full_name || "Your coxswain";
        const notifs = athleteIds.map((uid: string) => ({
          user_id: uid,
          type: "plan_shared",
          title: "Practice results logged",
          body: `${coxName} logged your practice results — tap to view your splits.`,
        }));
        await supabase.from("notifications").insert(notifs as any);
      }
    },
    onSuccess: () => {
      toast({ title: "Result logged!" });
      queryClient.invalidateQueries({ queryKey: ["onwater-results", teamId] });
      setAddOpen(false);
      setManualAthletes([]);
      setForm({ result_date: new Date().toISOString().split("T")[0], piece_type: "2k", distance_meters: "2000", boat_class: "8+", boat_id: "", time: "", conditions: "", notes: "", wind_conditions: "", water_conditions: "", stroke_rate: "", splits: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin h-6 w-6" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">On-Water Results</h2>
          <p className="text-sm text-muted-foreground">Log timed pieces and track performance trends</p>
        </div>
        {canLog ? (
          <Button size="sm" className="gap-2" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />{isCoxswain && !isCoach ? "Log as Coxswain" : "Log Result"}
          </Button>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" />
            <span className="hidden sm:inline">On-water workouts are logged by your coxswain or coach</span>
          </div>
        )}
      </div>

      {/* Restricted message for regular athletes */}
      {!canLog && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center space-y-2">
            <Lock className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">On-water workouts are logged by your coxswain or coach</p>
            <p className="text-xs text-muted-foreground">When your coxswain logs a session you'll receive a notification with your results.</p>
          </CardContent>
        </Card>
      )}

      {/* Results table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Waves className="h-4 w-4" />All Results</CardTitle>
        </CardHeader>
        <CardContent>
          {results.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">No results logged yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-3 font-medium">Date</th>
                    <th className="text-left py-2 px-2 font-medium">Type</th>
                    <th className="text-left py-2 px-2 font-medium">Boat</th>
                    <th className="text-right py-2 px-2 font-medium">Dist</th>
                    <th className="text-right py-2 px-2 font-medium">Time</th>
                    <th className="text-right py-2 px-2 font-medium">Avg Split</th>
                    <th className="text-left py-2 pl-2 font-medium">Conditions</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r: any) => (
                    <tr key={r.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 pr-3">{r.result_date}</td>
                      <td className="py-2 px-2"><Badge variant="outline">{r.piece_type}</Badge></td>
                      <td className="py-2 px-2">{r.boat_class || "—"}</td>
                      <td className="py-2 px-2 text-right">{r.distance_meters ? `${r.distance_meters}m` : "—"}</td>
                      <td className="py-2 px-2 text-right font-mono">{formatTimeDisplay(r.time_seconds)}</td>
                      <td className="py-2 px-2 text-right font-mono">{r.avg_split_seconds ? formatSplit(parseFloat(String(r.avg_split_seconds))) : "—"}</td>
                      <td className="py-2 pl-2 text-xs text-muted-foreground">{r.conditions || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scatter chart */}
      {scatterData.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Erg vs On-Water 2K Split Comparison</CardTitle>
            <CardDescription>Team average erg split vs water split per piece</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="erg_split" name="Erg Split (s)" tick={{ fontSize: 11 }} label={{ value: "Erg Split", position: "insideBottom", offset: -5 }} />
                <YAxis dataKey="water_split" name="Water Split (s)" tick={{ fontSize: 11 }} label={{ value: "Water Split", angle: -90, position: "insideLeft" }} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                <Legend />
                <Scatter name="2K Pieces" data={scatterData} fill="hsl(var(--primary))" />
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Log Result Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log On-Water Result</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            {activeBoats.length > 0 && (
              <div className="space-y-1">
                <Label>Named Boat</Label>
                <Select value={form.boat_id || "custom"} onValueChange={v => {
                  const boat = activeBoats.find((b: any) => b.id === v);
                  setForm(f => ({ ...f, boat_id: v === "custom" ? "" : v, boat_class: boat ? boat.boat_class : f.boat_class }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Select boat" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">No named boat</SelectItem>
                    {activeBoats.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name} ({b.boat_class})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" value={form.result_date} onChange={e => setForm(f => ({ ...f, result_date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Boat Class</Label>
                <Select value={form.boat_class} onValueChange={v => setForm(f => ({ ...f, boat_class: v }))} disabled={!!form.boat_id}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{BOAT_CLASSES.map(bc => <SelectItem key={bc} value={bc}>{bc}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Piece Type</Label>
                <Select value={form.piece_type} onValueChange={v => setForm(f => ({ ...f, piece_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PIECE_TYPES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Distance (m)</Label>
                <Input type="number" value={form.distance_meters} onChange={e => setForm(f => ({ ...f, distance_meters: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Total Time (m:ss)</Label>
                <Input placeholder="e.g. 6:42" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Stroke Rate</Label>
                <Input type="number" placeholder="e.g. 28" value={form.stroke_rate} onChange={e => setForm(f => ({ ...f, stroke_rate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>500m Splits (comma-separated)</Label>
              <Input placeholder="1:45.2, 1:47.0, 1:43.5, 1:46.8" value={form.splits} onChange={e => setForm(f => ({ ...f, splits: e.target.value }))} />
              <p className="text-xs text-muted-foreground">Enter each 500m split in M:SS.s format, separated by commas</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Wind</Label>
                <Select value={form.wind_conditions || "none"} onValueChange={v => setForm(f => ({ ...f, wind_conditions: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Not logged" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not logged</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="heavy">Heavy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Water</Label>
                <Select value={form.water_conditions || "none"} onValueChange={v => setForm(f => ({ ...f, water_conditions: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Not logged" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not logged</SelectItem>
                    <SelectItem value="flat">Flat</SelectItem>
                    <SelectItem value="choppy">Choppy</SelectItem>
                    <SelectItem value="rough">Rough</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any notes..." />
            </div>

            {/* Coxswain: show athlete lineup info */}
            {isCoxswain && (
              <div className="space-y-1 p-3 bg-muted/50 rounded-lg">
                {publishedLineup ? (
                  <div>
                    <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">
                      Lineup found: {publishedLineup.name} ({lineupAthletes.length} athletes auto-populated)
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {lineupAthletes.map((uid: string) => {
                        const a = allAthletes.find((x: any) => x.id === uid);
                        return a ? <Badge key={uid} variant="secondary" className="text-xs">{displayName(a)}</Badge> : null;
                      })}
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">No published lineup found for this date/boat. Select athletes manually:</p>
                    <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                      {allAthletes.map((a: any) => {
                        const selected = manualAthletes.includes(a.id);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => setManualAthletes(prev =>
                              selected ? prev.filter(id => id !== a.id) : [...prev, a.id]
                            )}
                            className={`text-xs px-2 py-0.5 rounded border transition-colors ${selected ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground/30 hover:border-primary"}`}
                          >
                            {displayName(a)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <Button className="w-full" onClick={() => addResult.mutate()} disabled={addResult.isPending || !form.time}>
              {addResult.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Result"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OnWaterResults;
