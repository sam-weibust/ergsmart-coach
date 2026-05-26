import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function fmt(n: number) { return n.toFixed(4); }

export function ApiCostDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["api-cost-dashboard"],
    queryFn: async () => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [todayRes, weekRes, monthRes, byFuncRes, cacheRes, topUsersRes] = await Promise.all([
        supabase.from("api_usage_log").select("cost_usd").gte("created_at", todayStart).eq("cache_hit", false),
        supabase.from("api_usage_log").select("cost_usd").gte("created_at", weekStart).eq("cache_hit", false),
        supabase.from("api_usage_log").select("cost_usd").gte("created_at", monthStart).eq("cache_hit", false),
        supabase.from("api_usage_log").select("function_name, cost_usd, cache_hit").gte("created_at", monthStart),
        supabase.from("api_usage_log").select("cache_hit").gte("created_at", monthStart),
        supabase.from("api_usage_log").select("user_id, cost_usd").gte("created_at", monthStart).eq("cache_hit", false),
      ]);

      const sum = (rows: any[]) => rows?.reduce((acc, r) => acc + (Number(r.cost_usd) || 0), 0) ?? 0;
      const todayCost = sum(todayRes.data || []);
      const weekCost = sum(weekRes.data || []);
      const monthCost = sum(monthRes.data || []);

      // Cost by function
      const funcMap: Record<string, number> = {};
      for (const row of byFuncRes.data || []) {
        if (!row.cache_hit) funcMap[row.function_name] = (funcMap[row.function_name] || 0) + Number(row.cost_usd || 0);
      }
      const byFunction = Object.entries(funcMap).sort((a, b) => b[1] - a[1]).slice(0, 10);

      // Cache hit rate
      const total = cacheRes.data?.length ?? 0;
      const hits = cacheRes.data?.filter((r: any) => r.cache_hit).length ?? 0;
      const cacheHitRate = total > 0 ? Math.round((hits / total) * 100) : 0;

      // Top users
      const userMap: Record<string, number> = {};
      for (const row of topUsersRes.data || []) {
        if (row.user_id) userMap[row.user_id] = (userMap[row.user_id] || 0) + Number(row.cost_usd || 0);
      }
      const topUsers = Object.entries(userMap).sort((a, b) => b[1] - a[1]).slice(0, 10);

      // Estimated monthly cost (extrapolate from this month's spend)
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const daysPassed = now.getDate();
      const estimatedMonthly = daysPassed > 0 ? (monthCost / daysPassed) * daysInMonth : 0;

      return { todayCost, weekCost, monthCost, byFunction, cacheHitRate, topUsers, total, hits, estimatedMonthly };
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading cost data...</div>;

  return (
    <div className="p-4 space-y-4 max-w-4xl">
      <h2 className="text-xl font-semibold">API Cost Dashboard</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-1 pt-3 px-3"><CardTitle className="text-xs text-muted-foreground">Today</CardTitle></CardHeader>
          <CardContent className="px-3 pb-3"><p className="text-2xl font-bold">${fmt(data?.todayCost ?? 0)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-3"><CardTitle className="text-xs text-muted-foreground">This Week</CardTitle></CardHeader>
          <CardContent className="px-3 pb-3"><p className="text-2xl font-bold">${fmt(data?.weekCost ?? 0)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-3"><CardTitle className="text-xs text-muted-foreground">This Month</CardTitle></CardHeader>
          <CardContent className="px-3 pb-3"><p className="text-2xl font-bold">${fmt(data?.monthCost ?? 0)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-3"><CardTitle className="text-xs text-muted-foreground">Est. Monthly</CardTitle></CardHeader>
          <CardContent className="px-3 pb-3"><p className="text-2xl font-bold">${fmt(data?.estimatedMonthly ?? 0)}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm">Cache Performance (this month)</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-3xl font-bold text-green-500">{data?.cacheHitRate ?? 0}%</span>
              <span className="text-sm text-muted-foreground ml-2">hit rate</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {data?.hits ?? 0} hits / {data?.total ?? 0} total requests
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm">Cost by Function (this month)</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-2">
            {(data?.byFunction ?? []).map(([fn, cost]) => (
              <div key={fn} className="flex items-center justify-between text-sm">
                <span className="font-mono text-xs text-muted-foreground">{fn}</span>
                <span className="font-medium">${fmt(cost)}</span>
              </div>
            ))}
            {(data?.byFunction ?? []).length === 0 && <p className="text-sm text-muted-foreground">No data yet</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm">Top 10 Users by API Spend (this month)</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-2">
            {(data?.topUsers ?? []).map(([userId, cost], i) => (
              <div key={userId} className="flex items-center justify-between text-sm">
                <span className="text-xs text-muted-foreground font-mono">#{i + 1} {userId.slice(0, 8)}…</span>
                <span className="font-medium">${fmt(cost)}</span>
              </div>
            ))}
            {(data?.topUsers ?? []).length === 0 && <p className="text-sm text-muted-foreground">No data yet</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
