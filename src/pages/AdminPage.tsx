import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, DollarSign, Loader2, TrendingUp, Database } from "lucide-react";

// Owner-only cost monitoring (Failsafe 7). Gate on the app owner's email.
const ADMIN_EMAILS = ["sam.weibust@gmail.com"];

const DAY_MS = 86_400_000;

interface UsageRow {
  function_name: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_hit: boolean | null;
  cost_usd: number | null;
  user_id: string | null;
  created_at: string;
}

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export default function AdminPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setEmail(session?.user?.email ?? null);
      setAuthChecked(true);
    });
  }, []);

  const isAdmin = !!email && ADMIN_EMAILS.includes(email.toLowerCase());

  const { data, isLoading } = useQuery({
    queryKey: ["admin-ai-usage"],
    enabled: isAdmin,
    queryFn: async () => {
      const since = new Date(Date.now() - 31 * DAY_MS).toISOString();
      const { data, error } = await supabase
        .from("api_usage_log")
        .select("function_name, model, input_tokens, output_tokens, cache_hit, cost_usd, user_id, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(50000);
      if (error) throw error;
      return (data ?? []) as UsageRow[];
    },
  });

  if (!authChecked) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-semibold">Not authorized</h1>
        <p className="text-muted-foreground">This page is restricted to administrators.</p>
        <Button variant="outline" onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
      </div>
    );
  }

  const rows = data ?? [];
  const now = Date.now();
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);

  const inWindow = (r: UsageRow, ms: number) => now - new Date(r.created_at).getTime() <= ms;

  const spendToday = rows
    .filter((r) => new Date(r.created_at).getTime() >= startOfToday.getTime())
    .reduce((s, r) => s + (r.cost_usd ?? 0), 0);
  const spendWeek = rows.filter((r) => inWindow(r, 7 * DAY_MS)).reduce((s, r) => s + (r.cost_usd ?? 0), 0);
  const spendMonth = rows.filter((r) => inWindow(r, 30 * DAY_MS)).reduce((s, r) => s + (r.cost_usd ?? 0), 0);

  // Projected monthly cost at the current 7-day burn rate.
  const projectedMonthly = (spendWeek / 7) * 30;

  // Cache hit rate.
  const totalCalls = rows.length;
  const cacheHits = rows.filter((r) => r.cache_hit).length;
  const cacheHitRate = totalCalls > 0 ? (cacheHits / totalCalls) * 100 : 0;

  // Top 5 functions by 30-day cost.
  const byFn = new Map<string, { cost: number; calls: number }>();
  for (const r of rows) {
    const k = r.function_name ?? "unknown";
    const e = byFn.get(k) ?? { cost: 0, calls: 0 };
    e.cost += r.cost_usd ?? 0;
    e.calls += 1;
    byFn.set(k, e);
  }
  const topFns = [...byFn.entries()].sort((a, b) => b[1].cost - a[1].cost).slice(0, 5);

  // Top 5 users by 30-day cost.
  const byUser = new Map<string, { cost: number; calls: number }>();
  for (const r of rows) {
    if (!r.user_id) continue;
    const e = byUser.get(r.user_id) ?? { cost: 0, calls: 0 };
    e.cost += r.cost_usd ?? 0;
    e.calls += 1;
    byUser.set(r.user_id, e);
  }
  const topUsers = [...byUser.entries()].sort((a, b) => b[1].cost - a[1].cost).slice(0, 5);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">AI Cost Monitor</h1>
          <p className="text-sm text-muted-foreground">Anthropic API spend (last 31 days)</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Spend today" value={usd(spendToday)} icon={<DollarSign className="h-4 w-4" />} />
            <StatCard label="This week" value={usd(spendWeek)} icon={<DollarSign className="h-4 w-4" />} />
            <StatCard label="This month" value={usd(spendMonth)} icon={<DollarSign className="h-4 w-4" />} />
            <StatCard label="Projected / mo" value={usd(projectedMonthly)} icon={<TrendingUp className="h-4 w-4" />} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <StatCard
              label="Cache hit rate"
              value={`${cacheHitRate.toFixed(1)}%`}
              sub={`${cacheHits.toLocaleString()} of ${totalCalls.toLocaleString()} calls served from cache`}
              icon={<Database className="h-4 w-4" />}
            />
            <StatCard
              label="Total AI calls (31d)"
              value={totalCalls.toLocaleString()}
              sub={`${(totalCalls - cacheHits).toLocaleString()} hit the Anthropic API`}
              icon={<TrendingUp className="h-4 w-4" />}
            />
          </div>

          <Card>
            <CardHeader><CardTitle>Top 5 functions by spend</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Function</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topFns.map(([name, e]) => (
                    <TableRow key={name}>
                      <TableCell className="font-mono text-sm">{name}</TableCell>
                      <TableCell className="text-right">{e.calls.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-medium">{usd(e.cost)}</TableCell>
                    </TableRow>
                  ))}
                  {topFns.length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No usage logged yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Top 5 spending users</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topUsers.map(([uid, e]) => (
                    <TableRow key={uid}>
                      <TableCell className="font-mono text-xs">{uid.slice(0, 8)}…</TableCell>
                      <TableCell className="text-right">{e.calls.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-medium">{usd(e.cost)}</TableCell>
                    </TableRow>
                  ))}
                  {topUsers.length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No per-user usage yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground">
            <Badge variant="outline" className="mr-2">beta</Badge>
            Daily per-user limit: 50 calls / 100k tokens. Costs computed from logged token counts.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          {icon && <span className="text-muted-foreground">{icon}</span>}
        </div>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
