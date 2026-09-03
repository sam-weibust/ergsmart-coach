import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { AthleteTabProps } from "./types";
import RaceSection from "@/components/dashboard/RaceSection";
import { RegattasSection } from "@/components/dashboard/regattas/RegattasSection";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Trophy, ShieldCheck, Bluetooth, Swords, AlertCircle, TrendingUp,
} from "lucide-react";

/**
 * COMPETITION TAB — owned by Subagent 5.
 *
 * Two sections via a top-level segmented control:
 *  1. Global Leaderboard — VERIFIED scores only (erg_scores.is_verified=true,
 *     to_leaderboard=true, source in {concept2_sync, live_erg}, profile opted-in).
 *     Filters: distance (2K/5K/6K/10K/60min), gender, age group, weight class.
 *     Rendered as plain bordered rows (no cards/table) with a sticky header
 *     showing the athlete's own rank + split in accent color; their own row
 *     carries an accent left border. Verified-only logic mirrors
 *     src/pages/LeaderboardPage.tsx exactly.
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

// Primary display metric for a score row: total time for distance tests,
// meters for the 60-minute test. This is the value the row spec calls "split".
function scoreLabel(
  testType: string,
  entry: { time_seconds?: number | null; total_meters?: number | null } | null | undefined,
): string {
  if (!entry) return "—";
  if (testType === "60min") {
    return entry.total_meters ? `${entry.total_meters}m` : "—";
  }
  return fmtTime(entry.time_seconds ?? null);
}

function VerifiedSourceBadge({ source }: { source: string }) {
  if (source === "concept2_sync") {
    return (
      <ShieldCheck
        className="h-4 w-4 text-subtle shrink-0"
        strokeWidth={1.5}
        aria-label="Verified via Concept2 Logbook"
      />
    );
  }
  return (
    <Bluetooth
      className="h-4 w-4 text-subtle shrink-0"
      strokeWidth={1.5}
      aria-label="Verified via live PM5"
    />
  );
}

// ── Sticky "my rank + split" header ────────────────────────────────────────────
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
      <div className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b border-border bg-background px-4 py-3">
        <TrendingUp className="h-4 w-4 shrink-0 text-subtle" strokeWidth={1.5} />
        <div className="min-w-0">
          <p className="text-sm text-foreground">You're not ranked yet</p>
          <p className="text-sm text-muted-foreground">
            Sync a verified {DISTANCES.find((d) => d.value === testType)?.label} from
            Concept2 or race a live PM5 to appear on the leaderboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-3">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="data-value shrink-0 text-2xl text-primary">
          {rank ? `#${rank}` : "—"}
        </span>
        <span className="shrink-0 text-sm text-muted-foreground">of {total}</span>
        {percentile != null && (
          <span className="shrink-0 text-sm text-primary">
            Top {Math.max(1, 100 - percentile)}%
          </span>
        )}
      </div>
      <span className="data-value shrink-0 text-lg text-primary">
        {scoreLabel(testType, score)}
      </span>
    </div>
  );
}

// ── One leaderboard row ────────────────────────────────────────────────────────
function LeaderboardRow({
  entry,
  rank,
  isMe,
  testType,
}: {
  entry: any;
  rank: number;
  isMe: boolean;
  testType: string;
}) {
  const p = entry.profiles;
  return (
    <Link
      to={`/athlete/${p?.username || ""}`}
      className={`flex min-h-[44px] items-center gap-3 border-b border-l-4 border-border py-2.5 pl-3 pr-1 transition-colors hover:bg-surface-1 ${
        isMe ? "border-l-primary bg-primary/5" : "border-l-transparent"
      }`}
    >
      <span className="w-8 shrink-0 text-center text-sm text-subtle">{rank}</span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-base text-foreground">
            {p?.full_name || p?.username || "Anonymous"}
          </span>
          {isMe && <span className="shrink-0 text-sm text-primary">(you)</span>}
          <VerifiedSourceBadge source={entry.source} />
        </div>
        {p?.country && (
          <span className="text-sm text-muted-foreground">{p.country}</span>
        )}
      </div>
      <span className="data-value shrink-0 text-base text-right text-foreground">
        {scoreLabel(testType, entry)}
      </span>
    </Link>
  );
}

function LeaderboardRowSkeleton() {
  return (
    <div className="flex min-h-[44px] items-center gap-3 border-b border-l-4 border-border border-l-transparent py-2.5 pl-3 pr-1">
      <div className="h-3.5 w-4 shrink-0 animate-pulse rounded bg-surface-2" />
      <div className="min-w-0 flex-1">
        <div className="h-4 w-32 max-w-full animate-pulse rounded bg-surface-2" />
      </div>
      <div className="h-4 w-14 shrink-0 animate-pulse rounded bg-surface-2" />
    </div>
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
      {/* Rank + split summary, sticky at the top */}
      <MyRankSummary testType={testType} sorted={sorted} userId={userId} />

      {/* Integrity note */}
      <div className="flex items-start gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-subtle" strokeWidth={1.5} />
        <span>
          All times verified via Concept2 Logbook sync or live PM5 connection.
          Manual entries are not eligible.
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={testType} onValueChange={setTestType}>
          <SelectTrigger className="h-11 w-[108px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DISTANCES.map((d) => (
              <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={gender} onValueChange={setGender}>
          <SelectTrigger className="h-11 w-[100px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {GENDERS.map((g) => (
              <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ageGroup} onValueChange={setAgeGroup}>
          <SelectTrigger className="h-11 w-[150px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {AGE_GROUPS.map((a) => (
              <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={weightClass} onValueChange={setWeightClass}>
          <SelectTrigger className="h-11 w-[140px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {WEIGHT_CLASSES.map((w) => (
              <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Rows — no card/table, thin border-bottom between rows */}
      {isLoading ? (
        <div>
          <LeaderboardRowSkeleton />
          <LeaderboardRowSkeleton />
          <LeaderboardRowSkeleton />
        </div>
      ) : displayed.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No verified scores found for this filter.
        </div>
      ) : (
        <div>
          {displayed.map((entry, i) => (
            <LeaderboardRow
              key={entry.id}
              entry={entry}
              rank={i + 1}
              isMe={entry.user_id === userId}
              testType={testType}
            />
          ))}
          {userId && !userInTop && displayed.length >= 100 && (
            <div className="border-t border-border py-3 text-center text-sm text-muted-foreground">
              Your row is outside the top 100 — see your rank above.
            </div>
          )}
        </div>
      )}

      {sorted.length > 0 && (
        <p className="text-center text-sm text-muted-foreground">
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
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
        <button
          onClick={() => setView("leaderboard")}
          className={`flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors ${
            view === "leaderboard"
              ? "bg-surface-3 text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Trophy className="h-5 w-5" strokeWidth={1.5} /> Leaderboard
        </button>
        <button
          onClick={() => setView("race")}
          className={`flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors ${
            view === "race"
              ? "bg-surface-3 text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Swords className="h-5 w-5" strokeWidth={1.5} /> Race (H2H)
        </button>
      </div>

      {view === "leaderboard" ? (
        userId ? (
          <GlobalVerifiedLeaderboard userId={userId} />
        ) : (
          <div className="flex flex-col items-center gap-1.5 py-12 text-center">
            <AlertCircle className="h-6 w-6 text-subtle" strokeWidth={1.5} />
            <p className="text-base text-foreground">Sign in required</p>
            <p className="text-sm text-muted-foreground">
              Sign in to view the global leaderboard.
            </p>
          </div>
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
