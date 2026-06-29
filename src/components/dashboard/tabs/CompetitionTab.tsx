import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { AthleteTabProps } from "./types";
import RaceSection from "@/components/dashboard/RaceSection";
import { RegattasSection } from "@/components/dashboard/regattas/RegattasSection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Trophy, Medal, Award, ShieldCheck, Bluetooth, Swords, AlertCircle, TrendingUp,
} from "lucide-react";

/**
 * COMPETITION TAB — owned by Subagent 5.
 *
 * Two sections via a top-level segmented control:
 *  1. Global Leaderboard — VERIFIED scores only (erg_scores.is_verified=true,
 *     to_leaderboard=true, source in {concept2_sync, live_erg}, profile opted-in).
 *     Filters: distance (2K/5K/6K/10K/60min), gender, age group, weight class.
 *     The athlete's own row is highlighted; their rank + percentile shown at the
 *     TOP. Verified-only logic mirrors src/pages/LeaderboardPage.tsx exactly.
 *  2. Head-to-Head Racing — reuses <RaceSection /> (create/join room + matchmaking).
 *
 * Props: see AthleteTabProps in ./types.ts (uses userId + profile for highlight).
 */

// ── Distance options (matches LeaderboardPage testTypes) ──────────────────────
const DISTANCES = [
  { value: "2k", label: "2K" },
  { value: "5k", label: "5K" },
  { value: "6k", label: "6K" },
  { value: "10k", label: "10K" },
  { value: "60min", label: "60 min" },
];

const GENDERS = [
  { value: "all", label: "All" },
  { value: "male", label: "Men" },
  { value: "female", label: "Women" },
];

const AGE_GROUPS = [
  { value: "all", label: "All Ages" },
  { value: "junior", label: "Junior (U18)" },
  { value: "u23", label: "U23" },
  { value: "senior", label: "Senior" },
  { value: "masters40", label: "Masters 40+" },
  { value: "masters50", label: "Masters 50+" },
  { value: "masters60", label: "Masters 60+" },
];

const WEIGHT_CLASSES = [
  { value: "all", label: "All" },
  { value: "open", label: "Open Weight" },
  { value: "lightweight", label: "Lightweight" },
];

// ── Helpers (mirror LeaderboardPage) ──────────────────────────────────────────
function fmtTime(secs: number | null): string {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = (secs % 60).toFixed(1);
  return `${m}:${s.padStart(4, "0")}`;
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
  return n.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
}

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
  if (rank === 3) return <Award className="h-5 w-5 text-amber-600" />;
  return <span className="text-sm font-bold text-muted-foreground w-5 text-center">{rank}</span>;
}

function VerifiedSourceBadge({ source }: { source: string }) {
  if (source === "concept2_sync") {
    return <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-label="Verified via Concept2 Logbook" />;
  }
  return <Bluetooth className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-label="Verified via Live PM5" />;
}

