import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Plus, Waves, Loader2 } from "lucide-react";
import { BOAT_CLASSES, formatSplit } from "./constants";

interface Props {
  teamId: string;
  teamName: string;
  teamMembers: any[];
  isCoach: boolean;
  profile: any;
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

const OnWaterResults = ({ teamId, isCoach, profile }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    result_date: new Date().toISOString().split("T")[0],
    piece_type: "2k",
    distance_meters: "2000",
    boat_class: "8+",
    time: "",
    conditions: "",
    notes: "",
  });

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

  // Scatter: erg split vs water split for 2k pieces
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

  const addResult = useMutation({
    mutationFn: async () => {
      const time_seconds = parseTimeStr(form.time);
      const distance = parseInt(form.distance_meters) || null;
      const avg_split = time_seconds && distance ? calcAvgSplit(time_seconds, distance) : null;
      const { error } = await supabase.from("onwater_results").insert({
        team_id: teamId,
        result_date: form.result_date,
        piece_type: form.piece_type,
        distance_meters: distance,
        boat_class: form.boat_class,
        time_seconds,
        avg_split_seconds: avg_split,
        conditions: form.conditions || null,
        notes: form.notes || null,
        created_by: profile.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Result logged!" });
      queryClient.invalidateQueries({ queryKey: ["onwater-results", teamId] });
      setAddOpen(false);
      setForm({ result_date: new Date().toISOString().split("T")[0], piece_type: "2k", distance_meters: "2000", boat_class: "8+", time: "", conditions: "", notes: "" });
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
        {isCoach && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Log Result</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Log On-Water Result</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Date</Label>
                    <Input type="date" value={form.result_date} onChange={e => setForm(f => ({ ...f, result_date: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Boat Class</Label>
                    <Select value={form.boat_class} onValueChange={v => setForm(f => ({ ...f, boat_class: v }))}>
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
                <div className="space-y-1">
                  <Label>Time (m:ss)</Label>
                  <Input placeholder="e.g. 6:42" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Conditions</Label>
                  <Input placeholder="e.g. calm, tailwind, choppy" value={form.conditions} onChange={e => setForm(f => ({ ...f, conditions: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any notes..." />
                </div>
                <Button className="w-full" onClick={() => addResult.mutate()} disabled={addResult.isPending || !form.time}>
                  {addResult.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Result"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

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
    </div>
  );
};

export default OnWaterResults;
