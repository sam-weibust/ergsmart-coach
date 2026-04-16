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
import { Plus, Activity, Loader2, Wand2, AlertTriangle } from "lucide-react";
import { getFatigueColor } from "./constants";
import { cn } from "@/lib/utils";

interface Props {
  teamId: string;
  teamName: string;
  teamMembers: any[];
  isCoach: boolean;
  profile: any;
}

function getMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

const LAST_8_WEEKS = Array.from({ length: 8 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - i * 7);
  return getMonday(d);
}).reverse();

const LoadManagement = ({ teamId, teamMembers, isCoach, profile }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any | null>(null);
  const [form, setForm] = useState({
    user_id: "",
    week_start: getMonday(new Date()),
    total_meters: "",
    on_water_meters: "",
    erg_meters: "",
    fatigue_score: "3",
    soreness_score: "3",
    notes: "",
  });

  const allAthletes = teamMembers.map((m: any) => m.profile || m).filter(Boolean);

  const { data: loadLogs = [], isLoading } = useQuery({
    queryKey: ["weekly-load", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_load_logs")
        .select("*")
        .eq("team_id", teamId)
        .order("week_start", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  // Build heatmap: athletes x weeks
  const heatmap: Record<string, Record<string, any>> = {};
  for (const log of loadLogs) {
    if (!heatmap[log.user_id]) heatmap[log.user_id] = {};
    heatmap[log.user_id][log.week_start] = log;
  }

  const addLog = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("weekly_load_logs").upsert({
        team_id: teamId,
        user_id: form.user_id,
        week_start: form.week_start,
        total_meters: parseInt(form.total_meters) || 0,
        on_water_meters: parseInt(form.on_water_meters) || 0,
        erg_meters: parseInt(form.erg_meters) || 0,
        fatigue_score: parseInt(form.fatigue_score),
        soreness_score: parseInt(form.soreness_score),
        notes: form.notes || null,
      }, { onConflict: "team_id,user_id,week_start" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Load logged!" });
      queryClient.invalidateQueries({ queryKey: ["weekly-load", teamId] });
      setAddOpen(false);
      setForm({ user_id: "", week_start: getMonday(new Date()), total_meters: "", on_water_meters: "", erg_meters: "", fatigue_score: "3", soreness_score: "3", notes: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  async function runAIAnalysis() {
    setAiLoading(true);
    setAiResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-load-management", {
        body: { team_id: teamId, weeks_until_race: null, season_phase: "general preparation" },
      });
      if (error) throw new Error(error.message);
      setAiResult(data);
    } catch (e: any) {
      toast({ title: "AI Error", description: e.message, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  }

  if (isLoading) return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin h-6 w-6" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Load Management</h2>
          <p className="text-sm text-muted-foreground">Weekly training load and fatigue monitoring</p>
        </div>
        <div className="flex gap-2">
          {isCoach && (
            <Button size="sm" variant="outline" className="gap-2" onClick={runAIAnalysis} disabled={aiLoading}>
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              AI Analysis
            </Button>
          )}
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Log Week</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Log Weekly Load</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label>Athlete</Label>
                  <Select value={form.user_id} onValueChange={v => setForm(f => ({ ...f, user_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select athlete" /></SelectTrigger>
                    <SelectContent>
                      {allAthletes.map(a => <SelectItem key={a.id} value={a.id}>{a.full_name || a.username}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Week Starting</Label>
                  <Input type="date" value={form.week_start} onChange={e => setForm(f => ({ ...f, week_start: e.target.value }))} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Total Meters</Label>
                    <Input type="number" placeholder="60000" value={form.total_meters} onChange={e => setForm(f => ({ ...f, total_meters: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">On Water (m)</Label>
                    <Input type="number" placeholder="30000" value={form.on_water_meters} onChange={e => setForm(f => ({ ...f, on_water_meters: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Erg (m)</Label>
                    <Input type="number" placeholder="30000" value={form.erg_meters} onChange={e => setForm(f => ({ ...f, erg_meters: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Fatigue (1-10)</Label>
                    <Select value={form.fatigue_score} onValueChange={v => setForm(f => ({ ...f, fatigue_score: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Array.from({ length: 10 }, (_, i) => i + 1).map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Soreness (1-10)</Label>
                    <Select value={form.soreness_score} onValueChange={v => setForm(f => ({ ...f, soreness_score: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Array.from({ length: 10 }, (_, i) => i + 1).map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any notes..." />
                </div>
                <Button className="w-full" onClick={() => addLog.mutate()} disabled={addLog.isPending || !form.user_id}>
                  {addLog.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Log"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* AI Result */}
      {aiResult && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Wand2 className="h-4 w-4" />AI Load Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Suggested Phase:</span>
              <Badge>{aiResult.suggested_phase}</Badge>
              <span className="text-sm text-muted-foreground ml-2">Team Readiness:</span>
              <Badge variant="secondary">{aiResult.team_readiness_score}/100</Badge>
            </div>
            {aiResult.recommendations && (
              <p className="text-sm text-muted-foreground">{aiResult.recommendations}</p>
            )}
            {aiResult.alerts?.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-destructive" />Alerts</p>
                {aiResult.alerts.map((a: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <Badge variant="destructive" className="shrink-0">{a.type}</Badge>
                    <span>{a.name}: {a.message}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Fatigue heatmap */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" />Fatigue Heatmap</CardTitle>
          <CardDescription>Last 8 weeks. Colors: green=low, yellow=moderate, red=high fatigue</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1.5 pr-3 font-medium text-muted-foreground">Athlete</th>
                  {LAST_8_WEEKS.map(w => (
                    <th key={w} className="text-center py-1.5 px-1 font-medium text-muted-foreground min-w-[50px]">
                      {w.slice(5)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allAthletes.map(athlete => (
                  <tr key={athlete.id} className="border-b">
                    <td className="py-1.5 pr-3 font-medium whitespace-nowrap">{athlete.full_name || athlete.username || "—"}</td>
                    {LAST_8_WEEKS.map(week => {
                      const log = heatmap[athlete.id]?.[week];
                      const fatigue = log?.fatigue_score ?? null;
                      return (
                        <td key={week} className="text-center py-1.5 px-1">
                          <div
                            className={cn("rounded mx-auto w-8 h-7 flex items-center justify-center text-white font-bold text-xs", getFatigueColor(fatigue))}
                            title={fatigue ? `Fatigue: ${fatigue}, ${(log?.total_meters / 1000).toFixed(0)}km` : "No data"}
                          >
                            {fatigue ?? "—"}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {allAthletes.length === 0 && (
                  <tr><td colSpan={9} className="py-4 text-center text-muted-foreground">No athletes found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Recent volume table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Weekly Volumes</CardTitle>
        </CardHeader>
        <CardContent>
          {loadLogs.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No load logs yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-3 font-medium">Athlete</th>
                    <th className="text-left py-2 px-2 font-medium">Week</th>
                    <th className="text-right py-2 px-2 font-medium">Total (km)</th>
                    <th className="text-right py-2 px-2 font-medium">Erg (km)</th>
                    <th className="text-right py-2 px-2 font-medium">Water (km)</th>
                    <th className="text-center py-2 px-2 font-medium">Fatigue</th>
                  </tr>
                </thead>
                <tbody>
                  {loadLogs.slice(0, 20).map((log: any) => {
                    const athlete = allAthletes.find(a => a.id === log.user_id);
                    return (
                      <tr key={log.id} className="border-b hover:bg-muted/50">
                        <td className="py-2 pr-3">{athlete?.full_name || athlete?.username || "—"}</td>
                        <td className="py-2 px-2">{log.week_start}</td>
                        <td className="py-2 px-2 text-right">{log.total_meters ? (log.total_meters / 1000).toFixed(0) : 0}</td>
                        <td className="py-2 px-2 text-right">{log.erg_meters ? (log.erg_meters / 1000).toFixed(0) : 0}</td>
                        <td className="py-2 px-2 text-right">{log.on_water_meters ? (log.on_water_meters / 1000).toFixed(0) : 0}</td>
                        <td className="py-2 px-2 text-center">
                          <span className={cn("inline-flex items-center justify-center rounded w-7 h-6 text-xs font-bold text-white", getFatigueColor(log.fatigue_score))}>
                            {log.fatigue_score ?? "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LoadManagement;
