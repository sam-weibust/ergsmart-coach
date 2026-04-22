import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, HeartPulse, Plus, Trash2 } from "lucide-react";
import { format, subDays, startOfWeek, addDays } from "date-fns";
import { getSessionUser } from '@/lib/getUser';

interface RecoverySectionProps {
  profile: any;
}

const BODY_REGIONS = [
  "Lower Back", "Hands/Blisters", "Knees", "Ribs", "Neck",
  "Shoulders", "Hips", "Wrists", "Ankles", "Other",
];

const SEVERITY_COLORS: Record<number, string> = {
  1: "bg-green-200 dark:bg-green-900",
  2: "bg-yellow-200 dark:bg-yellow-800",
  3: "bg-orange-200 dark:bg-orange-800",
  4: "bg-red-300 dark:bg-red-800",
  5: "bg-red-500 dark:bg-red-700",
};

const RecoverySection = ({ profile }: RecoverySectionProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    log_date: format(new Date(), "yyyy-MM-dd"),
    body_region: "",
    severity: "3",
    notes: "",
  });

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["recovery-logs"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return [];
      const { data } = await supabase
        .from("recovery_logs")
        .select("*")
        .eq("user_id", user.id)
        .order("log_date", { ascending: false })
        .limit(50);
      return (data as any[]) || [];
    },
    enabled: !!profile,
  });

  const handleSubmit = async () => {
    if (!profile || !form.body_region) {
      toast({ title: "Error", description: "Select a body region.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("recovery_logs").insert({
        user_id: profile.id,
        log_date: form.log_date,
        body_region: form.body_region,
        severity: parseInt(form.severity),
        notes: form.notes || null,
      } as any);
      if (error) throw error;
      toast({ title: "Logged!", description: "Recovery entry saved." });
      setForm({ log_date: format(new Date(), "yyyy-MM-dd"), body_region: "", severity: "3", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["recovery-logs"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("recovery_logs").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["recovery-logs"] });
  };

  // Weekly heatmap: last 4 weeks
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const heatmapWeeks = Array.from({ length: 4 }, (_, wi) => {
    const ws = subDays(weekStart, (3 - wi) * 7);
    return Array.from({ length: 7 }, (_, di) => {
      const day = addDays(ws, di);
      const dayStr = format(day, "yyyy-MM-dd");
      const dayLogs = logs.filter((l: any) => l.log_date === dayStr);
      const maxSeverity = dayLogs.length ? Math.max(...dayLogs.map((l: any) => l.severity)) : 0;
      return { date: day, dayStr, maxSeverity, count: dayLogs.length };
    });
  });

  return (
    <div className="space-y-6">
      {/* Log Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-red-500" />
            Log Injury / Recovery
          </CardTitle>
          <CardDescription>Track pain and recovery to help your AI coach adjust training</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={form.log_date} onChange={e => setForm(p => ({ ...p, log_date: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Body Region</Label>
              <Select value={form.body_region} onValueChange={v => setForm(p => ({ ...p, body_region: v }))}>
                <SelectTrigger><SelectValue placeholder="Select region" /></SelectTrigger>
                <SelectContent>
                  {BODY_REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Severity (1-5)</Label>
              <Select value={form.severity} onValueChange={v => setForm(p => ({ ...p, severity: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1,2,3,4,5].map(s => <SelectItem key={s} value={s.toString()}>{s} — {["Minor","Mild","Moderate","Severe","Critical"][s-1]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input placeholder="Optional notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <Button onClick={handleSubmit} disabled={saving} className="w-full sm:w-auto">
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><Plus className="mr-2 h-4 w-4" /> Log Entry</>}
          </Button>
        </CardContent>
      </Card>

      {/* Weekly Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recovery Heatmap — Last 4 Weeks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">
              {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => <span key={d}>{d}</span>)}
            </div>
            {heatmapWeeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1">
                {week.map(day => (
                  <div
                    key={day.dayStr}
                    className={`h-8 rounded flex items-center justify-center text-xs font-medium ${
                      day.maxSeverity > 0
                        ? `${SEVERITY_COLORS[day.maxSeverity]} text-foreground`
                        : "bg-muted/30 text-muted-foreground"
                    } ${day.dayStr === format(new Date(), "yyyy-MM-dd") ? "ring-2 ring-primary" : ""}`}
                    title={`${format(day.date, "MMM d")}: ${day.count ? `${day.count} log(s), severity ${day.maxSeverity}` : "No logs"}`}
                  >
                    {format(day.date, "d")}
                  </div>
                ))}
              </div>
            ))}
            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
              <span>Severity:</span>
              {[1,2,3,4,5].map(s => (
                <div key={s} className={`w-5 h-5 rounded ${SEVERITY_COLORS[s]} flex items-center justify-center text-foreground`}>{s}</div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No recovery logs yet.</p>
          ) : (
            <div className="space-y-2">
              {logs.slice(0, 15).map((log: any) => (
                <div key={log.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${SEVERITY_COLORS[log.severity]} text-foreground`}>
                      {log.severity}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{log.body_region}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(log.log_date), "MMM d, yyyy")}</p>
                    </div>
                    {log.notes && <p className="text-xs text-muted-foreground ml-2 hidden sm:block">— {log.notes}</p>}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(log.id)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RecoverySection;