// ── Rank + percentile summary (TOP of leaderboard) ────────────────────────────
function MyRankSummary({
  testType,
  sorted,
  userId,
}: {
  testType: string;
  sorted: any[];
  userId: string;
}) {
  const myIndex = sorted.findIndex((e) => e.user_id === userId);
  const myEntry = myIndex >= 0 ? sorted[myIndex] : null;

  // If user is not in the (filtered) top list, fetch their best verified score + global rank.
  const { data: fallback } = useQuery({
    queryKey: ["competition-my-rank", testType, userId],
    enabled: !myEntry && !!userId,
    queryFn: async () => {
      const { data: best } = await supabase
        .from("erg_scores")
        .select("time_seconds, total_meters")
        .eq("user_id", userId)
        .eq("test_type", testType)
        .eq("is_verified", true)
        .eq("to_leaderboard", true)
        .order("time_seconds", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!best?.time_seconds) return null;
      const { count } = await supabase
        .from("erg_scores")
        .select("id", { count: "exact", head: true })
        .eq("test_type", testType)
        .eq("is_verified", true)
        .eq("to_leaderboard", true)
        .lt("time_seconds", best.time_seconds);
      return { best, rank: (count ?? 0) + 1 };
    },
  });

  const total = sorted.length;
  const rank = myEntry ? myIndex + 1 : fallback?.rank ?? null;
  const score = myEntry ?? fallback?.best ?? null;
  const percentile =
    rank && total ? Math.round((1 - (rank - 1) / total) * 100) : null;

  if (!score) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="p-2 rounded-full bg-muted text-muted-foreground">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium">You're not ranked yet</p>
            <p className="text-xs text-muted-foreground">
              Sync a verified {DISTANCES.find((d) => d.value === testType)?.label} from
              Concept2 or race a live PM5 to appear on the leaderboard.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const pctColor =
    percentile != null && percentile >= 75
      ? "text-green-600 bg-green-500/10 border-green-500/20"
      : percentile != null && percentile >= 40
      ? "text-yellow-600 bg-yellow-500/10 border-yellow-500/20"
      : "text-primary bg-primary/5 border-primary/20";

  return (
    <Card className={`border ${pctColor}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${pctColor}`}>
            <TrendingUp className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">My Rank</p>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mt-1">
              <span className="text-2xl font-bold font-mono">
                {rank ? `#${rank}` : "—"}
              </span>
              <span className="text-sm text-muted-foreground">of {total}</span>
              {percentile != null && (
                <span className="text-lg font-semibold">
                  Top {Math.max(1, 100 - percentile)}%
                </span>
              )}
              <span className="text-sm font-mono ml-auto">
                {testType === "60min"
                  ? score.total_meters
                    ? `${score.total_meters}m`
                    : "—"
                  : fmtTime(score.time_seconds)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Global (verified) leaderboard ─────────────────────────────────────────────
function GlobalVerifiedLeaderboard({ userId }: { userId: string }) {
  const [testType, setTestType] = useState("2k");
  const [gender, setGender] = useState("all");
  const [ageGroup, setAgeGroup] = useState("all");
  const [weightClass, setWeightClass] = useState("all");

  // VERIFIED-ONLY query — identical filter to LeaderboardPage:
  //   is_verified=true AND to_leaderboard=true AND profile opted in.
  // source is always 'concept2_sync' or 'live_erg' for verified rows ('manual'
  // can never be is_verified=true), so verified == C2 sync or live PM5.
  const { data: raw = [], isLoading } = useQuery({
    queryKey: ["competition-leaderboard", testType],
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

  // Best per user, then apply filters.
  const sorted = useMemo(() => {
    const seen = new Set<string>();
    const deduped: any[] = [];
    for (const e of raw) {
      if (!seen.has(e.user_id)) {
        seen.add(e.user_id);
        deduped.push(e);
      }
    }
    return deduped.filter((e) => {
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
  }, [raw, gender, ageGroup, weightClass]);

  const displayed = sorted.slice(0, 100);
  const userInTop = displayed.some((e) => e.user_id === userId);

  return (
    <div className="space-y-4">
      {/* Integrity note */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900 text-sm text-emerald-800 dark:text-emerald-300">
        <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          All times verified via Concept2 Logbook sync or live PM5 connection.
          Manual entries are not eligible.
        </span>
      </div>

      {/* Rank + percentile summary at the TOP */}
      <MyRankSummary testType={testType} sorted={sorted} userId={userId} />

      {/* Filters */}
      <div className="flex flex-wrap gap-2 p-3 bg-muted/30 rounded-lg border border-border">
        <Select value={testType} onValueChange={setTestType}>
          <SelectTrigger className="w-[100px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DISTANCES.map((d) => (
              <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={gender} onValueChange={setGender}>
          <SelectTrigger className="w-[90px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {GENDERS.map((g) => (
              <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ageGroup} onValueChange={setAgeGroup}>
          <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {AGE_GROUPS.map((a) => (
              <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={weightClass} onValueChange={setWeightClass}>
          <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {WEIGHT_CLASSES.map((w) => (
              <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading leaderboard…</div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-12">Rank</TableHead>
                <TableHead>Athlete</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="hidden sm:table-cell">W/kg</TableHead>
                <TableHead className="hidden md:table-cell">Split</TableHead>
                <TableHead className="hidden lg:table-cell">Age Group</TableHead>
                <TableHead className="hidden lg:table-cell">Class</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayed.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No verified scores found for this filter.
                  </TableCell>
                </TableRow>
              ) : (
                displayed.map((entry, i) => {
                  const isMe = entry.user_id === userId;
                  const p = entry.profiles;
                  const ageGrp = getAgeGroup(p?.age ?? null);
                  const lw = isLightweight(p?.gender, p?.weight_kg);
                  return (
                    <TableRow
                      key={entry.id}
                      className={`${i < 3 ? "bg-primary/5" : ""} ${isMe ? "ring-1 ring-inset ring-primary bg-primary/10" : ""}`}
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
                          <div className="min-w-0">
                            <Link
                              to={`/athlete/${p?.username || ""}`}
                              className="font-medium hover:underline text-sm leading-tight block truncate"
                            >
                              {p?.full_name || p?.username || "Anonymous"}
                              {isMe && <span className="ml-1 text-xs text-primary">(you)</span>}
                            </Link>
                            {p?.country && (
                              <span className="text-xs text-muted-foreground">{p.country}</span>
                            )}
                          </div>
                          <VerifiedSourceBadge source={entry.source} />
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
                        {entry.watts_per_kg ? parseFloat(entry.watts_per_kg).toFixed(2) : "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-sm">
                        {fmtTime(entry.avg_split_seconds)}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Badge variant="secondary" className="text-xs">{ageGrp}</Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Badge variant="outline" className="text-xs">{lw ? "LW" : "Open"}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
              {userId && !userInTop && displayed.length >= 100 && (
                <TableRow className="ring-1 ring-inset ring-primary bg-primary/5 border-t-2 border-primary/20">
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-2">
                    Your row is outside the top 100 — see "My Rank" card above
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {sorted.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {displayed.length} of {sorted.length} verified athletes
        </p>
      )}
    </div>
  );
}

// ── Tab container ─────────────────────────────────────────────────────────────
type View = "leaderboard" | "race";

export default function CompetitionTab({ userId, profile }: AthleteTabProps) {
  const [view, setView] = useState<View>("leaderboard");

  return (
    <div className="p-4 pb-28 space-y-4 max-w-5xl mx-auto">
      {/* Segmented control */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-xl">
        <button
          onClick={() => setView("leaderboard")}
          className={`flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-medium transition-colors ${
            view === "leaderboard"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Trophy className="h-4 w-4" /> Leaderboard
        </button>
        <button
          onClick={() => setView("race")}
          className={`flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-medium transition-colors ${
            view === "race"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Swords className="h-4 w-4" /> Race (H2H)
        </button>
      </div>

      {view === "leaderboard" ? (
        userId ? (
          <GlobalVerifiedLeaderboard userId={userId} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertCircle className="h-4 w-4" /> Sign in required
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Sign in to view the global leaderboard.
            </CardContent>
          </Card>
        )
      ) : (
        // Head-to-Head racing.
        <RaceSection />
      )}

      {/* Regattas — always visible regardless of selected segment. */}
      <div className="pt-2 border-t border-border">
        <RegattasSection profile={profile} isCoach={false} />
      </div>
    </div>
  );
}
