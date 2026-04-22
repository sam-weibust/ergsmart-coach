import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface WhoopSectionProps {
  userId: string;
}

function fmtDate(d: string) {
  try { return format(parseISO(d), "MMM d"); } catch { return d; }
}

function recoveryColor(s: number | null) {
  if (s == null) return "#6b7280";
  if (s >= 67) return "#10b981";
  if (s >= 34) return "#f59e0b";
  return "#ef4444";
}

function strainColor(s: number | null) {
  if (s == null) return "#6b7280";
  if (s < 10) return "#10b981";
  if (s <= 14) return "#f59e0b";
  return "#ef4444";
}

function TrendIcon({ current, avg }: { current: number | null; avg: number | null }) {
  if (current == null || avg == null) return <Minus className="h-3 w-3 text-muted-foreground" />;
  if (current > avg * 1.03) return <TrendingUp className="h-3 w-3 text-green-500" />;
  if (current < avg * 0.97) return <TrendingDown className="h-3 w-3 text-red-400" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

function CircleScore({ score, color }: { score: number | null; color: string }) {
  const s = score ?? 0;
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (s / 100) * circ;
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
      <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="6" />
      <circle
        cx="40" cy="40" r={r} fill="none"
        stroke={color} strokeWidth="6"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
    </svg>
  );
}

function interpretation(recovery: number | null, strain: number | null, hrv: number | null): string {
  if (recovery == null && strain == null) return "Sync your Whoop to get a training recommendation.";
  const r = recovery ?? 50;
  const s = strain ?? 10;
  if (r >= 67 && s < 10) return "High recovery and low strain — today is ideal for a hard training session.";
  if (r >= 67 && s >= 10 && s <= 14) return "Strong recovery with moderate strain load — you're well positioned to train hard.";
  if (r >= 67 && s > 14) return "Good recovery but high recent strain — consider a moderate session to manage load.";
  if (r >= 34 && r < 67 && s < 10) return "Moderate recovery and low strain — a steady aerobic session is a smart choice today.";
  if (r >= 34 && r < 67 && s >= 10) return "Moderate recovery with elevated strain — a controlled, lower-intensity session is recommended.";
  if (r < 34 && s > 14) return "Low recovery and high strain — prioritize rest or an easy recovery paddle today.";
  if (r < 34) return "Low recovery score — consider a rest day or light cross-training to rebuild.";
  return "Your Whoop data looks balanced — train at your planned intensity today.";
}

