import { useState, useEffect, useRef, useCallback } from "react";
import { getSessionUser } from '@/lib/getUser';
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  SplitSquareVertical,
  Zap,
  Weight,
  Gauge,
  Target,
  Activity,
  Trophy,
  ArrowLeftRight,
  BarChart3,
  TrendingUp,
  ChevronDown,
  Info,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Calculator,
  Radio,
  RotateCcw,
  Square,
  Play,
} from "lucide-react";
import { Capacitor } from "@capacitor/core";

// ─── Helpers ────────────────────────────────────────────────────────────────

const parseTime = (t: string): number | null => {
  if (!t.trim()) return null;
  const parts = t.trim().split(":");
  if (parts.length === 2) {
    const m = parseInt(parts[0]);
    const s = parseFloat(parts[1]);
    if (isNaN(m) || isNaN(s) || s >= 60) return null;
    return m * 60 + s;
  }
  const s = parseFloat(t.trim());
  return isNaN(s) ? null : s;
};

const fmtSplit = (sec: number): string => {
  if (!sec || sec <= 0) return "--:--";
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
};

const fmtTime = (totalSec: number): string => {
  if (!totalSec || totalSec <= 0) return "--:--";
  if (totalSec >= 3600) {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = Math.round(totalSec % 60);
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
};

const splitToWatts = (splitSec: number): number => {
  if (!splitSec || splitSec <= 0) return 0;
  return Math.round(2.80 / Math.pow(splitSec / 500, 3));
};

const wattsToSplit = (w: number): number => {
  if (!w || w <= 0) return 0;
  return 500 * Math.cbrt(2.80 / w);
};

const lbsToKg = (lbs: number) => lbs * 0.453592;
const kgToLbs = (kg: number) => kg / 0.453592;

// ─── FormulaBox ─────────────────────────────────────────────────────────────

function FormulaBox({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Info className="h-3.5 w-3.5" />
          How is this calculated?
        </span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 py-3 border-t border-border bg-muted/30 text-sm text-muted-foreground space-y-1">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── ResultRow ───────────────────────────────────────────────────────────────

function ResultRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-right">
        <span className="font-mono font-bold text-foreground">{value}</span>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

// ─── 1. Split Calculator ─────────────────────────────────────────────────────

const STANDARD_DISTANCES = [
  { label: "500m", meters: 500 },
  { label: "1,000m", meters: 1000 },
  { label: "2,000m", meters: 2000 },
  { label: "5,000m", meters: 5000 },
  { label: "6,000m", meters: 6000 },
  { label: "10,000m", meters: 10000 },
  { label: "Half Marathon (21,097m)", meters: 21097 },
  { label: "Marathon (42,195m)", meters: 42195 },
];

function SplitCalc({ prefill }: { prefill: PrefillData }) {
  const [mode, setMode] = useState<"time" | "split">("time");
  const [inputVal, setInputVal] = useState("");
  const [distance, setDistance] = useState("2000");
  const [customDist, setCustomDist] = useState("");
  const [result, setResult] = useState<{
    splitSec: number;
    totalSec: number;
    watts: number;
    mpm: number;
    segments: { n: number; split: string; cumulative: string }[];
    projections: { label: string; time: string }[];
  } | null>(null);

  const calculate = () => {
    const distMeters = distance === "custom" ? parseInt(customDist) : parseInt(distance);
    if (!distMeters || distMeters <= 0) return;
    const numSplits = distMeters / 500;

    let splitSec: number;
    let totalSec: number;

    if (mode === "time") {
      const t = parseTime(inputVal);
      if (!t) return;
      totalSec = t;
      splitSec = t / numSplits;
    } else {
      const s = parseTime(inputVal);
      if (!s) return;
      splitSec = s;
      totalSec = s * numSplits;
    }

    const watts = splitToWatts(splitSec);
    const mpm = 30000 / splitSec;

    const segments: { n: number; split: string; cumulative: string }[] = [];
    for (let i = 0; i < Math.min(numSplits, 200); i++) {
      segments.push({
        n: i + 1,
        split: fmtSplit(splitSec),
        cumulative: fmtTime(splitSec * (i + 1)),
      });
    }

    const projections = STANDARD_DISTANCES.map((d) => ({
      label: d.label,
      time: fmtTime(splitSec * (d.meters / 500)),
    }));

    setResult({ splitSec, totalSec, watts, mpm, segments, projections });
  };

  const numSegments = result?.segments.length ?? 0;
  const showSegments = numSegments <= 84; // up to marathon in 500m chunks

  return (
    <Card className="shadow-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <SplitSquareVertical className="h-5 w-5 text-primary" />
          Split Calculator
        </CardTitle>
        <CardDescription>
          Enter a total time or a split to project pace across any distance
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
          <button
            onClick={() => setMode("time")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === "time" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            Enter Total Time
          </button>
          <button
            onClick={() => setMode("split")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === "split" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            Enter Split /500m
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">{mode === "time" ? "Total Time (M:SS)" : "Split /500m (M:SS)"}</Label>
            <Input
              placeholder={mode === "time" ? "7:05.4" : "1:46.4"}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              className="font-mono"
              inputMode="decimal"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Distance</Label>
            <Select value={distance} onValueChange={setDistance}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STANDARD_DISTANCES.map((d) => (
                  <SelectItem key={d.meters} value={String(d.meters)}>
                    {d.label}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {distance === "custom" && (
            <div className="space-y-1">
              <Label className="text-xs">Custom Distance (m)</Label>
              <Input
                placeholder="3000"
                value={customDist}
                onChange={(e) => setCustomDist(e.target.value)}
                type="number" inputMode="numeric"
              />
            </div>
          )}
          <div className="flex items-end">
            <Button onClick={calculate} className="w-full">
              Calculate
            </Button>
          </div>
        </div>

        {result && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Split /500m</div>
                <div className="font-mono font-bold text-lg text-primary">{fmtSplit(result.splitSec)}</div>
              </div>
              <div className="bg-muted/50 border border-border rounded-xl p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Total Time</div>
                <div className="font-mono font-bold text-lg">{fmtTime(result.totalSec)}</div>
              </div>
              <div className="bg-muted/50 border border-border rounded-xl p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Watts</div>
                <div className="font-mono font-bold text-lg">{result.watts}W</div>
              </div>
              <div className="bg-muted/50 border border-border rounded-xl p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Meters/min</div>
                <div className="font-mono font-bold text-lg">{result.mpm.toFixed(1)}</div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
                Projected Times at This Pace
              </h3>
              <div className="rounded-xl border border-border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Distance</TableHead>
                      <TableHead className="text-right font-mono">Projected Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.projections.map((p) => (
                      <TableRow key={p.label}>
                        <TableCell className="text-sm">{p.label}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{p.time}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {showSegments && result.segments.length > 1 && (
              <div>
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
                  500m Segment Breakdown
                </h3>
                <div className="rounded-xl border border-border overflow-x-auto max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-16">500m #</TableHead>
                        <TableHead>Split</TableHead>
                        <TableHead className="text-right">Cumulative</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.segments.map((s) => (
                        <TableRow key={s.n}>
                          <TableCell className="font-mono text-muted-foreground">{s.n}</TableCell>
                          <TableCell className="font-mono font-bold">{s.split}</TableCell>
                          <TableCell className="font-mono text-right text-muted-foreground">
                            {s.cumulative}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}

        <FormulaBox>
          <p>
            <strong>Split from total time:</strong> split = total_time ÷ (distance ÷ 500)
          </p>
          <p>
            <strong>Total time from split:</strong> total_time = split × (distance ÷ 500)
          </p>
          <p>
            <strong>Watts:</strong> W = 2.80 ÷ (split_seconds ÷ 500)³ — the standard Concept2 formula
          </p>
          <p>
            <strong>Meters/min:</strong> 500 ÷ split_seconds × 60
          </p>
        </FormulaBox>
      </CardContent>
    </Card>
  );
}

// ─── 2. 2K Predictor (AI) ───────────────────────────────────────────────────

interface PredictResult {
  predicted_time: string;
  realistic_range: { best: string; realistic: string };
  confidence: number;
  confidence_explanation: string;
  helping_factors: string[];
  limiting_factors: string[];
  to_hit_best_case: string;
  honest_note: string | null;
}

function TwokPredictor({ prefill }: { prefill: PrefillData }) {
  const [form, setForm] = useState({
    current_2k: prefill.best2k ?? "",
    current_6k: prefill.best6k ?? "",
    best_60min: prefill.best60min ?? "",
    weekly_volume: prefill.weeklyVolume ? String(Math.round(prefill.weeklyVolume)) : "",
    weeks_consistent: "",
    age: prefill.age ? String(prefill.age) : "",
    weight: prefill.weight ? String(prefill.weight) : "",
    height: prefill.height ? String(prefill.height) : "",
    gender: prefill.gender ?? "",
    training_phase: "",
    test_recency: "",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PredictResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (key: string, val: string) => setForm((p) => ({ ...p, [key]: val }));

  const predict = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("predict-2k", {
        body: {
          mode: "predict",
          current_2k: form.current_2k || undefined,
          current_6k: form.current_6k || undefined,
          best_60min: form.best_60min ? parseInt(form.best_60min) : undefined,
          weekly_volume: form.weekly_volume ? parseInt(form.weekly_volume) : undefined,
          weeks_consistent: form.weeks_consistent ? parseInt(form.weeks_consistent) : undefined,
          age: form.age ? parseInt(form.age) : undefined,
          weight: form.weight ? parseFloat(form.weight) : undefined,
          height: form.height ? parseInt(form.height) : undefined,
          gender: form.gender || undefined,
          training_phase: form.training_phase || undefined,
          test_recency: form.test_recency || undefined,
        },
      });
      if (fnErr) {
        // Extract the real error body from the response
        let msg = "Prediction failed — please try again";
        try {
          const body = await (fnErr as any).context?.json?.();
          if (body?.error) msg = body.error;
        } catch {}
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      setResult(data as PredictResult);
    } catch (e: any) {
      setError(e.message ?? "Prediction failed — please try again");
    } finally {
      setLoading(false);
    }
  };

  const confidenceColor =
    (result?.confidence ?? 0) >= 75
      ? "text-green-600"
      : (result?.confidence ?? 0) >= 50
      ? "text-yellow-600"
      : "text-red-500";

  return (
    <Card className="shadow-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Zap className="h-5 w-5 text-primary" />
          2K Time Predictor
          <Badge className="ml-1 bg-primary/10 text-primary border-primary/20 text-xs font-normal">
            AI Powered
          </Badge>
        </CardTitle>
        <CardDescription>
          Conservative, realistic prediction using rowing physiology — not wishful thinking
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Performance Data
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Current Best 2K (M:SS.t)</Label>
              <Input
                placeholder="7:05.4"
                value={form.current_2k}
                onChange={(e) => set("current_2k", e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Current Best 6K Total (M:SS)</Label>
              <Input
                placeholder="22:30.0"
                value={form.current_6k}
                onChange={(e) => set("current_6k", e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">60-Minute Test Distance (m)</Label>
              <Input
                placeholder="13500"
                value={form.best_60min}
                onChange={(e) => set("best_60min", e.target.value)}
                type="number" inputMode="numeric"
              />
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Training Data
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Weekly Volume (meters/week)</Label>
              <Input
                placeholder="60000"
                value={form.weekly_volume}
                onChange={(e) => set("weekly_volume", e.target.value)}
                type="number" inputMode="numeric"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Weeks of Consistent Training</Label>
              <Input
                placeholder="12"
                value={form.weeks_consistent}
                onChange={(e) => set("weeks_consistent", e.target.value)}
                type="number" inputMode="numeric"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Training Phase</Label>
              <Select value={form.training_phase} onValueChange={(v) => set("training_phase", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select phase" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="base">Base Fitness</SelectItem>
                  <SelectItem value="race_prep">Race Prep</SelectItem>
                  <SelectItem value="taper">Taper</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Last Test Was</Label>
              <Select value={form.test_recency} onValueChange={(v) => set("test_recency", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select recency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="within_2_weeks">Within 2 weeks</SelectItem>
                  <SelectItem value="2_4_weeks">2–4 weeks ago</SelectItem>
                  <SelectItem value="1_3_months">1–3 months ago</SelectItem>
                  <SelectItem value="over_3_months">Over 3 months ago</SelectItem>
                  <SelectItem value="untested">Haven't tested yet</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Physiology
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Age</Label>
              <Input
                placeholder="22"
                value={form.age}
                onChange={(e) => set("age", e.target.value)}
                type="number" inputMode="numeric"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Weight (kg)</Label>
              <Input
                placeholder="80"
                value={form.weight}
                onChange={(e) => set("weight", e.target.value)}
                type="number" inputMode="numeric"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Height (cm)</Label>
              <Input
                placeholder="185"
                value={form.height}
                onChange={(e) => set("height", e.target.value)}
                type="number" inputMode="numeric"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Gender</Label>
              <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Button onClick={predict} disabled={loading} className="w-full gap-2">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing your data...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4" />
              Predict My 2K Time
            </>
          )}
        </Button>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">Predicted 2K</div>
                <div className="font-mono font-bold text-2xl text-primary">
                  {result.predicted_time}
                </div>
              </div>
              <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">Best Case</div>
                <div className="font-mono font-bold text-xl text-green-600">
                  {result.realistic_range.best}
                </div>
                <div className="text-xs text-muted-foreground mt-1">everything goes right</div>
              </div>
              <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">Conservative</div>
                <div className="font-mono font-bold text-xl text-orange-600">
                  {result.realistic_range.realistic}
                </div>
                <div className="text-xs text-muted-foreground mt-1">safely achievable</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
              <div>
                <div className="text-xs text-muted-foreground">Confidence Score</div>
                <div className={`font-bold text-lg ${confidenceColor}`}>
                  {result.confidence}%
                </div>
              </div>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${result.confidence}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground max-w-[180px] text-right">
                {result.confidence_explanation}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2">
                  Factors Helping
                </p>
                <ul className="space-y-1.5">
                  {result.helping_factors.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider mb-2">
                  Limiting Factors
                </p>
                <ul className="space-y-1.5">
                  {result.limiting_factors.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl">
              <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">
                To Hit Best Case
              </p>
              <p className="text-sm">{result.to_hit_best_case}</p>
            </div>

            {result.honest_note && (
              <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-sm">
                <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
                <p>{result.honest_note}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── 3. Weight Adjustment Calculator ────────────────────────────────────────

function WeightAdjCalc({ prefill }: { prefill: PrefillData }) {
  const [twok, setTwok] = useState(prefill.best2k ?? "");
  const [currWeight, setCurrWeight] = useState(prefill.weight ? String(prefill.weight) : "");
  const [targWeight, setTargWeight] = useState("");
  const [unit, setUnit] = useState<"kg" | "lbs">("kg");
  const [result, setResult] = useState<{
    adjTime: string;
    currWatts: number;
    adjWatts: number;
    timeDiff: string;
    wattsDiff: number;
  } | null>(null);

  const calculate = () => {
    const timeSec = parseTime(twok);
    let cw = parseFloat(currWeight);
    let tw = parseFloat(targWeight);
    if (!timeSec || !cw || !tw || cw <= 0 || tw <= 0) return;

    if (unit === "lbs") {
      cw = lbsToKg(cw);
      tw = lbsToKg(tw);
    }

    const adjTimeSec = timeSec * Math.pow(tw / cw, 0.222);
    const currWatts = splitToWatts(timeSec / 4);
    const adjWatts = splitToWatts(adjTimeSec / 4);
    const diff = adjTimeSec - timeSec;

    setResult({
      adjTime: fmtTime(adjTimeSec),
      currWatts,
      adjWatts,
      timeDiff: (diff < 0 ? "-" : "+") + fmtTime(Math.abs(diff)),
      wattsDiff: adjWatts - currWatts,
    });
  };

  return (
    <Card className="shadow-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Weight className="h-5 w-5 text-primary" />
          Weight Adjustment Calculator
        </CardTitle>
        <CardDescription>
          Predict your 2K time at a different body weight
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
          <button
            onClick={() => setUnit("kg")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              unit === "kg" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            kg
          </button>
          <button
            onClick={() => setUnit("lbs")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              unit === "lbs" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            lbs
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Current 2K Time (M:SS.t)</Label>
            <Input
              placeholder="7:05.4"
              value={twok}
              onChange={(e) => setTwok(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Current Weight ({unit})</Label>
            <Input
              placeholder={unit === "kg" ? "82" : "181"}
              value={currWeight}
              onChange={(e) => setCurrWeight(e.target.value)}
              type="number" inputMode="numeric"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Target Weight ({unit})</Label>
            <Input
              placeholder={unit === "kg" ? "78" : "172"}
              value={targWeight}
              onChange={(e) => setTargWeight(e.target.value)}
              type="number" inputMode="numeric"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={calculate} className="w-full">
              Calculate
            </Button>
          </div>
        </div>

        {result && (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Predicted 2K</div>
                <div className="font-mono font-bold text-xl text-primary">{result.adjTime}</div>
              </div>
              <div className="bg-muted/50 border border-border rounded-xl p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Time Change</div>
                <div
                  className={`font-mono font-bold text-xl ${
                    result.timeDiff.startsWith("-") ? "text-green-600" : "text-red-500"
                  }`}
                >
                  {result.timeDiff}
                </div>
              </div>
              <div className="bg-muted/50 border border-border rounded-xl p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Current Watts</div>
                <div className="font-mono font-bold text-xl">{result.currWatts}W</div>
              </div>
              <div className="bg-muted/50 border border-border rounded-xl p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Predicted Watts</div>
                <div className="font-mono font-bold text-xl">{result.adjWatts}W</div>
                <div
                  className={`text-xs mt-0.5 ${
                    result.wattsDiff > 0 ? "text-green-600" : "text-red-500"
                  }`}
                >
                  {result.wattsDiff > 0 ? "+" : ""}
                  {result.wattsDiff}W
                </div>
              </div>
            </div>

            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-sm text-muted-foreground">
              <strong className="text-foreground">Important:</strong> This formula assumes weight change
              is fat, not muscle. Losing muscle will reduce watts more than predicted.
              Gaining muscle mass may actually improve performance beyond what's shown.
            </div>
          </div>
        )}

        <FormulaBox>
          <p>
            <strong>Formula:</strong> adjusted_time = current_time × (target_weight ÷ current_weight)^0.222
          </p>
          <p>
            The 0.222 exponent is the standard rowing weight adjustment factor, derived from the
            relationship between drag force and body mass in rowing ergometry.
          </p>
          <p>
            <strong>Limitation:</strong> Assumes all weight change is fat. Real performance may differ
            if weight change involves muscle mass changes.
          </p>
        </FormulaBox>
      </CardContent>
    </Card>
  );
}

// ─── 4. Pace and Watts Converter ─────────────────────────────────────────────

const SPLIT_TABLE_RANGE = Array.from({ length: 21 }, (_, i) => 80 + i * 5); // 80s to 180s = 1:20 to 3:00

function PaceWattsCalc({ prefill }: { prefill: PrefillData }) {
  const [inputType, setInputType] = useState<"split" | "watts">("split");
  const [inputVal, setInputVal] = useState("");
  const [result, setResult] = useState<{
    split: string;
    watts: number;
    mpm: number;
    calHr: number;
    projections: { label: string; time: string }[];
  } | null>(null);

  const calculate = () => {
    let splitSec: number;

    if (inputType === "split") {
      const s = parseTime(inputVal);
      if (!s) return;
      splitSec = s;
    } else {
      const w = parseFloat(inputVal);
      if (!w || w <= 0) return;
      splitSec = wattsToSplit(w);
    }

    const watts = splitToWatts(splitSec);
    const mpm = 30000 / splitSec;
    const calHr = Math.round(watts * 4);

    const projections = STANDARD_DISTANCES.map((d) => ({
      label: d.label,
      time: fmtTime((splitSec * d.meters) / 500),
    }));

    setResult({ split: fmtSplit(splitSec), watts, mpm, calHr, projections });
  };

  return (
    <Card className="shadow-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Gauge className="h-5 w-5 text-primary" />
          Pace & Watts Converter
        </CardTitle>
        <CardDescription>Convert between split, watts, and projected times</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
          <button
            onClick={() => setInputType("split")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              inputType === "split"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            Split → Watts
          </button>
          <button
            onClick={() => setInputType("watts")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              inputType === "watts"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            Watts → Split
          </button>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">
              {inputType === "split" ? "Split /500m (M:SS.t)" : "Watts"}
            </Label>
            <Input
              placeholder={inputType === "split" ? "1:52.3" : "185"}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={calculate}>Convert</Button>
          </div>
        </div>

        {result && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Split /500m</div>
                <div className="font-mono font-bold text-xl text-primary">{result.split}</div>
              </div>
              <div className="bg-muted/50 border border-border rounded-xl p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Watts</div>
                <div className="font-mono font-bold text-xl">{result.watts}W</div>
              </div>
              <div className="bg-muted/50 border border-border rounded-xl p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Meters/min</div>
                <div className="font-mono font-bold text-xl">{result.mpm.toFixed(1)}</div>
              </div>
              <div className="bg-muted/50 border border-border rounded-xl p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Cal/hr (approx)</div>
                <div className="font-mono font-bold text-xl">{result.calHr}</div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
                Projected Times at This Pace
              </h3>
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Distance</TableHead>
                      <TableHead className="text-right font-mono">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.projections.map((p) => (
                      <TableRow key={p.label}>
                        <TableCell className="text-sm">{p.label}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{p.time}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
            Conversion Table (1:20–3:00 per 500m)
          </h3>
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Split /500m</TableHead>
                  <TableHead className="text-right">Watts</TableHead>
                  <TableHead className="text-right">2K Time</TableHead>
                  <TableHead className="text-right">m/min</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SPLIT_TABLE_RANGE.map((sec) => (
                  <TableRow key={sec}>
                    <TableCell className="font-mono">{fmtSplit(sec)}</TableCell>
                    <TableCell className="font-mono text-right">{splitToWatts(sec)}W</TableCell>
                    <TableCell className="font-mono text-right">{fmtTime(sec * 4)}</TableCell>
                    <TableCell className="font-mono text-right">{(30000 / sec).toFixed(1)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <FormulaBox>
          <p>
            <strong>Watts from split:</strong> W = 2.80 ÷ (split_seconds ÷ 500)³
          </p>
          <p>
            <strong>Split from watts:</strong> split = 500 × ∛(2.80 ÷ W)
          </p>
          <p>
            <strong>Cal/hr (approximate):</strong> calories/hr ≈ watts × 4 (rough ergometer estimate)
          </p>
          <p>These are the standard Concept2 power formulas.</p>
        </FormulaBox>
      </CardContent>
    </Card>
  );
}

// ─── 5. Training Zones Calculator ────────────────────────────────────────────

const ZONES = [
  {
    id: "UT2",
    name: "UT2",
    label: "Utilization 2",
    pctLow: 0,
    pctHigh: 65,
    color: "bg-blue-500/10 text-blue-700 border-blue-500/20",
    description: "Long aerobic base building — develops fat metabolism and aerobic capacity at very low intensity",
  },
  {
    id: "UT1",
    name: "UT1",
    label: "Utilization 1",
    pctLow: 65,
    pctHigh: 75,
    color: "bg-cyan-500/10 text-cyan-700 border-cyan-500/20",
    description: "Core aerobic development — builds aerobic power and lactate clearance efficiency",
  },
  {
    id: "AT",
    name: "AT",
    label: "Aerobic Threshold",
    pctLow: 75,
    pctHigh: 85,
    color: "bg-green-500/10 text-green-700 border-green-500/20",
    description: "Aerobic threshold work — improves sustainable lactate threshold pace",
  },
  {
    id: "TR",
    name: "TR",
    label: "Transportation",
    pctLow: 85,
    pctHigh: 95,
    color: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
    description: "Threshold training — develops the aerobic-anaerobic transition and race pace endurance",
  },
  {
    id: "AN",
    name: "AN",
    label: "Anaerobic",
    pctLow: 95,
    pctHigh: 100,
    color: "bg-orange-500/10 text-orange-700 border-orange-500/20",
    description: "Race pace and above — develops anaerobic capacity and race sharpness",
  },
  {
    id: "SP",
    name: "SP",
    label: "Sprint",
    pctLow: 100,
    pctHigh: 120,
    color: "bg-red-500/10 text-red-700 border-red-500/20",
    description: "Sprint and power work — develops peak power and neuromuscular efficiency",
  },
];

function TrainingZonesCalc({ prefill }: { prefill: PrefillData }) {
  const [inputType, setInputType] = useState<"time" | "watts">("time");
  const [inputVal, setInputVal] = useState(prefill.best2k ?? "");
  const [zones, setZones] = useState<
    { zone: (typeof ZONES)[0]; splitLow: string; splitHigh: string; wattsLow: number; wattsHigh: number }[]
  >([]);

  const calculate = () => {
    let baseSplitSec: number;
    if (inputType === "time") {
      const t = parseTime(inputVal);
      if (!t) return;
      baseSplitSec = t / 4; // 2k split
    } else {
      const w = parseFloat(inputVal);
      if (!w || w <= 0) return;
      baseSplitSec = wattsToSplit(w);
    }

    const baseWatts = splitToWatts(baseSplitSec);

    const result = ZONES.map((zone) => {
      const wLow = Math.round(baseWatts * (zone.pctLow / 100));
      const wHigh = Math.round(baseWatts * (zone.pctHigh / 100));
      const sHigh = wLow > 0 ? wattsToSplit(wLow) : 9999;
      const sLow = wHigh > 0 ? wattsToSplit(wHigh) : 9999;

      return {
        zone,
        wattsLow: wLow,
        wattsHigh: wHigh,
        splitLow: sLow < 9000 ? fmtSplit(sLow) : "–",
        splitHigh: sHigh < 9000 ? fmtSplit(sHigh) : "–",
      };
    });

    setZones(result);
  };

  return (
    <Card className="shadow-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Target className="h-5 w-5 text-primary" />
          Training Zones Calculator
        </CardTitle>
        <CardDescription>Rowing training zones based on your 2K pace</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
          <button
            onClick={() => setInputType("time")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              inputType === "time"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            Enter 2K Time
          </button>
          <button
            onClick={() => setInputType("watts")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              inputType === "watts"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            Enter 2K Watts
          </button>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">
              {inputType === "time" ? "2K Time (M:SS.t)" : "2K Average Watts"}
            </Label>
            <Input
              placeholder={inputType === "time" ? "7:05.4" : "215"}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={calculate}>Calculate Zones</Button>
          </div>
        </div>

        {zones.length > 0 && (
          <div className="space-y-2 pt-2">
            {zones.map(({ zone, splitLow, splitHigh, wattsLow, wattsHigh }) => (
              <div
                key={zone.id}
                className={`p-3 rounded-xl border ${zone.color} space-y-1`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-xs font-bold ${zone.color}`}
                    >
                      {zone.name}
                    </Badge>
                    <span className="text-sm font-semibold">{zone.label}</span>
                    <span className="text-xs opacity-70">
                      {zone.pctLow}–{zone.pctHigh}% of 2K
                    </span>
                  </div>
                  <div className="text-right font-mono text-sm font-bold">
                    {wattsLow}–{wattsHigh}W
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs opacity-80 max-w-xs">{zone.description}</p>
                  <div className="text-right font-mono text-xs opacity-80">
                    {splitHigh} – {splitLow} /500m
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <FormulaBox>
          <p>Zones are calculated as percentages of your 2K average watts output.</p>
          <p>
            <strong>Zone watts:</strong> zone_watts = 2K_watts × zone_percentage
          </p>
          <p>
            <strong>Zone split from watts:</strong> split = 500 × ∛(2.80 ÷ zone_watts)
          </p>
          <p>
            These zones follow standard British Rowing / World Rowing training guidelines.
          </p>
        </FormulaBox>
      </CardContent>
    </Card>
  );
}

// ─── 6. Stroke Rate Efficiency ───────────────────────────────────────────────

const OPTIMAL_SPM: { maxSplit: number; spmMin: number; spmMax: number }[] = [
  { maxSplit: 100, spmMin: 30, spmMax: 36 },  // sub 1:40
  { maxSplit: 110, spmMin: 28, spmMax: 34 },  // sub 1:50
  { maxSplit: 120, spmMin: 26, spmMax: 32 },  // sub 2:00
  { maxSplit: 135, spmMin: 24, spmMax: 30 },  // sub 2:15
  { maxSplit: 150, spmMin: 22, spmMax: 28 },  // sub 2:30
  { maxSplit: 9999, spmMin: 18, spmMax: 26 }, // 2:30+
];

function StrokeRateCalc({ prefill }: { prefill: PrefillData }) {
  const [split, setSplit] = useState("");
  const [spm, setSpm] = useState("");
  const [result, setResult] = useState<{
    mPerStroke: number;
    optSpmMin: number;
    optSpmMax: number;
    assessment: string;
    assessmentType: "good" | "high" | "low";
  } | null>(null);

  const calculate = () => {
    const splitSec = parseTime(split);
    const strokeRate = parseInt(spm);
    if (!splitSec || !strokeRate || strokeRate <= 0) return;

    const mPerMin = 30000 / splitSec;
    const mPerStroke = mPerMin / strokeRate;

    const optimal = OPTIMAL_SPM.find((r) => splitSec <= r.maxSplit) ?? OPTIMAL_SPM[OPTIMAL_SPM.length - 1];

    let assessment: string;
    let assessmentType: "good" | "high" | "low";

    if (strokeRate < optimal.spmMin) {
      assessmentType = "low";
      assessment = `Rate of ${strokeRate} spm is below the recommended ${optimal.spmMin}–${optimal.spmMax} spm for this pace. Very low rates can indicate technique issues or insufficient drive power. Consider building rate slightly while maintaining power per stroke.`;
    } else if (strokeRate > optimal.spmMax) {
      assessmentType = "high";
      assessment = `Rate of ${strokeRate} spm is above the recommended ${optimal.spmMin}–${optimal.spmMax} spm for this pace. High rates at this speed suggest short, rushed strokes with insufficient power application. Focus on slowing the drive and getting more meters per stroke.`;
    } else {
      assessmentType = "good";
      assessment = `Rate of ${strokeRate} spm is well-matched to this pace. You're in the optimal range of ${optimal.spmMin}–${optimal.spmMax} spm, indicating good power-to-rate balance.`;
    }

    setResult({ mPerStroke, optSpmMin: optimal.spmMin, optSpmMax: optimal.spmMax, assessment, assessmentType });
  };

  return (
    <Card className="shadow-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="h-5 w-5 text-primary" />
          Stroke Rate Efficiency
        </CardTitle>
        <CardDescription>
          Analyze whether your stroke rate is appropriate for your pace
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Split /500m (M:SS.t)</Label>
            <Input
              placeholder="1:52.3"
              value={split}
              onChange={(e) => setSplit(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Stroke Rate (spm)</Label>
            <Input
              placeholder="22"
              value={spm}
              onChange={(e) => setSpm(e.target.value)}
              type="number" inputMode="numeric"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={calculate} className="w-full">
              Analyze
            </Button>
          </div>
        </div>

        {result && (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Meters / Stroke</div>
                <div className="font-mono font-bold text-xl text-primary">
                  {result.mPerStroke.toFixed(2)}m
                </div>
              </div>
              <div className="bg-muted/50 border border-border rounded-xl p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Optimal Rate Range</div>
                <div className="font-mono font-bold text-xl">
                  {result.optSpmMin}–{result.optSpmMax}
                </div>
                <div className="text-xs text-muted-foreground">spm for this pace</div>
              </div>
              <div
                className={`rounded-xl p-3 text-center border ${
                  result.assessmentType === "good"
                    ? "bg-green-500/10 border-green-500/20"
                    : result.assessmentType === "high"
                    ? "bg-orange-500/10 border-orange-500/20"
                    : "bg-blue-500/10 border-blue-500/20"
                }`}
              >
                <div className="text-xs text-muted-foreground mb-1">Rating</div>
                <div
                  className={`font-bold text-lg ${
                    result.assessmentType === "good"
                      ? "text-green-600"
                      : result.assessmentType === "high"
                      ? "text-orange-600"
                      : "text-blue-600"
                  }`}
                >
                  {result.assessmentType === "good"
                    ? "Optimal"
                    : result.assessmentType === "high"
                    ? "Too High"
                    : "Too Low"}
                </div>
              </div>
            </div>

            <div
              className={`p-3 rounded-xl border text-sm ${
                result.assessmentType === "good"
                  ? "bg-green-500/10 border-green-500/20 text-green-800"
                  : result.assessmentType === "high"
                  ? "bg-orange-500/10 border-orange-500/20 text-orange-800"
                  : "bg-blue-500/10 border-blue-500/20 text-blue-800"
              }`}
            >
              {result.assessment}
            </div>
          </div>
        )}

        <FormulaBox>
          <p>
            <strong>Meters per stroke:</strong> (500 ÷ split_seconds) × 60 ÷ stroke_rate
          </p>
          <p>
            Optimal stroke rate ranges are based on standard rowing benchmarks. Elite 2K racing
            is typically 34–38 spm; steady state is 18–22 spm; pieces are 24–28 spm.
          </p>
        </FormulaBox>
      </CardContent>
    </Card>
  );
}

// ─── 7. Race Splits Planner ───────────────────────────────────────────────────

function RaceSplitPlanner({ prefill }: { prefill: PrefillData }) {
  const [targetTime, setTargetTime] = useState(prefill.best2k ?? "");
  const [strategy, setStrategy] = useState<"even" | "negative" | "sprint">("even");
  const [plan, setPlan] = useState<
    { n: number; split: string; watts: number; note: string }[]
  >([]);

  const calculate = () => {
    const total = parseTime(targetTime);
    if (!total) return;
    const avgSplit = total / 4;

    let splits: number[];

    if (strategy === "even") {
      splits = [avgSplit, avgSplit, avgSplit, avgSplit];
    } else if (strategy === "negative") {
      // Progressive: 3% slower start, 1% build each 500m
      const factors = [1.025, 1.008, 0.992, 0.975];
      const adj = total / factors.reduce((s, f) => s + f, 0);
      splits = factors.map((f) => adj * f);
    } else {
      // Sprint finish: first 3 conservative (+2%), last 500m fast (-4%)
      // Spread: first 500m +2%, middle two even, last 500m -4%
      // Total must sum to 4 × avgSplit
      // x + x + x + (x - d) = 4avg → 3x + x - d = 4avg where x = avg * 1.02, d = ?
      // avg*1.02 + avg*1.00 + avg*1.00 + last = 4*avg
      // last = 4*avg - 3.02*avg = 0.98*avg → but we want something more dramatic
      // Let first 500m be +2.5%, middle two +1%, last -7%
      // Check: (avg*1.025 + avg*1.01 + avg*1.01 + last) = 4*avg
      // last = 4avg - 3.045avg = 0.955avg → last is 4.5% faster
      const a = avgSplit * 1.025;
      const b = avgSplit * 1.010;
      const c = avgSplit * 1.010;
      const d = total - a - b - c;
      splits = [a, b, c, d];
    }

    const result = splits.map((s, i) => {
      const devPct = ((s - avgSplit) / avgSplit) * 100;
      const note =
        devPct > 1
          ? `+${devPct.toFixed(1)}% (conservative)`
          : devPct < -1
          ? `${devPct.toFixed(1)}% (aggressive)`
          : "even pace";

      return {
        n: i + 1,
        split: fmtSplit(s),
        watts: splitToWatts(s),
        note,
      };
    });

    setPlan(result);
  };

  const energyCostNote =
    strategy === "sprint"
      ? "Going out conservative and sprinting the last 500m is highly efficient — you avoid early lactate accumulation. The cost is psychological discipline in the first 1500m."
      : strategy === "negative"
      ? "Negative splitting is metabolically efficient and sustainable. Studies show rowers who negative split typically feel stronger in the final 500m. The risk is going too conservative early."
      : "Even splitting minimizes energy waste. It requires accurate pacing discipline — most athletes go slightly too fast in the first 500m, which costs more time in the final 500m than it gained.";

  return (
    <Card className="shadow-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Trophy className="h-5 w-5 text-primary" />
          Race Splits Planner
        </CardTitle>
        <CardDescription>Plan your 2K race strategy 500m by 500m</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Target 2K Time (M:SS.t)</Label>
            <Input
              placeholder="7:05.4"
              value={targetTime}
              onChange={(e) => setTargetTime(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Pacing Strategy</Label>
            <Select value={strategy} onValueChange={(v) => setStrategy(v as typeof strategy)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="even">Even Split</SelectItem>
                <SelectItem value="negative">Negative Split</SelectItem>
                <SelectItem value="sprint">Sprint Finish</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={calculate} className="w-full">
              Build Plan
            </Button>
          </div>
        </div>

        {plan.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>500m</TableHead>
                    <TableHead>Target Split</TableHead>
                    <TableHead className="text-right">Watts</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Deviation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plan.map((p) => (
                    <TableRow key={p.n}>
                      <TableCell className="font-semibold">#{p.n}</TableCell>
                      <TableCell className="font-mono font-bold text-lg">{p.split}</TableCell>
                      <TableCell className="font-mono text-right">{p.watts}W</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground hidden md:table-cell">
                        {p.note}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl text-sm">
              <strong className="text-primary">Energy Cost Note: </strong>
              {energyCostNote}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── 8. Erg Equivalency ───────────────────────────────────────────────────────

const ERG_FACTORS: Record<string, Record<string, number>> = {
  row: { ski: 0.84, bike: 1.12 },
  ski: { row: 1.0 / 0.84, bike: 1.12 / 0.84 },
  bike: { row: 1.0 / 1.12, ski: 0.84 / 1.12 },
};

const ERG_NAMES: Record<string, string> = {
  row: "RowErg",
  ski: "SkiErg",
  bike: "BikeErg",
};

function ErgEquivalency({ prefill }: { prefill: PrefillData }) {
  const [ergType, setErgType] = useState("row");
  const [inputTime, setInputTime] = useState("");
  const [inputDist, setInputDist] = useState("2000");
  const [results, setResults] = useState<{ erg: string; time: string; split: string }[]>([]);

  const calculate = () => {
    const totalSec = parseTime(inputTime);
    const dist = parseInt(inputDist);
    if (!totalSec || !dist) return;

    const splitSec = totalSec / (dist / 500);
    const baseWatts = splitToWatts(splitSec);

    const others = Object.keys(ERG_FACTORS[ergType] ?? {});
    const result = others.map((other) => {
      const factor = ERG_FACTORS[ergType][other];
      const equivWatts = baseWatts * factor;
      const equivSplit = wattsToSplit(equivWatts);
      const equivTime = equivSplit * (dist / 500);
      return {
        erg: ERG_NAMES[other] ?? other,
        time: fmtTime(equivTime),
        split: fmtSplit(equivSplit),
      };
    });

    setResults(result);
  };

  return (
    <Card className="shadow-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ArrowLeftRight className="h-5 w-5 text-primary" />
          Erg Equivalency Calculator
        </CardTitle>
        <CardDescription>
          Convert performances between RowErg, SkiErg, and BikeErg
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Erg Type</Label>
            <Select value={ergType} onValueChange={setErgType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="row">RowErg</SelectItem>
                <SelectItem value="ski">SkiErg</SelectItem>
                <SelectItem value="bike">BikeErg</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Distance</Label>
            <Select value={inputDist} onValueChange={setInputDist}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STANDARD_DISTANCES.slice(0, 6).map((d) => (
                  <SelectItem key={d.meters} value={String(d.meters)}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Time (M:SS)</Label>
            <Input
              placeholder="7:05.4"
              value={inputTime}
              onChange={(e) => setInputTime(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={calculate} className="w-full">
              Convert
            </Button>
          </div>
        </div>

        {results.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Erg</TableHead>
                    <TableHead className="text-right font-mono">Equivalent Time</TableHead>
                    <TableHead className="text-right font-mono">Split /500m</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r) => (
                    <TableRow key={r.erg}>
                      <TableCell className="font-semibold">{r.erg}</TableCell>
                      <TableCell className="font-mono text-right font-bold">{r.time}</TableCell>
                      <TableCell className="font-mono text-right">{r.split}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-sm text-muted-foreground">
              <strong className="text-foreground">Note:</strong> These conversions are approximate
              effort equivalencies. SkiErg is estimated at ~16% more demanding per watt due to
              upper-body-only mechanics. BikeErg is estimated ~12% easier due to additional muscle
              groups. Individual variation is significant.
            </div>
          </div>
        )}

        <FormulaBox>
          <p>
            Conversions are based on relative metabolic demand per watt of output:
          </p>
          <p>
            <strong>Row → Ski:</strong> equivalent watts = row_watts × 0.84 (SkiErg is harder)
          </p>
          <p>
            <strong>Row → Bike:</strong> equivalent watts = row_watts × 1.12 (BikeErg is easier)
          </p>
          <p>
            Then: equivalent_split = 500 × ∛(2.80 ÷ equiv_watts)
          </p>
        </FormulaBox>
      </CardContent>
    </Card>
  );
}

// ─── 9. W/kg Ratio ────────────────────────────────────────────────────────────

const WKG_LEVELS_M = [
  { label: "Elite / National", min: 6.0, color: "text-purple-600" },
  { label: "D1 College", min: 5.2, max: 6.0, color: "text-blue-600" },
  { label: "D2 College", min: 4.7, max: 5.2, color: "text-cyan-600" },
  { label: "D3 College", min: 4.2, max: 4.7, color: "text-green-600" },
  { label: "Competitive Club", min: 3.5, max: 4.2, color: "text-yellow-600" },
  { label: "Recreational", max: 3.5, color: "text-muted-foreground" },
];

const WKG_LEVELS_F = [
  { label: "Elite / National", min: 5.0, color: "text-purple-600" },
  { label: "D1 College", min: 4.2, max: 5.0, color: "text-blue-600" },
  { label: "D2 College", min: 3.8, max: 4.2, color: "text-cyan-600" },
  { label: "D3 College", min: 3.3, max: 3.8, color: "text-green-600" },
  { label: "Competitive Club", min: 2.7, max: 3.3, color: "text-yellow-600" },
  { label: "Recreational", max: 2.7, color: "text-muted-foreground" },
];

function WkgRatio({ prefill }: { prefill: PrefillData }) {
  const [twok, setTwok] = useState(prefill.best2k ?? "");
  const [weight, setWeight] = useState(prefill.weight ? String(prefill.weight) : "");
  const [gender, setGender] = useState(prefill.gender ?? "male");
  const [unit, setUnit] = useState<"kg" | "lbs">("kg");
  const [result, setResult] = useState<{
    wkg: number;
    watts: number;
    level: string;
    levelColor: string;
    levels: { label: string; wkg: string; color: string; isYou: boolean }[];
  } | null>(null);

  const calculate = () => {
    const timeSec = parseTime(twok);
    let w = parseFloat(weight);
    if (!timeSec || !w) return;
    if (unit === "lbs") w = lbsToKg(w);

    const splitSec = timeSec / 4;
    const watts = splitToWatts(splitSec);
    const wkg = watts / w;

    const levels = gender === "female" ? WKG_LEVELS_F : WKG_LEVELS_M;
    const yourLevel = [...levels].reverse().find((l) => {
      if (l.min !== undefined && wkg < l.min) return false;
      if (l.max !== undefined && wkg >= l.max) return false;
      return true;
    }) ?? levels[levels.length - 1];

    setResult({
      wkg,
      watts,
      level: yourLevel.label,
      levelColor: yourLevel.color,
      levels: levels.map((l) => ({
        label: l.label,
        wkg: l.min !== undefined ? `≥ ${l.min.toFixed(1)} W/kg` : `< ${l.max!.toFixed(1)} W/kg`,
        color: l.color,
        isYou: l.label === yourLevel.label,
      })),
    });
  };

  return (
    <Card className="shadow-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <BarChart3 className="h-5 w-5 text-primary" />
          Body Weight to Watts Ratio
        </CardTitle>
        <CardDescription>
          See your W/kg and how it compares to competitive performance levels
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-2 p-1 bg-muted rounded-lg">
            <button
              onClick={() => setUnit("kg")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                unit === "kg" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              kg
            </button>
            <button
              onClick={() => setUnit("lbs")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                unit === "lbs" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              lbs
            </button>
          </div>
          <div className="flex gap-2 p-1 bg-muted rounded-lg">
            <button
              onClick={() => setGender("male")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                gender === "male"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              Male
            </button>
            <button
              onClick={() => setGender("female")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                gender === "female"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              Female
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">2K Time (M:SS.t)</Label>
            <Input
              placeholder="7:05.4"
              value={twok}
              onChange={(e) => setTwok(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Weight ({unit})</Label>
            <Input
              placeholder={unit === "kg" ? "82" : "181"}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              type="number" inputMode="numeric"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={calculate} className="w-full">
              Calculate
            </Button>
          </div>
        </div>

        {result && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">W/kg</div>
                <div className="font-mono font-bold text-2xl text-primary">
                  {result.wkg.toFixed(2)}
                </div>
              </div>
              <div className="bg-muted/50 border border-border rounded-xl p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">2K Avg Watts</div>
                <div className="font-mono font-bold text-xl">{result.watts}W</div>
              </div>
              <div className="bg-muted/50 border border-border rounded-xl p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Level</div>
                <div className={`font-bold text-base ${result.levelColor}`}>{result.level}</div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Performance Benchmarks ({gender === "male" ? "Men" : "Women"})
              </p>
              <div className="space-y-1.5">
                {result.levels.map((l) => (
                  <div
                    key={l.label}
                    className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                      l.isYou
                        ? "border-primary/40 bg-primary/5"
                        : "border-border bg-muted/30"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {l.isYou && (
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      )}
                      {!l.isYou && <div className="w-2 h-2 rounded-full bg-border" />}
                      <span
                        className={`text-sm font-medium ${
                          l.isYou ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {l.label}
                        {l.isYou && (
                          <Badge className="ml-2 bg-primary/10 text-primary border-primary/20 text-xs">
                            You
                          </Badge>
                        )}
                      </span>
                    </div>
                    <span className={`font-mono text-sm font-semibold ${l.color}`}>
                      {l.wkg}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <FormulaBox>
          <p>
            <strong>W/kg = 2K average watts ÷ body weight (kg)</strong>
          </p>
          <p>2K average watts: W = 2.80 ÷ (2K_split_seconds ÷ 500)³</p>
          <p>
            Benchmarks are approximate and based on typical competitive rowing performance data.
            Individual athletes may vary significantly from these ranges based on body composition,
            rowing technique, and training background.
          </p>
        </FormulaBox>
      </CardContent>
    </Card>
  );
}

// ─── 10. Improvement Timeline (AI) ───────────────────────────────────────────

interface TimelineResult {
  estimated_weeks: number;
  estimated_weeks_range: { optimistic: number; realistic: number };
  required_volume_increase: string;
  milestones: { time: string; weeks: number; notes: string }[];
  is_realistic: boolean;
  honest_assessment: string;
  key_requirements: string[];
}

function ImprovementTimeline({ prefill }: { prefill: PrefillData }) {
  const [form, setForm] = useState({
    current_2k: prefill.best2k ?? "",
    goal_2k: "",
    weekly_volume: prefill.weeklyVolume ? String(Math.round(prefill.weeklyVolume)) : "",
    age: prefill.age ? String(prefill.age) : "",
    gender: prefill.gender ?? "",
    training_phase: "",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TimelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (key: string, val: string) => setForm((p) => ({ ...p, [key]: val }));

  const generate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("predict-2k", {
        body: {
          mode: "timeline",
          current_2k: form.current_2k || undefined,
          goal_2k: form.goal_2k || undefined,
          weekly_volume: form.weekly_volume ? parseInt(form.weekly_volume) : undefined,
          age: form.age ? parseInt(form.age) : undefined,
          gender: form.gender || undefined,
          training_phase: form.training_phase || undefined,
        },
      });
      if (fnErr) {
        let msg = "Timeline generation failed — please try again";
        try {
          const body = await (fnErr as any).context?.json?.();
          if (body?.error) msg = body.error;
        } catch {}
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      setResult(data as TimelineResult);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="shadow-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="h-5 w-5 text-primary" />
          2K Improvement Timeline
          <Badge className="ml-1 bg-primary/10 text-primary border-primary/20 text-xs font-normal">
            AI Powered
          </Badge>
        </CardTitle>
        <CardDescription>
          Realistic roadmap to your goal 2K time — conservative by design
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Current 2K Time (M:SS.t)</Label>
            <Input
              placeholder="7:05.4"
              value={form.current_2k}
              onChange={(e) => set("current_2k", e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Goal 2K Time (M:SS.t)</Label>
            <Input
              placeholder="6:45.0"
              value={form.goal_2k}
              onChange={(e) => set("goal_2k", e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Weekly Volume (m/week)</Label>
            <Input
              placeholder="60000"
              value={form.weekly_volume}
              onChange={(e) => set("weekly_volume", e.target.value)}
              type="number" inputMode="numeric"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Age</Label>
            <Input
              placeholder="22"
              value={form.age}
              onChange={(e) => set("age", e.target.value)}
              type="number" inputMode="numeric"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Gender</Label>
            <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Current Training Phase</Label>
            <Select value={form.training_phase} onValueChange={(v) => set("training_phase", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select phase" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="base">Base Fitness</SelectItem>
                <SelectItem value="race_prep">Race Prep</SelectItem>
                <SelectItem value="taper">Taper</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={generate} disabled={loading} className="w-full gap-2">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Building your timeline...
            </>
          ) : (
            <>
              <TrendingUp className="h-4 w-4" />
              Generate Timeline
            </>
          )}
        </Button>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">Estimated Timeline</div>
                <div className="font-bold text-2xl text-primary">{result.estimated_weeks}</div>
                <div className="text-xs text-muted-foreground">weeks (realistic)</div>
              </div>
              <div className="bg-muted/50 border border-border rounded-xl p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">Optimistic</div>
                <div className="font-bold text-xl">{result.estimated_weeks_range.optimistic} wks</div>
              </div>
              <div className="bg-muted/50 border border-border rounded-xl p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">Conservative</div>
                <div className="font-bold text-xl">{result.estimated_weeks_range.realistic} wks</div>
              </div>
            </div>

            {!result.is_realistic && (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm">
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-red-700">
                  <strong>Heads up:</strong> This goal may be very challenging to achieve. See the
                  honest assessment below.
                </p>
              </div>
            )}

            <div className="p-3 bg-muted/50 rounded-xl">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Honest Assessment
              </p>
              <p className="text-sm">{result.honest_assessment}</p>
            </div>

            {result.milestones.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Milestones
                </p>
                <div className="space-y-2">
                  {result.milestones.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-4 p-3 bg-muted/30 border border-border rounded-xl"
                    >
                      <div className="shrink-0 text-center">
                        <div className="font-mono font-bold text-primary">{m.time}</div>
                        <div className="text-xs text-muted-foreground">wk {m.weeks}</div>
                      </div>
                      <div className="w-px h-8 bg-border" />
                      <p className="text-sm text-muted-foreground">{m.notes}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.required_volume_increase && (
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">
                  Volume Recommendation
                </p>
                <p className="text-sm">{result.required_volume_increase}</p>
              </div>
            )}

            {result.key_requirements.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Key Requirements
                </p>
                <ul className="space-y-1.5">
                  {result.key_requirements.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Prefill Data ─────────────────────────────────────────────────────────────

interface PrefillData {
  best2k?: string;
  best6k?: string;
  best60min?: string;
  weeklyVolume?: number;
  age?: number;
  weight?: number;
  height?: number;
  gender?: string;
}

// ─── Stroke Watch ────────────────────────────────────────────────────────────

function StrokeWatch() {
  const [taps, setTaps]           = useState<number[]>([]); // timestamps (ms)
  const [elapsed, setElapsed]     = useState(0);            // ms since first tap
  const [running, setRunning]     = useState(false);
  const [flash, setFlash]         = useState(false);
  const [targetRate, setTargetRate] = useState("");
  const startRef  = useRef<number | null>(null);
  const rafRef    = useRef<number | null>(null);
  const tapsRef   = useRef<number[]>([]);

  // Keep tapsRef in sync
  useEffect(() => { tapsRef.current = taps; }, [taps]);

  const tick = useCallback(() => {
    if (startRef.current !== null) {
      setElapsed(Date.now() - startRef.current);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const startTimer = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(tick);
    setRunning(true);
  }, [tick]);

  const stopTimer = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    setRunning(false);
  }, []);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const handleStroke = useCallback(async () => {
    const now = Date.now();

    // Haptics on native
    if (Capacitor.isNativePlatform()) {
      try {
        const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
        await Haptics.impact({ style: ImpactStyle.Medium });
      } catch {}
    } else {
      try { navigator.vibrate?.(10); } catch {}
    }

    // Flash animation
    setFlash(true);
    setTimeout(() => setFlash(false), 120);

    // Start timer on first tap
    if (tapsRef.current.length === 0) {
      startRef.current = now;
      startTimer();
    }

    setTaps(prev => [...prev, now]);
  }, [startTimer]);

  const handleStartStop = useCallback(() => {
    if (running) {
      stopTimer();
    } else {
      if (startRef.current !== null) {
        // Resume: shift start forward so elapsed doesn't reset
        startRef.current = Date.now() - elapsed;
        startTimer();
      }
    }
  }, [running, elapsed, startTimer, stopTimer]);

  const handleReset = useCallback(() => {
    stopTimer();
    setTaps([]);
    tapsRef.current = [];
    setElapsed(0);
    startRef.current = null;
    setRunning(false);
  }, [stopTimer]);

  // Stroke rate: 60 / avg interval of last 4 taps
  const rate = (() => {
    if (taps.length < 2) return null;
    const recent = taps.slice(-4);
    const intervals: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      intervals.push((recent[i] - recent[i - 1]) / 1000);
    }
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    return Math.round(60 / avg);
  })();

  // Last 10 stroke intervals in seconds
  const intervals = (() => {
    const recent = taps.slice(-11);
    const result: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      result.push((recent[i] - recent[i - 1]) / 1000);
    }
    return result.reverse();
  })();

  // Format elapsed: mm:ss.d
  const fmtElapsed = (ms: number) => {
    const total = ms / 1000;
    const m = Math.floor(total / 60);
    const s = Math.floor(total % 60);
    const d = Math.floor((total % 1) * 10);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${d}`;
  };

  // Rate color relative to target
  const target = parseInt(targetRate);
  const rateColor = (() => {
    if (!rate || !target || isNaN(target)) return "text-white";
    const diff = Math.abs(rate - target);
    if (diff <= 1) return "text-green-400";
    if (diff <= 2) return "text-yellow-400";
    return "text-red-400";
  })();

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] min-h-[500px] bg-[#0a1628] rounded-2xl overflow-hidden select-none">
      {/* Top bar: timer + target */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <div className="font-mono text-3xl font-bold text-white tracking-widest">
          {fmtElapsed(elapsed)}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            placeholder="Target"
            value={targetRate}
            onChange={e => setTargetRate(e.target.value)}
            className="w-20 h-9 bg-white/10 border border-white/20 rounded-lg px-2 text-white text-sm text-center placeholder:text-white/40 focus:outline-none focus:border-white/50"
            style={{ fontSize: "16px" }}
          />
          <span className="text-white/40 text-xs">spm</span>
        </div>
      </div>

      {/* Control buttons */}
      <div className="flex gap-2 px-4 pb-3 shrink-0">
        {taps.length > 0 && (
          <button
            onClick={handleStartStop}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white/10 text-white text-sm font-medium active:bg-white/20 transition-colors"
          >
            {running ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {running ? "Pause" : "Resume"}
          </button>
        )}
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white/10 text-white text-sm font-medium active:bg-white/20 transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
      </div>

      {/* STROKE button — takes up most of the vertical space */}
      <button
        onPointerDown={handleStroke}
        className="flex-1 mx-4 rounded-2xl flex items-center justify-center transition-colors active:scale-[0.99] cursor-pointer touch-manipulation"
        style={{
          minHeight: 250,
          backgroundColor: flash ? "#2d6be4" : "#0a1628",
          border: "3px solid rgba(255,255,255,0.15)",
          transition: flash ? "none" : "background-color 0.15s ease",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <span
          className="font-bold text-white pointer-events-none"
          style={{ fontSize: 52, letterSpacing: "0.04em" }}
        >
          STROKE
        </span>
      </button>

      {/* Rate display */}
      <div className="shrink-0 px-4 pt-4 pb-2 text-center">
        <div className={`font-black tabular-nums leading-none ${rateColor}`} style={{ fontSize: 80 }}>
          {rate !== null ? rate : "—"}
        </div>
        <div className="text-white/50 text-sm font-medium mt-1">spm</div>
        {target && rate && !isNaN(target) && (
          <div className={`text-xs mt-0.5 ${rateColor}`}>
            {rate === target ? "On target" : `${rate > target ? "+" : ""}${rate - target} spm`}
          </div>
        )}
      </div>

      {/* Interval history */}
      {intervals.length > 0 && (
        <div className="shrink-0 px-4 pb-4">
          <div className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Last intervals (s)</div>
          <div className="flex flex-wrap gap-1.5">
            {intervals.map((iv, i) => (
              <span key={i} className="text-xs font-mono bg-white/10 text-white/70 px-2 py-0.5 rounded-md">
                {iv.toFixed(2)}
              </span>
            ))}
          </div>
        </div>
      )}

      {taps.length === 0 && (
        <div className="shrink-0 pb-4 text-center text-white/30 text-xs">
          Tap STROKE at every catch or finish to begin
        </div>
      )}
    </div>
  );
}

// ─── Calculator Registry ──────────────────────────────────────────────────────

type CalcId =
  | "stroke-watch"
  | "split"
  | "predictor-2k"
  | "weight-adj"
  | "pace-watts"
  | "zones"
  | "stroke-rate"
  | "race-plan"
  | "equivalency"
  | "wkg"
  | "timeline";

const CALCS: {
  id: CalcId;
  label: string;
  icon: React.ElementType;
  description: string;
}[] = [
  {
    id: "stroke-watch",
    label: "Stroke Watch",
    icon: Radio,
    description: "Tap to measure real-time stroke rate on the water",
  },
  {
    id: "split",
    label: "Split Calculator",
    icon: SplitSquareVertical,
    description: "Two-way split ↔ total time for any distance",
  },
  {
    id: "predictor-2k",
    label: "2K Predictor",
    icon: Zap,
    description: "AI-powered conservative 2K prediction",
  },
  {
    id: "weight-adj",
    label: "Weight Adjustment",
    icon: Weight,
    description: "Predict 2K time at target body weight",
  },
  {
    id: "pace-watts",
    label: "Pace & Watts",
    icon: Gauge,
    description: "Convert split to watts and back",
  },
  {
    id: "zones",
    label: "Training Zones",
    icon: Target,
    description: "UT2, UT1, AT, TR, AN, SP zones from 2K",
  },
  {
    id: "stroke-rate",
    label: "Stroke Rate",
    icon: Activity,
    description: "Analyze efficiency at your rate and pace",
  },
  {
    id: "race-plan",
    label: "Race Splits Planner",
    icon: Trophy,
    description: "Plan your 2K race 500m by 500m",
  },
  {
    id: "equivalency",
    label: "Erg Equivalency",
    icon: ArrowLeftRight,
    description: "Compare RowErg, SkiErg, BikeErg efforts",
  },
  {
    id: "wkg",
    label: "W/kg Ratio",
    icon: BarChart3,
    description: "Power-to-weight and performance benchmarks",
  },
  {
    id: "timeline",
    label: "Improvement Timeline",
    icon: TrendingUp,
    description: "AI roadmap to your goal 2K time",
  },
];

// ─── Main CalculatorsSection ──────────────────────────────────────────────────

export function CalculatorsSection({
  initialTab,
  profile,
}: {
  initialTab?: string;
  profile?: any;
}) {
  const [activeCalc, setActiveCalc] = useState<CalcId>(
    (initialTab as CalcId | undefined) ?? "split"
  );

  const { data: prefillData } = useQuery<PrefillData>({
    queryKey: ["calculators-prefill", profile?.id],
    queryFn: async (): Promise<PrefillData> => {
      const user = await getSessionUser();
      if (!user) return {};

      const [vtRes, ergRes] = await Promise.all([
        supabase
          .from("verified_times")
          .select("distance, time_achieved")
          .eq("user_id", user.id)
          .eq("verification_status", "verified")
          .order("time_achieved", { ascending: true }),
        supabase
          .from("erg_workouts")
          .select("distance, workout_date")
          .eq("user_id", user.id)
          .gte(
            "workout_date",
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
          ),
      ]);

      const times = vtRes.data ?? [];
      const ergWorkouts = ergRes.data ?? [];

      const best2kRow = times
        .filter((t) => t.distance === 2000)
        .sort((a, b) => (a.time_achieved as number) - (b.time_achieved as number))[0];

      const best6kRow = times
        .filter((t) => t.distance === 6000)
        .sort((a, b) => (a.time_achieved as number) - (b.time_achieved as number))[0];

      const toSec = (raw: any): number => {
        if (typeof raw === "number") return raw;
        if (typeof raw === "string") return parseTime(raw) ?? 0;
        return 0;
      };

      const best2kSec = best2kRow ? toSec(best2kRow.time_achieved) : 0;
      const best6kSec = best6kRow ? toSec(best6kRow.time_achieved) : 0;

      // Weekly volume: total meters in last 30 days / ~4.3 weeks
      const totalMeters30d = ergWorkouts.reduce(
        (sum, w) => sum + ((w as any).distance ?? 0),
        0
      );
      const weeklyVolume = totalMeters30d > 0 ? totalMeters30d / 4.3 : undefined;

      return {
        best2k: best2kSec > 0 ? fmtTime(best2kSec) : undefined,
        best6k: best6kSec > 0 ? fmtTime(best6kSec) : undefined,
        weeklyVolume,
        age: profile?.age ?? undefined,
        weight: profile?.weight ?? undefined,
        height: profile?.height ?? undefined,
        gender: profile?.gender ?? undefined,
      };
    },
    enabled: !!profile?.id,
    staleTime: 5 * 60 * 1000,
  });

  const prefill: PrefillData = prefillData ?? {
    age: profile?.age,
    weight: profile?.weight,
    height: profile?.height,
    gender: profile?.gender,
  };

  const activeCalcDef = CALCS.find((c) => c.id === activeCalc)!;

  const renderCalc = () => {
    switch (activeCalc) {
      case "stroke-watch":
        return <StrokeWatch />;
      case "split":
        return <SplitCalc prefill={prefill} />;
      case "predictor-2k":
        return <TwokPredictor prefill={prefill} />;
      case "weight-adj":
        return <WeightAdjCalc prefill={prefill} />;
      case "pace-watts":
        return <PaceWattsCalc prefill={prefill} />;
      case "zones":
        return <TrainingZonesCalc prefill={prefill} />;
      case "stroke-rate":
        return <StrokeRateCalc prefill={prefill} />;
      case "race-plan":
        return <RaceSplitPlanner prefill={prefill} />;
      case "equivalency":
        return <ErgEquivalency prefill={prefill} />;
      case "wkg":
        return <WkgRatio prefill={prefill} />;
      case "timeline":
        return <ImprovementTimeline prefill={prefill} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Calculators</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Professional rowing tools — all free, instant results
        </p>
      </div>

      <div className="flex gap-6">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col w-52 shrink-0 space-y-0.5">
          {CALCS.map((c) => {
            const isActive = activeCalc === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setActiveCalc(c.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <c.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : ""}`} />
                <span className="leading-tight">{c.label}</span>
              </button>
            );
          })}
        </aside>

        <div className="flex-1 min-w-0 space-y-4">
          {/* Mobile tab bar */}
          <div className="md:hidden overflow-x-auto pb-1">
            <div className="flex gap-1 w-max">
              {CALCS.map((c) => {
                const isActive = activeCalc === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveCalc(c.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      isActive
                        ? "bg-primary text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    <c.icon className="h-3.5 w-3.5" />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {renderCalc()}
        </div>
      </div>
    </div>
  );
}
