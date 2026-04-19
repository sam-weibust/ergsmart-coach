import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Loader2, User, Activity } from "lucide-react";
import { AthleteProfilePanel } from "./AthleteProfilePanel";
import { AthleteProfile } from "./types";
import { fmtSeconds } from "./utils";

interface Props {
  coachId: string;
  coachProfile: any;
}

export function FollowedAthletes({ coachId, coachProfile }: Props) {
  const [selected, setSelected] = useState<AthleteProfile | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["coach-followed-athletes", coachId],
    queryFn: async () => {
      const { data: follows } = await supabase
        .from("coach_followed_athletes")
        .select("athlete_user_id, created_at, last_viewed_at")
        .eq("coach_id", coachId)
        .order("created_at", { ascending: false });

      if (!follows?.length) return [];

      const ids = follows.map((f: any) => f.athlete_user_id);
      const viewedAtMap: Record<string, string> = {};
      for (const f of follows) viewedAtMap[f.athlete_user_id] = f.last_viewed_at;

      const { data: aps } = await supabase
        .from("athlete_profiles")
        .select("*, profiles!inner(full_name, height, weight, experience_level, username)")
        .in("user_id", ids);

      if (!aps?.length) return [];

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

      // Recent erg workouts since last viewed
      const { data: recentWorkouts } = await supabase
        .from("erg_workouts")
        .select("user_id, workout_date, avg_split")
        .in("user_id", ids)
        .order("workout_date", { ascending: false });

      const newWorkoutsByUser: Record<string, boolean> = {};
      for (const w of recentWorkouts ?? []) {
        const lastViewed = viewedAtMap[w.user_id];
        if (!lastViewed || new Date(w.workout_date) > new Date(lastViewed)) {
          newWorkoutsByUser[w.user_id] = true;
        }
      }

      const { data: combines } = await supabase
        .from("combine_entries")
        .select("user_id, virtual_combine_score")
        .in("user_id", ids);
      const combineByUser: Record<string, any> = {};
      for (const c of combines ?? []) { if (!combineByUser[c.user_id]) combineByUser[c.user_id] = c; }

      return aps.map((ap: any): AthleteProfile & { hasNewActivity: boolean } => ({
        ...ap,
        best_2k: bestScores[ap.user_id] ?? null,
        combine_score: combineByUser[ap.user_id]?.virtual_combine_score ?? null,
        hasNewActivity: newWorkoutsByUser[ap.user_id] ?? false,
      }));
    },
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (!data?.length) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-lg font-medium">No followed athletes yet</p>
        <p className="text-sm mt-1">Follow athletes from the Discover feed to track them here</p>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-2">
        {data.map((athlete: any) => {
          const name = athlete.profiles?.full_name ?? "Athlete";
          return (
            <button
              key={athlete.user_id}
              onClick={() => setSelected(athlete)}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                {athlete.avatar_url ? (
                  <img src={athlete.avatar_url} alt={name} className="w-full h-full object-cover rounded-full" />
                ) : (
                  <User className="h-5 w-5 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold truncate">{name}</p>
                  {athlete.hasNewActivity && (
                    <Badge className="text-[10px] h-4 bg-primary px-1.5">New Activity</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {[athlete.school, athlete.location].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-semibold text-foreground">
                  {athlete.best_2k ? fmtSeconds(athlete.best_2k.time_seconds) : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">Best 2k</p>
              </div>
              {athlete.hasNewActivity && (
                <Activity className="h-4 w-4 text-primary shrink-0" />
              )}
            </button>
          );
        })}
      </div>

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