export function WhoopSection({ userId }: WhoopSectionProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["whoop-section", userId],
    enabled: !!userId,
    queryFn: async () => {
      console.log("[WhoopSection] querying userId:", userId);

      const [recoveryRes, strainRes, sleepRes] = await Promise.all([
        supabase
          .from("whoop_recovery")
          .select("date,recovery_score,hrv_rmssd,resting_heart_rate,sleep_performance_percentage")
          .eq("user_id", userId)
          .order("date", { ascending: false })
          .limit(14),
        supabase
          .from("whoop_strain")
          .select("date,strain")
          .eq("user_id", userId)
          .order("date", { ascending: false })
          .limit(14),
        supabase
          .from("whoop_sleep")
          .select("date,sleep_performance_percentage,duration_hours")
          .eq("user_id", userId)
          .order("date", { ascending: false })
          .limit(14),
      ]);

      console.log("[WhoopSection] whoop_recovery rows:", recoveryRes.data?.length ?? 0, recoveryRes.error?.message ?? "ok");
      console.log("[WhoopSection] whoop_strain rows:", strainRes.data?.length ?? 0, strainRes.error?.message ?? "ok");
      console.log("[WhoopSection] whoop_sleep rows:", sleepRes.data?.length ?? 0, sleepRes.error?.message ?? "ok");
      if (recoveryRes.data?.[0]) console.log("[WhoopSection] latest recovery row:", JSON.stringify(recoveryRes.data[0]));
      if (strainRes.data?.[0]) console.log("[WhoopSection] latest strain row:", JSON.stringify(strainRes.data[0]));

      return {
        recovery: recoveryRes.data ?? [],
        strain: strainRes.data ?? [],
        sleep: sleepRes.data ?? [],
      };
    },
  });

  if (isLoading) return null;

  const hasAny = (data?.recovery.length ?? 0) > 0 || (data?.strain.length ?? 0) > 0;
  if (!data || !hasAny) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <img src="/whooplogo.png" alt="Whoop" style={{ height: 20, width: "auto" }} />
            Whoop
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No Whoop data yet. Tap <strong>Sync Now</strong> in Settings → Connected Apps.
          </p>
        </CardContent>
      </Card>
    );
  }

  const latestRec = data.recovery[0] ?? null;
  const latestStrain = data.strain[0] ?? null;

  // 7-day averages for trend arrows
  const avg7hrv = data.recovery.slice(0, 7).reduce((s, r) => s + (r.hrv_rmssd ? Number(r.hrv_rmssd) : 0), 0) / Math.max(1, data.recovery.slice(0, 7).filter(r => r.hrv_rmssd).length) || null;
  const avg7rhr = data.recovery.slice(0, 7).reduce((s, r) => s + (r.resting_heart_rate ? Number(r.resting_heart_rate) : 0), 0) / Math.max(1, data.recovery.slice(0, 7).filter(r => r.resting_heart_rate).length) || null;

  // Most recent date across tables
  const latestDate = [latestRec?.date, latestStrain?.date].filter(Boolean).sort().reverse()[0] ?? null;

  // Build 7-day combo chart (oldest → newest)
  const dateSet = new Set<string>();
  [...data.recovery, ...data.strain].forEach(r => dateSet.add(r.date));
  const allDates = Array.from(dateSet).sort().slice(-7);

  const chartData = allDates.map(date => {
    const rec = data.recovery.find(r => r.date === date);
    const str = data.strain.find(s => s.date === date);
    return {
      date: fmtDate(date),
      recovery: rec?.recovery_score != null ? Number(rec.recovery_score) : null,
      strain: str?.strain != null ? parseFloat(Number(str.strain).toFixed(1)) : null,
    };
  });

  const recovScore = latestRec?.recovery_score != null ? Number(latestRec.recovery_score) : null;
  const hrv = latestRec?.hrv_rmssd != null ? Math.round(Number(latestRec.hrv_rmssd)) : null;
  const rhr = latestRec?.resting_heart_rate != null ? Math.round(Number(latestRec.resting_heart_rate)) : null;
  const strain = latestStrain?.strain != null ? parseFloat(Number(latestStrain.strain).toFixed(1)) : null;

  const rColor = recoveryColor(recovScore);
  const sColor = strainColor(strain);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <img src="/whooplogo.png" alt="Whoop" style={{ height: 20, width: "auto" }} />
            Whoop
          </CardTitle>
          {latestDate && (
            <span className="text-xs text-muted-foreground">Last updated {fmtDate(latestDate)}</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* ── 2×2 stat grid ── */}
        <div className="grid grid-cols-2 gap-3">

          {/* Recovery Score */}
          <div className="rounded-xl border p-4 flex items-center gap-3" style={{ borderColor: rColor + "40", background: rColor + "08" }}>
            <div className="relative flex items-center justify-center shrink-0">
              <CircleScore score={recovScore} color={rColor} />
              <span className="absolute text-lg font-bold" style={{ color: rColor }}>
                {recovScore ?? "—"}
              </span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Recovery</p>
              <p className="text-xs font-semibold mt-0.5" style={{ color: rColor }}>
                {recovScore == null ? "—" : recovScore >= 67 ? "Green" : recovScore >= 34 ? "Yellow" : "Red"}
              </p>
            </div>
          </div>

          {/* Daily Strain */}
          <div className="rounded-xl border p-4" style={{ borderColor: sColor + "40", background: sColor + "08" }}>
            <p className="text-xs text-muted-foreground font-medium mb-1">Daily Strain</p>
            <div className="flex items-end gap-1.5 mb-2">
              <span className="text-2xl font-bold" style={{ color: sColor }}>{strain ?? "—"}</span>
              <span className="text-xs text-muted-foreground mb-0.5">/ 21</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-black/8 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{
                width: strain != null ? `${Math.min(100, (strain / 21) * 100)}%` : "0%",
                background: sColor,
              }} />
            </div>
          </div>

          {/* HRV */}
          <div className="rounded-xl border p-4">
            <p className="text-xs text-muted-foreground font-medium mb-1">HRV</p>
            <div className="flex items-end gap-1.5">
              <span className="text-2xl font-bold text-foreground">{hrv ?? "—"}</span>
              {hrv != null && <span className="text-xs text-muted-foreground mb-0.5">ms</span>}
              <span className="mb-0.5 ml-0.5"><TrendIcon current={hrv} avg={avg7hrv} /></span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {avg7hrv != null ? `7-day avg ${Math.round(avg7hrv)} ms` : "7-day avg —"}
            </p>
          </div>

          {/* Resting HR */}
          <div className="rounded-xl border p-4">
            <p className="text-xs text-muted-foreground font-medium mb-1">Resting HR</p>
            <div className="flex items-end gap-1.5">
              <span className="text-2xl font-bold text-foreground">{rhr ?? "—"}</span>
              {rhr != null && <span className="text-xs text-muted-foreground mb-0.5">bpm</span>}
              {/* Lower RHR is better, so flip trend direction */}
              <span className="mb-0.5 ml-0.5">
                {rhr != null && avg7rhr != null
                  ? rhr < avg7rhr * 0.97 ? <TrendingDown className="h-3 w-3 text-green-500" />
                  : rhr > avg7rhr * 1.03 ? <TrendingUp className="h-3 w-3 text-red-400" />
                  : <Minus className="h-3 w-3 text-muted-foreground" />
                  : <Minus className="h-3 w-3 text-muted-foreground" />}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {avg7rhr != null ? `7-day avg ${Math.round(avg7rhr)} bpm` : "7-day avg —"}
            </p>
          </div>
        </div>

        {/* ── 7-day combo chart ── */}
        {chartData.length >= 2 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">7-Day Trend</p>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 8, right: 48, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  yAxisId="recovery"
                  orientation="left"
                  domain={[0, 100]}
                  ticks={[0, 33, 67, 100]}
                  tick={{ fontSize: 10, fill: "#10b981" }}
                  tickLine={false}
                  axisLine={false}
                  label={{ value: "Recovery", angle: -90, position: "insideLeft", offset: 12, style: { fontSize: 10, fill: "#10b981" } }}
                  width={52}
                />
                <YAxis
                  yAxisId="strain"
                  orientation="right"
                  domain={[0, 21]}
                  ticks={[0, 7, 14, 21]}
                  tick={{ fontSize: 10, fill: "#2d6be4" }}
                  tickLine={false}
                  axisLine={false}
                  label={{ value: "Strain", angle: 90, position: "insideRight", offset: 12, style: { fontSize: 10, fill: "#2d6be4" } }}
                  width={44}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e5e7eb", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
                  formatter={(v: number, name: string) => [v, name]}
                />
                <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                <Line
                  yAxisId="recovery" type="monotone" dataKey="recovery" name="Recovery"
                  stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }} connectNulls
                />
                <Line
                  yAxisId="strain" type="monotone" dataKey="strain" name="Strain"
                  stroke="#2d6be4" strokeWidth={2.5} dot={{ r: 3, fill: "#2d6be4", strokeWidth: 0 }} connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── AI interpretation ── */}
        <div className="rounded-lg bg-muted/40 px-4 py-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Training Recommendation</p>
          <p className="text-sm text-foreground leading-relaxed">
            {interpretation(recovScore, strain, hrv)}
          </p>
        </div>

      </CardContent>
    </Card>
  );
}
