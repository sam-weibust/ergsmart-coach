import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getSessionUser } from "@/lib/getUser";
import { getLocalDate } from "@/lib/dateUtils";
import { TimeInput } from "@/components/ui/TimeInput";
import { Plus, Trash2, Bike, PersonStanding, Waves, BarChart3, Loader2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { format, parseISO } from "date-fns";

// ── Types & constants ────────────────────────────────────────────────────────

type ActivityType = "Run" | "Bike" | "Swim";

const ACTIVITY_COLORS: Record<ActivityType, string> = {
  Run: "#10b981",
  Bike: "#f59e0b",
  Swim: "#3b82f6",
};

const ACTIVITY_ICONS: Record<ActivityType, React.ElementType> = {
  Run: PersonStanding,
  Bike: Bike,
  Swim: Waves,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function secToMmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function mmssToSec(mmss: string): number {
  if (!mmss) return 0;
  const [m, s] = mmss.split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
}

function ActivityIcon({ type, className }: { type: ActivityType; className?: string }) {
  const Icon = ACTIVITY_ICONS[type];
  return <Icon className={className} style={{ color: ACTIVITY_COLORS[type] }} />;
}

// ── Log Entry Form ────────────────────────────────────────────────────────────

interface LogFormState {
  activity_type: ActivityType;
  date: string;
  distance: string;
  distance_unit: "mi" | "km";
  duration: string;
  heart_rate: string;
  notes: string;
}

const defaultForm = (): LogFormState => ({
  activity_type: "Run",
  date: getLocalDate(),
  distance: "",
  distance_unit: "mi",
  duration: "",
  heart_rate: "",
  notes: "",
});

// ── Main Component ────────────────────────────────────────────────────────────

export default function CrossTrainingSection({ profile }: { profile: any }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<LogFormState>(defaultForm());

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["cross-training"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return [];
      const { data } = await (supabase as any)
        .from("cross_training")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(60);
      return data ?? [];
    },
  });

  // ── Mutations ────────────────────────────────────────────────────────────

  const addEntry = useMutation({
    mutationFn: async () => {
      const user = await getSessionUser();
      if (!user) throw new Error("Not signed in");
      const payload: any = {
        user_id: user.id,
        date: form.date,
        activity_type: form.activity_type,
        distance_unit: form.distance_unit,
      };
      if (form.distance) payload.distance = parseFloat(form.distance);
      if (form.duration) payload.duration_seconds = mmssToSec(form.duration);
      if (form.heart_rate) payload.heart_rate_average = parseInt(form.heart_rate);
      if (form.notes) payload.notes = form.notes;

      const { error } = await (supabase as any).from("cross_training").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cross-training"] });
      setForm(defaultForm());
      setShowForm(false);
      toast({ title: "Activity logged!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("cross_training").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cross-training"] }),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Chart data: last 8 weeks volume by activity ──────────────────────────

  const chartData = useMemo(() => {
    const weeks: Record<string, Record<string, number>> = {};
    for (const e of entries) {
      if (!e.distance) continue;
      const d = parseISO(e.date);
      const weekKey = format(d, "MM/dd");
      if (!weeks[weekKey]) weeks[weekKey] = { Run: 0, Bike: 0, Swim: 0 };
      weeks[weekKey][e.activity_type] = (weeks[weekKey][e.activity_type] || 0) + Number(e.distance);
    }
    return Object.entries(weeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([label, v]) => ({
        label,
        Run: Math.round(v.Run * 10) / 10,
        Bike: Math.round(v.Bike * 10) / 10,
        Swim: Math.round(v.Swim * 10) / 10,
      }));
  }, [entries]);

  // ── Totals ───────────────────────────────────────────────────────────────

  const totals = useMemo(() => {
    const t: Record<string, { distance: number; count: number; seconds: number }> = {
      Run: { distance: 0, count: 0, seconds: 0 },
      Bike: { distance: 0, count: 0, seconds: 0 },
      Swim: { distance: 0, count: 0, seconds: 0 },
    };
    for (const e of entries) {
      t[e.activity_type].count++;
      t[e.activity_type].distance += Number(e.distance || 0);
      t[e.activity_type].seconds += Number(e.duration_seconds || 0);
    }
    return t;
  }, [entries]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Cross Training</h2>
          <p className="text-sm text-muted-foreground">Log runs, rides, and swims</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-1" />Log Activity
        </Button>
      </div>

      {/* Log form */}
      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Activity</Label>
                <Select value={form.activity_type} onValueChange={v => setForm(f => ({ ...f, activity_type: v as ActivityType }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["Run", "Bike", "Swim"] as ActivityType[]).map(t => (
                      <SelectItem key={t} value={t}>
                        <span className="flex items-center gap-2">
                          <ActivityIcon type={t} className="h-3.5 w-3.5" />
                          {t}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Date</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Distance</Label>
                <div className="flex gap-1 mt-1">
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="5.0"
                    value={form.distance}
                    onChange={e => setForm(f => ({ ...f, distance: e.target.value }))}
                  />
                  <Select value={form.distance_unit} onValueChange={v => setForm(f => ({ ...f, distance_unit: v as "mi" | "km" }))}>
                    <SelectTrigger className="w-16"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mi">mi</SelectItem>
                      <SelectItem value="km">km</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Duration (mm:ss)</Label>
                <TimeInput
                  className="mt-1"
                  value={form.duration}
                  onChange={v => setForm(f => ({ ...f, duration: v }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Avg Heart Rate (bpm, optional)</Label>
                <Input
                  type="number"
                  className="mt-1"
                  placeholder="145"
                  value={form.heart_rate}
                  onChange={e => setForm(f => ({ ...f, heart_rate: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                className="mt-1 text-sm"
                rows={2}
                placeholder="Easy run, felt good..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>

            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => addEntry.mutate()}
                disabled={addEntry.isPending}
              >
                {addEntry.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save
              </Button>
              <Button variant="ghost" onClick={() => { setShowForm(false); setForm(defaultForm()); }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {(["Run", "Bike", "Swim"] as ActivityType[]).map(type => (
          <Card key={type}>
            <CardContent className="p-3 text-center">
              <ActivityIcon type={type} className="h-5 w-5 mx-auto mb-1" />
              <div className="font-bold text-sm">{totals[type].count}</div>
              <div className="text-xs text-muted-foreground">{type}s</div>
              {totals[type].distance > 0 && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {totals[type].distance.toFixed(1)} {entries.find((e: any) => e.activity_type === type)?.distance_unit || "mi"}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Volume chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />Volume by Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip formatter={(v: number, name: string) => [`${v} mi`, name]} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                {(["Run", "Bike", "Swim"] as ActivityType[]).map(type => (
                  <Bar key={type} dataKey={type} fill={ACTIVITY_COLORS[type]} radius={[3, 3, 0, 0]} stackId="vol" />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Activity list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Activity Log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && entries.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No activities logged yet. Tap "Log Activity" to get started.
            </p>
          )}
          {entries.map((e: any) => (
            <div key={e.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors">
              <ActivityIcon type={e.activity_type} className="h-5 w-5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{e.activity_type}</span>
                  <Badge
                    variant="outline"
                    className="text-[10px] h-4 px-1"
                    style={{ color: ACTIVITY_COLORS[e.activity_type as ActivityType], borderColor: ACTIVITY_COLORS[e.activity_type as ActivityType] + "44" }}
                  >
                    {e.distance ? `${Number(e.distance).toFixed(1)} ${e.distance_unit}` : "—"}
                  </Badge>
                  {e.duration_seconds ? (
                    <span className="text-xs text-muted-foreground">{secToMmss(e.duration_seconds)}</span>
                  ) : null}
                  {e.heart_rate_average ? (
                    <span className="text-xs text-muted-foreground">{e.heart_rate_average} bpm</span>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {format(parseISO(e.date), "MMM d, yyyy")}
                  {e.notes && ` · ${e.notes}`}
                </div>
              </div>
              <button
                onClick={() => deleteEntry.mutate(e.id)}
                className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
