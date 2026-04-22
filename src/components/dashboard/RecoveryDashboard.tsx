import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Scale, Droplets, Moon, Sparkles, RefreshCw, Check, TrendingUp,
  TrendingDown, Minus, Loader2, Flame, Target, ChevronRight, AlertCircle
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend, ScatterChart, Scatter
} from "recharts";
import { format, subDays, parseISO, differenceInDays } from "date-fns";

interface RecoveryDashboardProps {
  profile: any;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function movingAvg(data: { value: number }[], window: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < window - 1) return null;
    const slice = data.slice(i - window + 1, i + 1);
    return slice.reduce((s, d) => s + d.value, 0) / window;
  });
}

function today() { return new Date().toISOString().split("T")[0]; }
function nDaysAgo(n: number) { return subDays(new Date(), n).toISOString().split("T")[0]; }

const CHART_COLORS = {
  primary: "#2d6be4",
  green: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
  purple: "#8b5cf6",
  cyan: "#06b6d4",
};

// ── Recovery Score Card ───────────────────────────────────────────────────────

function RecoveryScoreCard({
  score, components, loading,
}: {
  score: number | null;
  components: { sleep: number; hydration: number; calories: number; weight: number };
  loading: boolean;
}) {
  if (loading) return (
    <Card className="border-0 bg-gradient-to-br from-[#0a1628] to-[#112240]">
      <CardContent className="p-6 flex items-center justify-center min-h-[140px]">
        <Loader2 className="h-6 w-6 text-white/40 animate-spin" />
      </CardContent>
    </Card>
  );

  const s = score ?? 0;
  const color = s >= 75 ? "#10b981" : s >= 50 ? "#f59e0b" : "#ef4444";
  const label = s >= 75 ? "Good" : s >= 50 ? "Moderate" : "Low";

  return (
    <Card className="border-0 bg-gradient-to-br from-[#0a1628] to-[#112240]">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-white/50 text-xs font-medium uppercase tracking-wide">Recovery Score</p>
            <div className="flex items-end gap-2 mt-1">
              <span className="text-4xl font-bold" style={{ color }}>{score !== null ? Math.round(s) : "--"}</span>
              <span className="text-white/40 text-lg mb-1">/100</span>
              <Badge className="mb-1 border-0 text-xs" style={{ background: color + "33", color }}>{label}</Badge>
            </div>
          </div>
          <div className="relative w-16 h-16">
            <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke={color} strokeWidth="3"
                strokeDasharray={`${s} ${100 - s}`}
                strokeLinecap="round"
                style={{ transition: "stroke-dasharray 0.5s ease" }}
              />
            </svg>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Sleep", value: components.sleep, icon: Moon },
            { label: "Hydration", value: components.hydration, icon: Droplets },
            { label: "Calories", value: components.calories, icon: Flame },
            { label: "Weight", value: components.weight, icon: Scale },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="text-center">
              <Icon className="h-3.5 w-3.5 mx-auto mb-1 text-white/40" />
              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{
                  width: `${value}%`,
                  background: value >= 75 ? CHART_COLORS.green : value >= 50 ? CHART_COLORS.amber : CHART_COLORS.red
                }} />
              </div>
              <p className="text-[10px] text-white/40 mt-1">{label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Quick Log Buttons ─────────────────────────────────────────────────────────

function QuickLogRow({
  onLogWeight, onLogWater, onLogSleep,
  weightLogged, waterLogged, sleepLogged, caloriesLogged,
}: {
  onLogWeight: () => void; onLogWater: () => void; onLogSleep: () => void;
  weightLogged: boolean; waterLogged: boolean; sleepLogged: boolean; caloriesLogged: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Today's Tracking</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "Weight", logged: weightLogged, icon: Scale, action: onLogWeight, color: "text-blue-500" },
            { label: "Water", logged: waterLogged, icon: Droplets, action: onLogWater, color: "text-cyan-500" },
            { label: "Sleep", logged: sleepLogged, icon: Moon, action: onLogSleep, color: "text-purple-500" },
            { label: "Calories", logged: caloriesLogged, icon: Flame, color: "text-orange-500", action: undefined },
          ].map(({ label, logged, icon: Icon, action, color }) => (
            <button
              key={label}
              onClick={action}
              disabled={!action}
              className={`flex items-center gap-2 p-2.5 rounded-lg border transition-all text-sm font-medium ${
                logged
                  ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                  : action
                    ? "border-border hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
                    : "border-dashed border-muted opacity-60 cursor-default"
              }`}
            >
              {logged ? <Check className="h-4 w-4 text-green-500 shrink-0" /> : <Icon className={`h-4 w-4 shrink-0 ${color}`} />}
              {label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Weight Tab ────────────────────────────────────────────────────────────────

function WeightTab({ profile }: { profile: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [weight, setWeight] = useState("");
  const [unit, setUnit] = useState(profile?.weight_unit || "lbs");
  const [trendWindow, setTrendWindow] = useState<7 | 14 | 30>(14);
  const [saving, setSaving] = useState(false);

  const { data: entries = [] } = useQuery({
    queryKey: ["weight-entries"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .from("weight_entries").select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(90);
      return data || [];
    },
  });

  const handleSave = async () => {
    if (!weight || isNaN(parseFloat(weight))) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("weight_entries").insert({
        user_id: user.id, date: today(), weight: parseFloat(weight), unit,
      });
      if (error) throw error;
      setWeight("");
      queryClient.invalidateQueries({ queryKey: ["weight-entries"] });
      queryClient.invalidateQueries({ queryKey: ["recovery-score"] });
      toast({ title: "Weight logged" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const chartData = useMemo(() => {
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    // Normalize to lbs for display consistency if mixed units
    return sorted.map((e, i) => {
      const weightInUnit = e.unit === unit ? e.weight : e.unit === "kg"
        ? parseFloat((e.weight * 2.20462).toFixed(1))
        : parseFloat((e.weight / 2.20462).toFixed(1));
      return { date: format(parseISO(e.date), "MMM d"), value: weightInUnit, i };
    });
  }, [entries, unit]);

  const maData = useMemo(() => movingAvg(chartData, trendWindow), [chartData, trendWindow]);
  const chartWithMA = chartData.map((d, i) => ({ ...d, ma: maData[i] }));

  const trendSummary = useMemo(() => {
    if (entries.length < 7) return null;
    const recent = [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);
    const first = recent[recent.length - 1];
    const last = recent[0];
    const days = differenceInDays(parseISO(last.date), parseISO(first.date)) || 1;
    const delta = last.weight - first.weight;
    const perWeek = (delta / days * 7).toFixed(1);
    const sign = delta > 0 ? "+" : "";
    // Plateau detection
    const last10 = entries.slice(0, 10);
    if (last10.length >= 10) {
      const max = Math.max(...last10.map(e => e.weight));
      const min = Math.min(...last10.map(e => e.weight));
      const rangeInLbs = first.unit === "kg" ? (max - min) * 2.20462 : max - min;
      if (rangeInLbs < 0.3) return `Weight plateau detected for ${last10.length} days. No meaningful change in weight.`;
    }
    if (Math.abs(parseFloat(perWeek)) < 0.1) return "Weight is stable over the past 2 weeks.";
    const direction = delta < 0 ? "losing" : "gaining";
    return `You are ${direction} ${Math.abs(parseFloat(perWeek))} ${first.unit} per week over the last 14 days.`;
  }, [entries]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label className="text-xs">Weight</Label>
              <Input
                type="number" step="0.1" placeholder={unit === "lbs" ? "175.0" : "79.4"}
                value={weight} onChange={e => setWeight(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSave()}
                className="mt-1"
              />
            </div>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lbs">lbs</SelectItem>
                <SelectItem value="kg">kg</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleSave} disabled={saving || !weight} className="shrink-0">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Log"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {trendSummary && (
        <Card className={`border-l-4 ${trendSummary.includes("plateau") ? "border-l-amber-500 bg-amber-50 dark:bg-amber-900/10" : trendSummary.includes("losing") ? "border-l-blue-500 bg-blue-50 dark:bg-blue-900/10" : "border-l-green-500 bg-green-50 dark:bg-green-900/10"}`}>
          <CardContent className="p-3 flex items-center gap-2">
            {trendSummary.includes("plateau") ? <Minus className="h-4 w-4 text-amber-500 shrink-0" /> : trendSummary.includes("losing") ? <TrendingDown className="h-4 w-4 text-blue-500 shrink-0" /> : <TrendingUp className="h-4 w-4 text-green-500 shrink-0" />}
            <p className="text-sm">{trendSummary}</p>
          </CardContent>
        </Card>
      )}

      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Weight Trend</CardTitle>
              <div className="flex gap-1">
                {([7, 14, 30] as const).map(w => (
                  <Button key={w} size="sm" variant={trendWindow === w ? "default" : "ghost"}
                    className="h-6 px-2 text-xs" onClick={() => setTrendWindow(w)}>
                    {w}d
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartWithMA} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                  formatter={(v: number) => [`${v.toFixed(1)} ${unit}`, ""]}
                />
                <Line type="monotone" dataKey="value" stroke={CHART_COLORS.primary} strokeWidth={1.5} dot={{ r: 2 }} name="Weight" />
                <Line type="monotone" dataKey="ma" stroke={CHART_COLORS.green} strokeWidth={2} dot={false} strokeDasharray="4 2" name={`${trendWindow}d avg`} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {entries.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No weight data yet. Log your first entry above.
        </div>
      )}
    </div>
  );
}

// ── Water Tab ─────────────────────────────────────────────────────────────────

function WaterTab({ profile }: { profile: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);
  const hydrationGoal = profile?.hydration_goal_ml || 2500;

  const { data: entries = [] } = useQuery({
    queryKey: ["water-entries"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .from("water_entries").select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(60);
      return data || [];
    },
  });

  const logWater = useCallback(async (ml: number) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("water_entries").insert({
        user_id: user.id, date: today(), amount_ml: ml,
      });
      if (error) throw error;
      setCustom("");
      queryClient.invalidateQueries({ queryKey: ["water-entries"] });
      queryClient.invalidateQueries({ queryKey: ["recovery-score"] });
      toast({ title: `+${ml}ml logged` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  }, [queryClient, toast]);

  const waterByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of entries) map[e.date] = (map[e.date] || 0) + e.amount_ml;
    return map;
  }, [entries]);

  const todayWater = waterByDate[today()] || 0;
  const todayPct = Math.min(100, Math.round((todayWater / hydrationGoal) * 100));

  const last7 = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = nDaysAgo(6 - i);
      return { date: format(parseISO(d), "EEE"), amount: waterByDate[d] || 0, goal: hydrationGoal };
    });
  }, [waterByDate, hydrationGoal]);

  const goalsMetThisWeek = last7.filter(d => d.amount >= hydrationGoal).length;
  const avgWater = Math.round(last7.reduce((s, d) => s + d.amount, 0) / 7);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-2xl font-bold">{(todayWater / 1000).toFixed(1)}L</p>
              <p className="text-xs text-muted-foreground">of {(hydrationGoal / 1000).toFixed(1)}L goal ({todayPct}%)</p>
            </div>
            <div className="relative w-14 h-14">
              <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.9" fill="none"
                  stroke={todayPct >= 100 ? CHART_COLORS.green : CHART_COLORS.cyan}
                  strokeWidth="3" strokeDasharray={`${todayPct} ${100 - todayPct}`} strokeLinecap="round" />
              </svg>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 mb-3">
            {[250, 500, 750, 1000].map(ml => (
              <Button key={ml} variant="outline" size="sm" disabled={saving}
                onClick={() => logWater(ml)} className="text-xs h-9">
                +{ml >= 1000 ? `${ml / 1000}L` : `${ml}ml`}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input type="number" placeholder="Custom ml" value={custom}
              onChange={e => setCustom(e.target.value)} className="text-sm" />
            <Button variant="outline" size="sm" disabled={saving || !custom}
              onClick={() => custom && logWater(parseInt(custom))}>
              Log
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3 text-center">
          <p className="text-lg font-bold">{(avgWater / 1000).toFixed(1)}L</p>
          <p className="text-xs text-muted-foreground">7d avg</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-lg font-bold">{goalsMetThisWeek}/7</p>
          <p className="text-xs text-muted-foreground">Goals met</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-lg font-bold">{Math.round(goalsMetThisWeek / 7 * 100)}%</p>
          <p className="text-xs text-muted-foreground">Consistency</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="text-sm font-semibold">Daily Water Intake</CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-4">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={last7} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                formatter={(v: number) => [`${v}ml`, "Water"]}
              />
              <ReferenceLine y={hydrationGoal} stroke={CHART_COLORS.green} strokeDasharray="4 2" label={{ value: "Goal", position: "right", fontSize: 10 }} />
              <Bar dataKey="amount" fill={CHART_COLORS.cyan} radius={[4, 4, 0, 0]} name="Water" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sleep Tab ─────────────────────────────────────────────────────────────────

function SleepTab({ profile }: { profile: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ duration: "", quality: "", bedtime: "", wake_time: "" });
  const [saving, setSaving] = useState(false);

  const { data: entries = [] } = useQuery({
    queryKey: ["sleep-entries"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .from("sleep_entries").select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(30);
      return data || [];
    },
  });

  const handleSave = async () => {
    if (!form.duration || isNaN(parseFloat(form.duration))) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const payload: any = {
        user_id: user.id, date: today(),
        duration_hours: parseFloat(form.duration),
      };
      if (form.quality) payload.quality_score = parseInt(form.quality);
      if (form.bedtime) payload.bedtime = form.bedtime;
      if (form.wake_time) payload.wake_time = form.wake_time;
      const { error } = await supabase.from("sleep_entries").insert(payload);
      if (error) throw error;
      setForm({ duration: "", quality: "", bedtime: "", wake_time: "" });
      queryClient.invalidateQueries({ queryKey: ["sleep-entries"] });
      queryClient.invalidateQueries({ queryKey: ["recovery-score"] });
      toast({ title: "Sleep logged" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const stats = useMemo(() => {
    if (!entries.length) return null;
    const last7 = entries.slice(0, 7);
    const avg = last7.reduce((s, e) => s + e.duration_hours, 0) / last7.length;
    const debt = Math.max(0, last7.reduce((s, e) => s + (8 - e.duration_hours), 0));
    const qualityArr = last7.filter(e => e.quality_score).map(e => e.quality_score!);
    const avgQuality = qualityArr.length ? qualityArr.reduce((a, b) => a + b, 0) / qualityArr.length : null;
    return { avg: avg.toFixed(1), debt: debt.toFixed(1), avgQuality: avgQuality?.toFixed(1) };
  }, [entries]);

  const chartData = useMemo(() => {
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
    return sorted.map(e => ({
      date: format(parseISO(e.date), "MMM d"),
      hours: e.duration_hours,
      quality: e.quality_score,
    }));
  }, [entries]);

  const avgLine = stats ? parseFloat(stats.avg) : 8;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <Label className="text-xs">Duration (hours)</Label>
              <Input type="number" step="0.25" placeholder="7.5" value={form.duration}
                onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && handleSave()} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Quality (1–10)</Label>
              <Input type="number" min="1" max="10" placeholder="8" value={form.quality}
                onChange={e => setForm(f => ({ ...f, quality: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Bedtime (optional)</Label>
              <Input type="time" value={form.bedtime}
                onChange={e => setForm(f => ({ ...f, bedtime: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Wake time (optional)</Label>
              <Input type="time" value={form.wake_time}
                onChange={e => setForm(f => ({ ...f, wake_time: e.target.value }))} className="mt-1" />
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving || !form.duration} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Log Sleep
          </Button>
        </CardContent>
      </Card>

      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="p-3 text-center">
            <p className="text-lg font-bold">{stats.avg}h</p>
            <p className="text-xs text-muted-foreground">7d avg</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className={`text-lg font-bold ${parseFloat(stats.debt) > 0 ? "text-amber-500" : "text-green-500"}`}>{stats.debt}h</p>
            <p className="text-xs text-muted-foreground">Sleep debt</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className="text-lg font-bold">{stats.avgQuality ?? "--"}</p>
            <p className="text-xs text-muted-foreground">Avg quality</p>
          </CardContent></Card>
        </div>
      )}

      {parseFloat(stats?.debt || "0") > 3 && (
        <Card className="border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-900/10">
          <CardContent className="p-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
            <p className="text-sm">Sleep debt is currently {stats?.debt}h this week. Aim for 8 hours tonight to recover.</p>
          </CardContent>
        </Card>
      )}

      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-semibold">Sleep Duration Trend</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} domain={[4, 10]} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                  formatter={(v: number, name: string) => [name === "hours" ? `${v}h` : `${v}/10`, name === "hours" ? "Sleep" : "Quality"]}
                />
                <ReferenceLine y={8} stroke={CHART_COLORS.green} strokeDasharray="4 2" label={{ value: "8h", position: "right", fontSize: 10 }} />
                <ReferenceLine y={avgLine} stroke={CHART_COLORS.primary} strokeDasharray="4 2" label={{ value: "Avg", position: "left", fontSize: 10 }} />
                <Line type="monotone" dataKey="hours" stroke={CHART_COLORS.purple} strokeWidth={2} dot={{ r: 3 }} name="hours" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {entries.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No sleep data yet. Log last night's sleep above.
        </div>
      )}
    </div>
  );
}

// ── AI Insights Tab ───────────────────────────────────────────────────────────

function InsightsTab({ profile }: { profile: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: cachedInsight } = useQuery({
    queryKey: ["ai-insights"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("ai_insights")
        .select("*").eq("user_id", user.id).eq("insight_type", "daily").maybeSingle();
      return data;
    },
  });

  const refreshInsight = async () => {
    setRefreshing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase.functions.invoke("generate-insights", {
        body: { user_id: user.id },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["ai-insights"] });
      toast({ title: "Insights updated" });
    } catch (e: any) {
      toast({ title: "Error generating insights", description: e.message, variant: "destructive" });
    } finally { setRefreshing(false); }
  };

  // Cross-system correlation data
  const { data: sleepEntries = [] } = useQuery({
    queryKey: ["sleep-entries"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase.from("sleep_entries").select("*").eq("user_id", user.id).order("date", { ascending: false }).limit(30);
      return data || [];
    },
  });

  const { data: workouts = [] } = useQuery({
    queryKey: ["workouts-for-correlation"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase.from("erg_workouts").select("workout_date,avg_watts,avg_split").eq("user_id", user.id).order("workout_date", { ascending: false }).limit(30);
      return data || [];
    },
  });

  const { data: waterEntries = [] } = useQuery({
    queryKey: ["water-entries"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase.from("water_entries").select("*").eq("user_id", user.id).order("date", { ascending: false }).limit(30);
      return data || [];
    },
  });

  const sleepVsPerf = useMemo(() => {
    const workoutMap: Record<string, number> = {};
    for (const w of workouts) {
      if (w.avg_watts) workoutMap[w.workout_date] = w.avg_watts;
    }
    return sleepEntries.filter(s => workoutMap[s.date]).map(s => ({
      sleep: s.duration_hours,
      watts: workoutMap[s.date],
    }));
  }, [sleepEntries, workouts]);

  const hydrationVsPerf = useMemo(() => {
    const waterByDate: Record<string, number> = {};
    for (const w of waterEntries) waterByDate[w.date] = (waterByDate[w.date] || 0) + w.amount_ml;
    const workoutMap: Record<string, number> = {};
    for (const w of workouts) { if (w.avg_watts) workoutMap[w.workout_date] = w.avg_watts; }
    return Object.entries(waterByDate).filter(([d]) => workoutMap[d]).map(([d, ml]) => ({
      water: Math.round(ml / 100) * 100,
      watts: workoutMap[d],
    }));
  }, [waterEntries, workouts]);

  const lastUpdated = cachedInsight?.last_updated
    ? format(new Date(cachedInsight.last_updated), "MMM d 'at' h:mm a") : null;

  return (
    <div className="space-y-4">
      <Card className="border-0 bg-gradient-to-br from-[#0a1628] to-[#112240]">
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-400" />
              <p className="text-white font-semibold text-sm">AI Coach Insight</p>
            </div>
            <Button size="sm" variant="ghost" onClick={refreshInsight} disabled={refreshing}
              className="h-7 text-white/60 hover:text-white hover:bg-white/10">
              {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </Button>
          </div>
          {cachedInsight?.content ? (
            <>
              <p className="text-white/80 text-sm leading-relaxed">{cachedInsight.content}</p>
              {lastUpdated && <p className="text-white/30 text-[10px] mt-3">Updated {lastUpdated}</p>}
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-white/40 text-sm mb-3">Generate your first AI coaching insight</p>
              <Button size="sm" onClick={refreshInsight} disabled={refreshing}
                className="bg-white/10 hover:bg-white/20 text-white border-0">
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Generate Insight
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {sleepVsPerf.length >= 3 && (
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-semibold">Sleep vs. Power Output</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={180}>
              <ScatterChart margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="sleep" name="Sleep" unit="h" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis dataKey="watts" name="Power" unit="W" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                  formatter={(v: number, name: string) => [`${v}${name === "Sleep" ? "h" : "W"}`, name]}
                />
                <Scatter data={sleepVsPerf} fill={CHART_COLORS.purple} opacity={0.7} />
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {hydrationVsPerf.length >= 3 && (
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-semibold">Hydration vs. Power Output</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={180}>
              <ScatterChart margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="water" name="Water" unit="ml" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis dataKey="watts" name="Power" unit="W" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                  formatter={(v: number, name: string) => [`${v}${name === "Water" ? "ml" : "W"}`, name]}
                />
                <Scatter data={hydrationVsPerf} fill={CHART_COLORS.cyan} opacity={0.7} />
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {sleepVsPerf.length < 3 && hydrationVsPerf.length < 3 && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground text-sm">
            <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
            Log workouts, sleep, and water data to unlock correlation charts.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function RecoveryDashboard({ profile }: RecoveryDashboardProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [showWeightForm, setShowWeightForm] = useState(false);
  const [showWaterForm, setShowWaterForm] = useState(false);
  const [showSleepForm, setShowSleepForm] = useState(false);

  const { data: recoveryData, isLoading: scoreLoading } = useQuery({
    queryKey: ["recovery-score"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const t = today();
      const sevenAgo = nDaysAgo(7);
      const hydrationGoal = profile?.hydration_goal_ml || 2500;

      const [sleepRes, waterRes, weightRes, mealsRes] = await Promise.all([
        supabase.from("sleep_entries").select("*").eq("user_id", user.id).order("date", { ascending: false }).limit(7),
        supabase.from("water_entries").select("*").eq("user_id", user.id).gte("date", sevenAgo).order("date", { ascending: false }),
        supabase.from("weight_entries").select("*").eq("user_id", user.id).order("date", { ascending: false }).limit(14),
        supabase.from("meal_plans").select("calories,meal_date").eq("user_id", user.id).gte("meal_date", sevenAgo),
      ]);

      const sleepEntries = sleepRes.data || [];
      const waterEntries = waterRes.data || [];
      const weightEntries = weightRes.data || [];
      const meals = mealsRes.data || [];

      // Sleep component (40 pts)
      const lastSleep = sleepEntries[0];
      let sleepComponent = 0;
      if (lastSleep) {
        const durationScore = Math.min(1, lastSleep.duration_hours / 8) * 0.7;
        const qualityScore = lastSleep.quality_score ? (lastSleep.quality_score / 10) * 0.3 : 0.3 * 0.5;
        sleepComponent = (durationScore + qualityScore) * 100;
      }

      // Hydration component (20 pts)
      const waterByDate: Record<string, number> = {};
      for (const w of waterEntries) waterByDate[w.date] = (waterByDate[w.date] || 0) + w.amount_ml;
      const todayWater = waterByDate[t] || 0;
      const hydrationComponent = Math.min(100, (todayWater / hydrationGoal) * 100);

      // Calorie component (20 pts) — stability vs target
      const mealsByDate: Record<string, number> = {};
      for (const m of meals) mealsByDate[m.meal_date] = (mealsByDate[m.meal_date] || 0) + (m.calories || 0);
      const w = profile?.weight;
      const h = profile?.height || 175;
      const a = profile?.age || 25;
      const bmr = w ? 10 * w + 6.25 * h - 5 * a + 5 : 2000;
      const tdee = Math.round(bmr * 1.7);
      const goal = profile?.diet_goal === "cut" ? tdee - 400 : profile?.diet_goal === "bulk" ? tdee + 400 : tdee;
      const calValues = Object.values(mealsByDate);
      let calorieComponent = 50;
      if (calValues.length > 0) {
        const avgCal = calValues.reduce((a, b) => a + b, 0) / calValues.length;
        const deviation = Math.abs(avgCal - goal) / goal;
        calorieComponent = Math.max(0, Math.min(100, (1 - deviation * 2) * 100));
      }

      // Weight component (20 pts) — stability / trend alignment
      let weightComponent = 70;
      if (weightEntries.length >= 7) {
        const last7w = weightEntries.slice(0, 7);
        const max = Math.max(...last7w.map(e => e.weight));
        const min = Math.min(...last7w.map(e => e.weight));
        const rangeInLbs = last7w[0]?.unit === "kg" ? (max - min) * 2.20462 : max - min;
        if (rangeInLbs < 1) weightComponent = 90;
        else if (rangeInLbs < 2) weightComponent = 75;
        else weightComponent = 55;
      }

      const score = sleepComponent * 0.4 + hydrationComponent * 0.2 + calorieComponent * 0.2 + weightComponent * 0.2;

      // Today's logged status
      const todayWeight = weightEntries.some(e => e.date === t);
      const todayWaterLogged = (waterByDate[t] || 0) > 0;
      const todaySleep = sleepEntries.some(e => e.date === t);
      const todayCalories = (mealsByDate[t] || 0) > 0;

      return {
        score, sleepComponent, hydrationComponent, calorieComponent, weightComponent,
        todayWeight, todayWaterLogged, todaySleep, todayCalories,
      };
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-foreground">Recovery</h2>
        <p className="text-sm text-muted-foreground">Track weight, hydration, sleep, and performance</p>
      </div>

      <RecoveryScoreCard
        score={recoveryData?.score ?? null}
        components={{
          sleep: recoveryData?.sleepComponent ?? 0,
          hydration: recoveryData?.hydrationComponent ?? 0,
          calories: recoveryData?.calorieComponent ?? 0,
          weight: recoveryData?.weightComponent ?? 0,
        }}
        loading={scoreLoading}
      />

      <QuickLogRow
        onLogWeight={() => { setActiveTab("weight"); setShowWeightForm(true); }}
        onLogWater={() => { setActiveTab("water"); setShowWaterForm(true); }}
        onLogSleep={() => { setActiveTab("sleep"); setShowSleepForm(true); }}
        weightLogged={recoveryData?.todayWeight ?? false}
        waterLogged={recoveryData?.todayWaterLogged ?? false}
        sleepLogged={recoveryData?.todaySleep ?? false}
        caloriesLogged={recoveryData?.todayCalories ?? false}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="weight" className="text-xs"><Scale className="h-3.5 w-3.5 mr-1.5" />Weight</TabsTrigger>
          <TabsTrigger value="water" className="text-xs"><Droplets className="h-3.5 w-3.5 mr-1.5" />Water</TabsTrigger>
          <TabsTrigger value="sleep" className="text-xs"><Moon className="h-3.5 w-3.5 mr-1.5" />Sleep</TabsTrigger>
          <TabsTrigger value="insights" className="text-xs"><Sparkles className="h-3.5 w-3.5 mr-1.5" />Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="weight" className="mt-4">
          <WeightTab profile={profile} />
        </TabsContent>
        <TabsContent value="water" className="mt-4">
          <WaterTab profile={profile} />
        </TabsContent>
        <TabsContent value="sleep" className="mt-4">
          <SleepTab profile={profile} />
        </TabsContent>
        <TabsContent value="insights" className="mt-4">
          <InsightsTab profile={profile} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
