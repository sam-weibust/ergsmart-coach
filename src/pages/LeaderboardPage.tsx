import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { getSessionUser } from "@/lib/getUser";
import {
  Trophy, Medal, Award, ShieldCheck, Bluetooth, ChevronLeft, Flag,
  Users, ToggleLeft, ToggleRight, AlertCircle
} from "lucide-react";

// ── Distance tabs ────────────────────────────────────────────────────────────
const DISTANCE_TABS = [
  { id: "2k",    label: "2000m",    testType: "2k" },
  { id: "5k",    label: "5000m",    testType: "5k" },
  { id: "6k",    label: "6000m",    testType: "6k" },
  { id: "10k",   label: "10000m",   testType: "10k" },
  { id: "60min", label: "60 min",   testType: "60min" },
  { id: "custom",label: "Custom",   testType: "custom" },
  { id: "teams", label: "Teams",    testType: "" },
];

const AGE_GROUPS = [
  { value: "all",      label: "All Ages" },
  { value: "junior",   label: "Junior (U18)" },
  { value: "u23",      label: "U23" },
  { value: "senior",   label: "Senior" },
  { value: "masters40",label: "Masters 40+" },
  { value: "masters50",label: "Masters 50+" },
  { value: "masters60",label: "Masters 60+" },
];

const GENDERS = [
  { value: "all",    label: "All" },
  { value: "male",   label: "Men" },
  { value: "female", label: "Women" },
];

