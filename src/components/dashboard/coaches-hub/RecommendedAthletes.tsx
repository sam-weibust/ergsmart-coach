import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { edgeFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, RefreshCw, Sparkles, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AthleteProfilePanel } from "./AthleteProfilePanel";
import { AthleteProfile } from "./types";
import { fmtSeconds } from "./utils";

interface Props {
  coachId: string;
  coachProfile: any;
}

export function RecommendedAthletes({ coachId, coachProfile }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<AthleteProfile | null>(null);

  const { data: recommendations, isLoading } = useQuery({
    queryKey: ["coach-recommendations", coachId],
    queryFn: async () => {
      const { data: recs } = await supabase
        .from("coach_recommendations")
        .select("*")
        .eq("coach_id", coachId)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      if (!recs?.length) return [];

      const ids = recs.map((r: any) => r.athlete_user_id);
      const { data: aps } = await supabase
        .from("athlete_profiles")
        .select("*, profiles!inner(full_name, height, weight, experience_level, username, role, user_type)")
        .in("user_id", ids)
        .neq("profiles.role" as any, "coach")
        .neq("profiles.user_type" as any, "coach");

      const { data: ergScores } = await supabase
        .from("erg_scores")
        .select("user_id, time_seconds, watts, watts_per_kg, recorded_at")
        .in("user_id", ids)
        .eq("test_type", "2k")
        .order("recorded_at", { ascending: false });

      const bestScores: Record<string, any> = {};
      for (const s of ergScores ?? []) {
        if (!bestScores[s.user_id] || s.time_seconds < bestScores[s.user_id].time_seconds) {
          bestScores[s.user_id] = s;
        }
      }

      const { data: combines } = await supabase
        .from("combine_entries")
        .select("user_id, virtual_combine_score")
        .in("user_id", ids);
      const combineByUser: Record<string, any> = {};
      for (const c of combines ?? []) { if (!combineByUser[c.user_id]) combineByUser[c.user_id] = c; }

      const apMap: Record<string, any> = {};
      for (const ap of aps ?? []) { apMap[ap.user_id] = ap; }

      return recs.map((rec: any) => {
        const ap = apMap[rec.athlete_user_id];
        return {
          ...(ap ?? { user_id: rec.athlete_user_id, profiles: null }),
          best_2k: bestScores[rec.athlete_user_id] ?? null,
          combine_score: combineByUser[rec.athlete_user_id]?.virtual_combine_score ?? null,
          reasoning: rec.reasoning,
          gap_addressed: rec.gap_addressed,
        };
      });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await edgeFetch("recommend-recruits", { coach_id: coachId });
      if (!res.ok) throw new Error("Recommendation request failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coach-recommendations"] });
      toast({ title: "Recommendations refreshed" });
    },
    onError: () => toast({ title: "Failed to get recommendations", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">AI-powered recommendations based on your roster gaps</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
        >
          {refreshMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : !recommendations?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <Sparkles className="h-10 w-10 mx-auto mb-3 text-primary/40" />
          <p className="text-lg font-medium">No recommendations yet</p>
          <p className="text-sm mt-1 mb-4">Fill out your program profile and roster, then click Refresh</p>
          <Button onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
            {refreshMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
            Generate Recommendations
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {recommendations.map((rec: any) => {
            const name = rec.profiles?.full_name ?? "Athlete";
            return (
              <Card
                key={rec.user_id}
                className="cursor-pointer hover:border-primary/40 hover:shadow-md transition-all"
                onClick={() => setSelected(rec)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[rec.school, rec.location].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {rec.best_2k && (
                      <span className="text-xs font-semibold text-primary shrink-0">
                        {fmtSeconds(rec.best_2k.time_seconds)}
                      </span>
                    )}
                  </div>

                  {rec.gap_addressed && (
                    <Badge variant="outline" className="text-xs w-full justify-center">
                      {rec.gap_addressed}
                    </Badge>
                  )}

                  {rec.reasoning && (
                    <div className="bg-primary/5 rounded-lg p-2.5 text-xs text-foreground flex gap-1.5">
                      <Sparkles className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                      <p className="line-clamp-3">{rec.reasoning}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AthleteProfilePanel
        athlete={selected}
        coachId={coachId}
        coachProfile={coachProfile}
        onClose={() => setSelected(null)}
        onOpenEmail={() => setSelected(null)}
      />
    </div>
  );
}
