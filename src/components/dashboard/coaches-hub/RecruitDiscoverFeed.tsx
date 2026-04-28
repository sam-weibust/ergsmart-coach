import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { edgeFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, SlidersHorizontal } from "lucide-react";
import { AthleteRecruitCard } from "./AthleteRecruitCard";
import { AthleteProfilePanel } from "./AthleteProfilePanel";
import { RecruitFilterPanel } from "./RecruitFilterPanel";
import { AthleteProfile, RecruitFilters } from "./types";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_FILTERS: RecruitFilters = {
  gradYears: [],
  divisionInterest: "",
  location: "",
  twoKMin: "",
  twoKMax: "",
  heightMinCm: "",
  heightMaxCm: "",
  weightMinKg: "",
  weightMaxKg: "",
  hasCombineScore: false,
  searchQuery: "",
  minGpa: "",
  minSat: "",
};

function parseMmSs(val: string): number | null {
  if (!val) return null;
  if (val.includes(":")) {
    const [m, s] = val.split(":").map(Number);
    if (isNaN(m) || isNaN(s)) return null;
    return m * 60 + s;
  }
  const n = parseInt(val);
  return isNaN(n) ? null : n;
}

interface Props {
  coachId: string;
  coachProfile: any;
}

export function RecruitDiscoverFeed({ coachId, coachProfile }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filters, setFilters] = useState<RecruitFilters>(DEFAULT_FILTERS);
  const [selectedAthlete, setSelectedAthlete] = useState<AthleteProfile | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Fetch flagged athlete IDs to exclude
  const { data: flaggedIds } = useQuery({
    queryKey: ["coach-flagged", coachId],
    queryFn: async () => {
      const { data } = await supabase
        .from("coach_flagged_athletes")
        .select("athlete_user_id")
        .eq("coach_id", coachId);
      return (data ?? []).map((r: any) => r.athlete_user_id);
    },
  });

  // Fetch all recruiting athletes
  const { data: rawAthletes, isLoading } = useQuery({
    queryKey: ["recruit-discover"],
    queryFn: async () => {
      const { data: aps } = await supabase
        .from("athlete_profiles")
        .select("*, profiles!inner(full_name, height, weight, experience_level, username)")
        .eq("is_recruiting", true)
        .eq("is_public", true);

      if (!aps?.length) return [];

      const userIds = aps.map((a: any) => a.user_id);

      // Fetch best 2k per athlete
      const { data: ergScores } = await supabase
        .from("erg_scores")
        .select("user_id, time_seconds, watts, watts_per_kg, recorded_at")
        .in("user_id", userIds)
        .eq("test_type", "2k")
        .order("recorded_at", { ascending: false });

      const bestScores: Record<string, any> = {};
      for (const s of ergScores ?? []) {
        if (!bestScores[s.user_id] || s.time_seconds < bestScores[s.user_id].time_seconds) {
          bestScores[s.user_id] = s;
        }
      }

      // Fetch academics
      const { data: academics } = await supabase
        .from("athlete_academics")
        .select("user_id, psat_score, sat_score, act_score, gpa, gpa_weighted, class_rank_numerator, class_rank_denominator, intended_major, academic_interests")
        .in("user_id", userIds);

      const academicsByUser: Record<string, any> = {};
      for (const a of academics ?? []) academicsByUser[a.user_id] = a;

      // Fetch combine scores
      const { data: combines } = await supabase
        .from("combine_entries")
        .select("user_id, virtual_combine_score")
        .in("user_id", userIds)
        .order("created_at", { ascending: false });

      const combineByUser: Record<string, any> = {};
      for (const c of combines ?? []) {
        if (!combineByUser[c.user_id]) combineByUser[c.user_id] = c;
      }

      // Fetch cached relevance scores
      const { data: cachedScores } = await supabase
        .from("recruit_scores")
        .select("athlete_user_id, score, reasoning, expires_at")
        .eq("coach_id", coachId)
        .in("athlete_user_id", userIds)
        .gt("expires_at", new Date().toISOString());

      const scoresByUser: Record<string, any> = {};
      for (const s of cachedScores ?? []) {
        scoresByUser[s.athlete_user_id] = s;
      }

      return aps.map((a: any): AthleteProfile => ({
        ...a,
        best_2k: bestScores[a.user_id] ?? null,
        academics: academicsByUser[a.user_id] ?? null,
        combine_score: combineByUser[a.user_id]?.virtual_combine_score ?? null,
        relevance_score: scoresByUser[a.user_id]?.score ?? null,
        relevance_reasoning: scoresByUser[a.user_id]?.reasoning ?? null,
      }));
    },
  });

  const scoreMutation = useMutation({
    mutationFn: async () => {
      const res = await edgeFetch("score-recruits", { coach_id: coachId });
      if (!res.ok) throw new Error("Score request failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recruit-discover"] });
      toast({ title: "Relevance scores updated" });
    },
    onError: () => toast({ title: "Failed to score recruits", variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    if (!rawAthletes) return [];
    const flagged = new Set(flaggedIds ?? []);
    return rawAthletes
      .filter((a) => !flagged.has(a.user_id))
      .filter((a) => {
        if (filters.gradYears.length && !filters.gradYears.includes(a.grad_year!)) return false;
        if (filters.divisionInterest && a.division_interest !== filters.divisionInterest) return false;
        if (filters.location && !a.location?.toLowerCase().includes(filters.location.toLowerCase())) return false;
        if (filters.hasCombineScore && a.combine_score == null) return false;
        const twoKMin = parseMmSs(filters.twoKMin);
        const twoKMax = parseMmSs(filters.twoKMax);
        const twoKTime = a.best_2k?.time_seconds ?? null;
        if (twoKMin && twoKTime && twoKTime < twoKMin) return false;
        if (twoKMax && twoKTime && twoKTime > twoKMax) return false;
        const hMin = filters.heightMinCm ? Number(filters.heightMinCm) : null;
        const hMax = filters.heightMaxCm ? Number(filters.heightMaxCm) : null;
        const height = a.profiles?.height ?? null;
        if (hMin && height && height < hMin) return false;
        if (hMax && height && height > hMax) return false;
        const wMin = filters.weightMinKg ? Number(filters.weightMinKg) : null;
        const wMax = filters.weightMaxKg ? Number(filters.weightMaxKg) : null;
        const weight = a.profiles?.weight ?? null;
        if (wMin && weight && weight < wMin) return false;
        if (wMax && weight && weight > wMax) return false;
        if (filters.searchQuery) {
          const q = filters.searchQuery.toLowerCase();
          const nameMatch = a.profiles?.full_name?.toLowerCase().includes(q);
          const schoolMatch = a.school?.toLowerCase().includes(q);
          if (!nameMatch && !schoolMatch) return false;
        }
        if (filters.minGpa) {
          const minGpa = parseFloat(filters.minGpa);
          const gpa = a.academics?.gpa ?? a.gpa ?? null;
          if (!gpa || gpa < minGpa) return false;
        }
        if (filters.minSat) {
          const minSat = parseInt(filters.minSat);
          const sat = a.academics?.sat_score ?? null;
          if (!sat || sat < minSat) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const sa = a.relevance_score ?? 0;
        const sb = b.relevance_score ?? 0;
        return sb - sa;
      });
  }, [rawAthletes, filters, flaggedIds]);

  const activeFilterCount = [
    filters.gradYears.length > 0,
    !!filters.divisionInterest,
    !!filters.location,
    !!filters.twoKMin || !!filters.twoKMax,
    !!filters.heightMinCm || !!filters.heightMaxCm,
    !!filters.weightMinKg || !!filters.weightMaxKg,
    filters.hasCombineScore,
    !!filters.minGpa,
    !!filters.minSat,
  ].filter(Boolean).length;

  return (
    <div className="flex gap-4 h-full">
      {/* Filter panel - desktop sidebar */}
      <div className={`hidden lg:block w-56 shrink-0`}>
        <div className="bg-card border border-border rounded-xl p-4 sticky top-0">
          <h3 className="text-sm font-semibold mb-4">Filters</h3>
          <RecruitFilterPanel filters={filters} onChange={setFilters} />
        </div>
      </div>

      <div className="flex-1 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <Badge className="h-4 w-4 p-0 flex items-center justify-center text-[10px]">
                  {activeFilterCount}
                </Badge>
              )}
            </button>
            <span className="text-sm text-muted-foreground">
              {isLoading ? "Loading..." : `${filtered.length} recruits`}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => scoreMutation.mutate()}
            disabled={scoreMutation.isPending}
          >
            {scoreMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
            Score by Fit
          </Button>
        </div>

        {/* Mobile filter panel */}
        {filtersOpen && (
          <div className="lg:hidden bg-card border border-border rounded-xl p-4">
            <RecruitFilterPanel filters={filters} onChange={setFilters} />
          </div>
        )}

        {/* Cards grid */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg font-medium">No recruits found</p>
            <p className="text-sm mt-1">Try adjusting your filters or check back later</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((a) => (
              <AthleteRecruitCard
                key={a.user_id}
                athlete={a}
                onClick={() => setSelectedAthlete(a)}
              />
            ))}
          </div>
        )}
      </div>

      <AthleteProfilePanel
        athlete={selectedAthlete}
        coachId={coachId}
        coachProfile={coachProfile}
        onClose={() => setSelectedAthlete(null)}
        onOpenEmail={(a) => {
          setSelectedAthlete(null);
          // navigate to email section - handled by parent
        }}
      />
    </div>
  );
}
