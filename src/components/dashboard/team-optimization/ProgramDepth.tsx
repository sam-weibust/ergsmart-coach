import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface Props {
  teamId: string;
  teamName: string;
  teamMembers: any[];
  isCoach: boolean;
  profile: any;
}

const ProgramDepth = ({ teamId, teamMembers }: Props) => {
  const allAthletes = teamMembers.map((m: any) => m.profile || m).filter(Boolean);
  const currentYear = new Date().getFullYear();

  const { data: ergScores = [] } = useQuery({
    queryKey: ["erg-scores-depth", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("erg_scores")
        .select("user_id, watts, test_type, recorded_at")
        .eq("team_id", teamId)
        .eq("test_type", "2k")
        .order("recorded_at", { ascending: false });
      return data || [];
    },
  });

  // Graduation year chart data
  const gradYearCounts: Record<number, number> = {};
  for (const a of allAthletes) {
    if (a.graduation_year) {
      gradYearCounts[a.graduation_year] = (gradYearCounts[a.graduation_year] || 0) + 1;
    }
  }
  const gradChartData = Object.entries(gradYearCounts)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([year, count]) => ({ year, count, yearsLeft: Number(year) - currentYear }));

  // Side preference depth chart
  const portAthletes = allAthletes.filter(a => a.side_preference === "port");
  const starboardAthletes = allAthletes.filter(a => a.side_preference === "starboard");
  const bothAthletes = allAthletes.filter(a => !a.side_preference || a.side_preference === "both");
  const coxAthletes = allAthletes.filter(a => a.position_preference === "cox");

  // Latest erg per athlete
  const latestErg: Record<string, any> = {};
  for (const s of ergScores) {
    if (!latestErg[s.user_id]) latestErg[s.user_id] = s;
  }

  // Watts distribution buckets
  const wattsRanges = [
    { label: "<150W", min: 0, max: 150 },
    { label: "150-175W", min: 150, max: 175 },
    { label: "175-200W", min: 175, max: 200 },
    { label: "200-225W", min: 200, max: 225 },
    { label: "225-250W", min: 225, max: 250 },
    { label: ">250W", min: 250, max: Infinity },
  ];
  const wattsDistribution = wattsRanges.map(range => ({
    label: range.label,
    count: Object.values(latestErg).filter(e => {
      const w = Number(e.watts) || 0;
      return w >= range.min && w < range.max;
    }).length,
  }));

  // Program health score
  const hasGradBalance = gradChartData.length >= 3;
  const hasSideBalance = Math.abs(portAthletes.length - starboardAthletes.length) <= 2;
  const hasCox = coxAthletes.length >= 1;
  const hasDepth = allAthletes.length >= 8;
  const healthScore = [hasGradBalance, hasSideBalance, hasCox, hasDepth].filter(Boolean).length * 25;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Program Depth</h2>
        <p className="text-sm text-muted-foreground">Roster health, depth chart, and graduation pipeline</p>
      </div>

      {/* Health score */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Program Health Score</CardTitle>
          <CardDescription>Based on graduation balance, side balance, coxswain pipeline, and roster size</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="text-4xl font-bold text-primary">{healthScore}</div>
            <div className="flex-1">
              <Progress value={healthScore} className="h-3 mb-2" />
              <div className="grid grid-cols-2 gap-1 text-xs">
                <div className="flex items-center gap-1">
                  <span className={hasGradBalance ? "text-green-500" : "text-muted-foreground"}>●</span>
                  Graduation balance
                </div>
                <div className="flex items-center gap-1">
                  <span className={hasSideBalance ? "text-green-500" : "text-muted-foreground"}>●</span>
                  Port/starboard balance
                </div>
                <div className="flex items-center gap-1">
                  <span className={hasCox ? "text-green-500" : "text-muted-foreground"}>●</span>
                  Coxswain pipeline
                </div>
                <div className="flex items-center gap-1">
                  <span className={hasDepth ? "text-green-500" : "text-muted-foreground"}>●</span>
                  Roster depth (8+ athletes)
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Graduation timeline */}
      {gradChartData.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Graduation Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={gradChartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" name="Athletes" radius={[4, 4, 0, 0]}>
                  {gradChartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.yearsLeft <= 1 ? "hsl(var(--destructive))" : entry.yearsLeft <= 2 ? "#f59e0b" : "hsl(var(--primary))"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-3 text-xs text-muted-foreground mt-2 justify-center">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-destructive inline-block" />Graduating ≤1yr</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400 inline-block" />≤2yrs</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary inline-block" />3+ years</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Depth chart */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" />Depth by Side</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm">Port ({portAthletes.length})</span>
                <span className="text-xs text-muted-foreground">{allAthletes.length ? Math.round(portAthletes.length / allAthletes.length * 100) : 0}%</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {portAthletes.map(a => <Badge key={a.id} variant="outline" className="text-xs">{a.full_name || a.username || "—"}</Badge>)}
                {portAthletes.length === 0 && <span className="text-xs text-muted-foreground">None specified</span>}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm">Starboard ({starboardAthletes.length})</span>
                <span className="text-xs text-muted-foreground">{allAthletes.length ? Math.round(starboardAthletes.length / allAthletes.length * 100) : 0}%</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {starboardAthletes.map(a => <Badge key={a.id} variant="outline" className="text-xs">{a.full_name || a.username || "—"}</Badge>)}
                {starboardAthletes.length === 0 && <span className="text-xs text-muted-foreground">None specified</span>}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm">Both / No Pref ({bothAthletes.length})</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {bothAthletes.slice(0, 6).map(a => <Badge key={a.id} variant="secondary" className="text-xs">{a.full_name || a.username || "—"}</Badge>)}
                {bothAthletes.length > 6 && <Badge variant="secondary" className="text-xs">+{bothAthletes.length - 6}</Badge>}
              </div>
            </div>
            {coxAthletes.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm">Coxswains ({coxAthletes.length})</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {coxAthletes.map(a => <Badge key={a.id} className="text-xs">{a.full_name || a.username || "—"}</Badge>)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">2K Watts Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.values(latestErg).length === 0 ? (
              <p className="text-center text-muted-foreground py-6 text-sm">No 2K scores logged yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={wattsDistribution}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Athletes" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProgramDepth;
