import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { format, parseISO } from "date-fns";

interface WhoopSectionProps {
  userId: string;
}

function recoveryColor(score: number | null) {
  if (!score) return "#6b7280";
  if (score >= 67) return "#10b981";
  if (score >= 34) return "#f59e0b";
  return "#ef4444";
}

function recoveryLabel(score: number | null) {
  if (!score) return "—";
  if (score >= 67) return "Green";
  if (score >= 34) return "Yellow";
  return "Red";
}

function fmtDate(dateStr: string) {
  try { return format(parseISO(dateStr), "MMM d"); } catch { return dateStr; }
}

export function WhoopSection({ userId }: WhoopSectionProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["whoop-section", userId],
    enabled: !!userId,
    queryFn: async () => {
      console.log("[WhoopSection] querying for userId:", userId);

      const [recoveryRes, sleepRes, strainRes] = await Promise.all([
        supabase
          .from("whoop_recovery")
          .select("date,recovery_score,hrv_rmssd,resting_heart_rate,sleep_performance_percentage")
          .eq("user_id", userId)
          .order("date", { ascending: false })
          .limit(14),
        supabase
          .from("whoop_sleep")
          .select("date,sleep_performance_percentage,duration_hours")
          .eq("user_id", userId)
          .order("date", { ascending: false })
          .limit(14),
        supabase
          .from("whoop_strain")
          .select("date,strain")
          .eq("user_id", userId)
          .order("date", { ascending: false })
          .limit(14),
      ]);

      console.log("[WhoopSection] recovery rows:", recoveryRes.data?.length ?? 0, "error:", recoveryRes.error?.message ?? null);
      console.log("[WhoopSection] sleep rows:", sleepRes.data?.length ?? 0, "error:", sleepRes.error?.message ?? null);
      console.log("[WhoopSection] strain rows:", strainRes.data?.length ?? 0, "error:", strainRes.error?.message ?? null);
      if (recoveryRes.data?.length) console.log("[WhoopSection] most recent recovery row:", recoveryRes.data[0]);
      if (strainRes.data?.length) console.log("[WhoopSection] most recent strain row:", strainRes.data[0]);

      return {
        recovery: recoveryRes.data || [],
        sleep: sleepRes.data || [],
        strain: strainRes.data || [],
      };
    },
  });

  if (isLoading) return null;

  if (error) {
    console.error("[WhoopSection] query error:", error);
  }

  // Show card even if only strain or sleep data exists
  const hasAnyData = (data?.recovery.length ?? 0) > 0 || (data?.strain.length ?? 0) > 0 || (data?.sleep.length ?? 0) > 0;

  if (!data || !hasAnyData) {
    return (
      <Card className="border-[#1a1a2e]/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <img src="/whooplogo.png" alt="Whoop" style={{ height: 20, width: "auto" }} />
            Whoop
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No Whoop data yet. Tap <strong>Sync Now</strong> in Settings → Connected Apps, or wait for your next Whoop cycle to be scored (usually overnight).
          </p>
        </CardContent>
      </Card>
    );
  }

  // Most recent record from whichever table has data
  const today = data.recovery[0] ?? null;
  const todayStrain = data.strain[0] ?? null;
  const todaySleep = data.sleep[0] ?? null;

  // Most recent date across all tables
  const mostRecentDate = [today?.date, todayStrain?.date, todaySleep?.date]
    .filter(Boolean)
    .sort()
    .reverse()[0] ?? null;

  // Build 7-day chart data (oldest to newest)
  const last7Recovery = [...data.recovery].slice(0, 7).reverse();
  const last7Sleep = [...data.sleep].slice(0, 7).reverse();

  const hrvData = last7Recovery.map(r => ({
    date: fmtDate(r.date),
    hrv: r.hrv_rmssd ? parseFloat(Number(r.hrv_rmssd).toFixed(1)) : null,
  }));

  const sleepPerfData = last7Sleep.map(s => ({
    date: fmtDate(s.date),
    sleep: s.sleep_performance_percentage ? parseFloat(Number(s.sleep_performance_percentage).toFixed(0)) : null,
  }));

  // Build strain vs recovery balance
  const balanceMap: Record<string, { date: string; strain: number | null; recovery: number | null }> = {};
  for (const r of last7Recovery) {
    const label = fmtDate(r.date);
    balanceMap[label] = { date: label, recovery: r.recovery_score ?? null, strain: null };
  }
  for (const s of [...data.strain].slice(0, 7).reverse()) {
    const label = fmtDate(s.date);
    if (balanceMap[label]) balanceMap[label].strain = s.strain ? parseFloat(Number(s.strain).toFixed(1)) : null;
    else balanceMap[label] = { date: label, recovery: null, strain: s.strain ? parseFloat(Number(s.strain).toFixed(1)) : null };
  }
  const balanceData = Object.values(balanceMap).slice(-7);

  const scoreColor = recoveryColor(today?.recovery_score ?? null);

  return (
    <Card className="border-[#1a1a2e]/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <img src="/whooplogo.png" alt="Whoop" style={{ height: 20, width: "auto" }} />
          Whoop
          <Badge variant="outline" className="text-xs font-normal">Source: Whoop</Badge>
          {mostRecentDate && (
            <span className="text-xs text-muted-foreground font-normal ml-auto">
              Data from {fmtDate(mostRecentDate)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Today's Recovery Score */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="col-span-2 sm:col-span-1 p-3 rounded-lg border text-center" style={{ borderColor: scoreColor + "40", background: scoreColor + "10" }}>
            <div className="text-3xl font-bold" style={{ color: scoreColor }}>
              {today?.recovery_score ?? "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Recovery Score</div>
            {today?.recovery_score && (
              <Badge className="mt-1 text-[10px] border-0" style={{ background: scoreColor + "30", color: scoreColor }}>
                {recoveryLabel(today.recovery_score)}
              </Badge>
            )}
            {today?.date && <p className="text-[10px] text-muted-foreground mt-1">{fmtDate(today.date)}</p>}
          </div>
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <div className="text-xl font-bold">
              {today?.hrv_rmssd ? parseFloat(Number(today.hrv_rmssd).toFixed(0)) : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">HRV (ms)</div>
            {today?.date && <p className="text-[10px] text-muted-foreground">{fmtDate(today.date)}</p>}
          </div>
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <div className="text-xl font-bold">{today?.resting_heart_rate ?? "—"}</div>
            <div className="text-xs text-muted-foreground mt-1">Resting HR</div>
            {today?.date && <p className="text-[10px] text-muted-foreground">{fmtDate(today.date)}</p>}
          </div>
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <div className="text-xl font-bold">
              {todayStrain?.strain
                ? parseFloat(Number(todayStrain.strain).toFixed(1))
                : today?.sleep_performance_percentage
                  ? `${parseFloat(Number(today.sleep_performance_percentage).toFixed(0))}%`
                  : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {todayStrain?.strain ? "Strain" : "Sleep Perf."}
            </div>
            {(todayStrain?.date ?? today?.date) && (
              <p className="text-[10px] text-muted-foreground">{fmtDate(todayStrain?.date ?? today?.date ?? "")}</p>
            )}
          </div>
        </div>

        {/* HRV Trend */}
        {hrvData.some(d => d.hrv !== null) && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">HRV Trend (7 days)</p>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={hrvData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                  formatter={(v: number) => [`${v} ms`, "HRV"]}
                />
                <Line type="monotone" dataKey="hrv" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Sleep Performance Trend */}
        {sleepPerfData.some(d => d.sleep !== null) && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Sleep Performance (7 days)</p>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={sleepPerfData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                  formatter={(v: number) => [`${v}%`, "Sleep Performance"]}
                />
                <Line type="monotone" dataKey="sleep" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Strain vs Recovery Balance */}
        {balanceData.length >= 2 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Strain vs Recovery Balance</p>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={balanceData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="recovery" name="Recovery (0-100)" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="strain" name="Strain (0-21)" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