const WEIGHT_CLASSES = [
  { value: "all",         label: "All" },
  { value: "open",        label: "Open Weight" },
  { value: "lightweight", label: "Lightweight" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(secs: number | null): string {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = (secs % 60).toFixed(1);
  return `${m}:${s.padStart(4, "0")}`;
}

function fmtSplit(splitSecs: number | null): string {
  if (!splitSecs) return "—";
  return fmtTime(splitSecs);
}

function getAgeGroup(age: number | null): string {
  if (!age) return "Senior";
  if (age < 18) return "Junior";
  if (age < 23) return "U23";
  if (age < 40) return "Senior";
  if (age < 50) return "Masters 40+";
  if (age < 60) return "Masters 50+";
  return "Masters 60+";
}

function getAgeGroupKey(age: number | null): string {
  if (!age) return "senior";
  if (age < 18) return "junior";
  if (age < 23) return "u23";
  if (age < 40) return "senior";
  if (age < 50) return "masters40";
  if (age < 60) return "masters50";
  return "masters60";
}

function isLightweight(gender: string | null, weightKg: number | null): boolean {
  if (!weightKg) return false;
  if (gender === "female") return weightKg < 59;
  return weightKg < 72.5;
}

function getInitials(name: string | null, username: string | null): string {
  const n = name || username || "?";
  return n.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
}

// ── Source badge ─────────────────────────────────────────────────────────────

function VerifiedBadge({ source }: { source: string }) {
  const label = source === "concept2_sync"
    ? "Verified via Concept2 Logbook"
    : "Verified via Live PM5";
  const icon = source === "concept2_sync"
    ? <ShieldCheck className="h-3 w-3" />
    : <Bluetooth className="h-3 w-3" />;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-0.5 text-emerald-600 cursor-default">
          {icon}
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

// ── Rank icon ────────────────────────────────────────────────────────────────

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
  if (rank === 3) return <Award className="h-5 w-5 text-amber-600" />;
  return <span className="text-sm font-bold text-muted-foreground w-5 text-center">{rank}</span>;
}

// ── Flag dialog ──────────────────────────────────────────────────────────────

function FlagDialog({ scoreId }: { scoreId: string }) {
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const flag = useMutation({
    mutationFn: async () => {
      const user = await getSessionUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("leaderboard_flags").insert({
        score_id: scoreId,
        flagged_by: user.id,
        reason: reason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast({ title: "Reported" }); setOpen(false); setReason(""); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-6 w-6 opacity-40 hover:opacity-100">
          <Flag className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Report Suspicious Result</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Reason (optional)</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} />
          </div>
          <Button className="w-full" onClick={() => flag.mutate()} disabled={flag.isPending}>
            Submit Report
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Your ranking card ────────────────────────────────────────────────────────

function YourRankingCard({ testType, entries, userId }: {
  testType: string;
  entries: any[];
  userId: string;
}) {
  const myEntry = entries.find(e => e.user_id === userId);
  const myRank = entries.findIndex(e => e.user_id === userId) + 1;

  const { data: myBest } = useQuery({
    queryKey: ["my-best-score", testType, userId],
    enabled: !myEntry && !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("erg_scores")
        .select("time_seconds, total_meters, watts, watts_per_kg, source, recorded_at")
        .eq("user_id", userId)
        .eq("test_type", testType)
        .eq("is_verified", true)
        .order("time_seconds", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: myRankData } = useQuery({
    queryKey: ["my-rank", testType, userId, myBest?.time_seconds],
    enabled: !myEntry && !!myBest?.time_seconds,
    queryFn: async () => {
      const { count } = await supabase
        .from("erg_scores")
        .select("id", { count: "exact", head: true })
        .eq("test_type", testType)
        .eq("is_verified", true)
        .eq("to_leaderboard", true)
        .lt("time_seconds", myBest!.time_seconds);
      return (count ?? 0) + 1;
    },
  });

  const score = myEntry || myBest;
  const rank = myEntry ? myRank : myRankData;
  const total = entries.length;
  const percentile = rank && total ? Math.round((1 - (rank - 1) / total) * 100) : null;

  if (!score) return null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-primary">Your Ranking</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold">{rank ? `#${rank}` : "—"}</div>
            <div className="text-xs text-muted-foreground">Global Rank</div>
          </div>
          <div>
            <div className="text-2xl font-mono font-bold">
              {testType === "60min"
                ? score.total_meters ? `${score.total_meters}m` : "—"
                : fmtTime(score.time_seconds)}
            </div>
            <div className="text-xs text-muted-foreground">Best Score</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{percentile ? `${percentile}%` : "—"}</div>
            <div className="text-xs text-muted-foreground">Percentile</div>
          </div>
          <div>
            <div className="text-2xl font-bold">
              {rank && rank > 1 ? `#${rank - 1}` : "Top"}
            </div>
            <div className="text-xs text-muted-foreground">Next Rank</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main leaderboard table ───────────────────────────────────────────────────

function LeaderboardTable({
  entries,
  testType,
  rankByWattsPerKg,
  userId,
}: {
  entries: any[];
  testType: string;
  rankByWattsPerKg: boolean;
  userId: string | null;
}) {
  const userInTop = entries.some(e => e.user_id === userId);

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-12">Rank</TableHead>
            <TableHead>Athlete</TableHead>
            <TableHead>Time</TableHead>
            <TableHead className="hidden sm:table-cell">Watts</TableHead>
            <TableHead className="hidden sm:table-cell">W/kg</TableHead>
            <TableHead className="hidden md:table-cell">Split</TableHead>
            <TableHead className="hidden lg:table-cell">Age Group</TableHead>
            <TableHead className="hidden lg:table-cell">Class</TableHead>
            <TableHead className="hidden xl:table-cell">Date</TableHead>
            <TableHead className="w-8"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                No verified scores found for this filter.
              </TableCell>
            </TableRow>
          ) : (
            entries.map((entry, i) => {
              const isMe = entry.user_id === userId;
              const p = entry.profiles;
              const age = p?.age ?? null;
              const ageGroup = getAgeGroup(age);
              const lw = isLightweight(p?.gender, p?.weight_kg);
              return (
                <TableRow
                  key={entry.id}
                  className={`${i < 3 ? "bg-primary/5" : ""} ${isMe ? "ring-1 ring-inset ring-primary" : ""}`}
                >
                  <TableCell>
                    <div className="flex items-center justify-center">
                      <RankIcon rank={i + 1} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold shrink-0">
                        {getInitials(p?.full_name, p?.username)}
                      </div>
                      <div>
                        <Link
                          to={`/athlete/${p?.username || ""}`}
                          className="font-medium hover:underline text-sm leading-tight block"
                        >
                          {p?.full_name || p?.username || "Anonymous"}
                          {isMe && <span className="ml-1 text-xs text-primary">(you)</span>}
                        </Link>
                        {p?.country && (
                          <span className="text-xs text-muted-foreground">{p.country}</span>
                        )}
                      </div>
                      <VerifiedBadge source={entry.source} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono font-bold">
                      {testType === "60min"
                        ? entry.total_meters ? `${entry.total_meters}m` : "—"
                        : fmtTime(entry.time_seconds)}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm">
                    {entry.watts ? `${Math.round(entry.watts)}W` : "—"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm">
                    {entry.watts_per_kg ? parseFloat(entry.watts_per_kg).toFixed(2) : "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell font-mono text-sm">
                    {fmtSplit(entry.avg_split_seconds)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge variant="secondary" className="text-xs">{ageGroup}</Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge variant="outline" className="text-xs">{lw ? "LW" : "Open"}</Badge>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
                    {entry.recorded_at
                      ? new Date(entry.recorded_at).toLocaleDateString()
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <FlagDialog scoreId={entry.id} />
                  </TableCell>
                </TableRow>
              );
            })
          )}
          {/* Pinned user row at bottom if not visible in top 100 */}
          {userId && !userInTop && entries.length >= 100 && (
            <TableRow className="ring-1 ring-inset ring-primary bg-primary/5 border-t-2 border-primary/20">
              <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-2">
                Your row is outside the top 100 — see "Your Ranking" card above
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Teams tab ────────────────────────────────────────────────────────────────

function TeamsLeaderboard() {
  const { data: teams = [], isLoading } = useQuery({
    queryKey: ["teams-leaderboard"],
    queryFn: async () => {
      // Get all verified 2k scores joined with team membership
      const { data: scores } = await supabase
        .from("erg_scores")
        .select(`
          user_id, time_seconds, watts,
          profiles!inner(id, full_name)
        `)
        .eq("test_type", "2k")
        .eq("is_verified", true)
        .eq("to_leaderboard", true)
        .order("time_seconds", { ascending: true });

      if (!scores) return [];

      // Get best per user
      const bestByUser: Record<string, number> = {};
      for (const s of scores) {
        if (!bestByUser[s.user_id] || s.time_seconds < bestByUser[s.user_id]) {
          bestByUser[s.user_id] = s.time_seconds;
        }
      }

      // Get team memberships
      const { data: memberships } = await supabase
        .from("team_members")
        .select("user_id, team_id, teams!inner(id, name, location: description)");

      if (!memberships) return [];

      // Group by team
      const teamMap: Record<string, { name: string; location: string; members: number[] }> = {};
      for (const m of memberships) {
        const t = m.teams as any;
        if (!teamMap[m.team_id]) teamMap[m.team_id] = { name: t.name, location: t.location || "", members: [] };
        if (bestByUser[m.user_id]) teamMap[m.team_id].members.push(bestByUser[m.user_id]);
      }

      return Object.entries(teamMap)
        .filter(([, v]) => v.members.length >= 3)
        .map(([id, v]) => ({
          id,
          name: v.name,
          location: v.location,
          athleteCount: v.members.length,
          avg2k: v.members.reduce((a, b) => a + b, 0) / v.members.length,
        }))
        .sort((a, b) => a.avg2k - b.avg2k);
    },
  });

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-12">Rank</TableHead>
            <TableHead>Program</TableHead>
            <TableHead>Avg 2K</TableHead>
            <TableHead>Athletes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {teams.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                No teams with 3+ verified athletes yet.
              </TableCell>
            </TableRow>
          ) : (
            teams.map((t, i) => (
              <TableRow key={t.id} className={i < 3 ? "bg-primary/5" : ""}>
                <TableCell>
                  <div className="flex items-center justify-center">
                    <RankIcon rank={i + 1} />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{t.name}</div>
                  {t.location && <div className="text-xs text-muted-foreground">{t.location}</div>}
                </TableCell>
                <TableCell className="font-mono font-bold">{fmtTime(t.avg2k)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3 text-muted-foreground" />
                    <span>{t.athleteCount}</span>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Full leaderboard per distance ─────────────────────────────────────────────

function DistanceLeaderboard({ testType, userId }: { testType: string; userId: string | null }) {
  const [gender, setGender] = useState("all");
  const [ageGroup, setAgeGroup] = useState("all");
  const [weightClass, setWeightClass] = useState("all");
  const [rankByWattsPerKg, setRankByWattsPerKg] = useState(false);

  const { data: raw = [], isLoading } = useQuery({
    queryKey: ["leaderboard", testType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erg_scores")
        .select(`
          id, user_id, test_type, time_seconds, total_meters, avg_split_seconds,
          watts, watts_per_kg, recorded_at, source,
          profiles!inner(id, full_name, username, weight_kg, gender, country, age, leaderboard_opt_in)
        `)
        .eq("test_type", testType)
        .eq("is_verified", true)
        .eq("to_leaderboard", true)
        .eq("profiles.leaderboard_opt_in", true)
        .order("time_seconds", { ascending: testType !== "60min" })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
  });

  // Deduplicate: best per user
  const deduped = useMemo(() => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const e of raw) {
      if (!seen.has(e.user_id)) {
        seen.add(e.user_id);
        out.push(e);
      }
    }
    return out;
  }, [raw]);

  // Filter
  const filtered = useMemo(() => {
    return deduped.filter(e => {
      const p = e.profiles;
      if (gender !== "all" && p?.gender !== gender) return false;
      if (ageGroup !== "all" && getAgeGroupKey(p?.age) !== ageGroup) return false;
      if (weightClass !== "all") {
        const lw = isLightweight(p?.gender, p?.weight_kg);
        if (weightClass === "lightweight" && !lw) return false;
        if (weightClass === "open" && lw) return false;
      }
      return true;
    });
  }, [deduped, gender, ageGroup, weightClass]);

  // Sort
  const sorted = useMemo(() => {
    if (!rankByWattsPerKg) return filtered;
    return [...filtered].sort((a, b) => (parseFloat(b.watts_per_kg) || 0) - (parseFloat(a.watts_per_kg) || 0));
  }, [filtered, rankByWattsPerKg]);

  const displayed = sorted.slice(0, 100);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 p-3 bg-muted/30 rounded-lg border border-border">
        <Select value={gender} onValueChange={setGender}>
          <SelectTrigger className="w-[90px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {GENDERS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={ageGroup} onValueChange={setAgeGroup}>
          <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {AGE_GROUPS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={weightClass} onValueChange={setWeightClass}>
          <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {WEIGHT_CLASSES.map(w => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <button
          onClick={() => setRankByWattsPerKg(v => !v)}
          className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-border bg-background text-xs font-medium hover:bg-muted transition-colors"
        >
          {rankByWattsPerKg
            ? <><ToggleRight className="h-4 w-4 text-primary" /> W/kg rank</>
            : <><ToggleLeft className="h-4 w-4 text-muted-foreground" /> Time rank</>}
        </button>
      </div>

      {/* Your ranking card */}
      {userId && (
        <YourRankingCard testType={testType} entries={sorted} userId={userId} />
      )}

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading leaderboard…</div>
      ) : (
        <LeaderboardTable
          entries={displayed}
          testType={testType}
          rankByWattsPerKg={rankByWattsPerKg}
          userId={userId}
        />
      )}

      {sorted.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {displayed.length} of {sorted.length} verified athletes
        </p>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("2k");

  const { data: userId } = useQuery({
    queryKey: ["current-user-id"],
    queryFn: async () => {
      const u = await getSessionUser();
      return u?.id ?? null;
    },
  });

  const activeTab = DISTANCE_TABS.find(t => t.id === tab)!;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="gap-1">
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Button>
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold">Global Leaderboard</h1>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Integrity note */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900 text-sm text-emerald-800 dark:text-emerald-300">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            All times verified via Concept2 Logbook sync or live PM5 connection.
            Manual entries are not eligible.
          </span>
        </div>

        {/* Distance tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex flex-wrap h-auto gap-1 bg-muted p-1">
            {DISTANCE_TABS.map(t => (
              <TabsTrigger key={t.id} value={t.id} className="text-xs sm:text-sm">
                {t.id === "teams" ? <><Users className="h-3.5 w-3.5 mr-1" />{t.label}</> : t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {DISTANCE_TABS.filter(t => t.id !== "teams").map(t => (
            <TabsContent key={t.id} value={t.id} className="mt-4">
              <DistanceLeaderboard testType={t.testType} userId={userId ?? null} />
            </TabsContent>
          ))}

          <TabsContent value="teams" className="mt-4">
            <TeamsLeaderboard />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
