import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Zap, Trophy, Calendar, TrendingUp, Flame, Target } from "lucide-react";
import { toast } from "sonner";
import { startOfWeek, format } from "date-fns";

function getWeekStart(): string {
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  return format(monday, "yyyy-MM-dd");
}

const challengeTypeLabels: Record<string, { label: string; icon: any; unit: string }> = {
  fastest_2k_improvement: { label: "Fastest 2k Improvement", icon: Zap, unit: "seconds improved" },
  most_meters: { label: "Most Meters Logged", icon: TrendingUp, unit: "meters" },
  consistent_splits: { label: "Most Consistent Splits", icon: Target, unit: "split variance (lower = better)" },
  highest_wpk_gain: { label: "Highest W/kg Gain", icon: Flame, unit: "watts/kg gained" },
};

const WeeklyChallengeSection = () => {
  const queryClient = useQueryClient();
  const weekStart = getWeekStart();
  const [entryValue, setEntryValue] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
  });

  const { data: challenge, isLoading: challengeLoading } = useQuery({
    queryKey: ["weekly-challenge", weekStart],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("weekly_challenges")
        .select("*")
        .eq("week_start", weekStart)
        .maybeSingle();
      return data;
    },
  });

  const { data: leaderboard } = useQuery({
    queryKey: ["challenge-leaderboard", challenge?.id],
    enabled: !!challenge?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("challenge_entries")
        .select("*, profiles(username, full_name)")
        .eq("challenge_id", challenge.id)
        .order("value", { ascending: challenge.challenge_type === "consistent_splits" });
      return data || [];
    },
  });

  const { data: myEntry } = useQuery({
    queryKey: ["my-challenge-entry", challenge?.id],
    enabled: !!challenge?.id && !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("challenge_entries")
        .select("*")
        .eq("challenge_id", challenge.id)
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const generateChallenge = async () => {
    setIsGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-weekly-challenge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ week_start: weekStart }),
      });
      if (!res.ok) throw new Error("Failed to generate challenge");
      queryClient.invalidateQueries({ queryKey: ["weekly-challenge", weekStart] });
      toast.success("This week's challenge is ready!");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (!challengeLoading && !challenge) {
      generateChallenge();
    }
  }, [challengeLoading, challenge]);

  const submitEntry = useMutation({
    mutationFn: async () => {
      if (!user || !challenge) throw new Error("Not ready");
      const val = parseFloat(entryValue);
      if (isNaN(val)) throw new Error("Enter a valid number");
      const { error } = await (supabase as any)
        .from("challenge_entries")
        .upsert({
          challenge_id: challenge.id,
          user_id: user.id,
          value: val,
          display_value: `${val} ${challengeTypeLabels[challenge.challenge_type]?.unit || ""}`,
          points: Math.round(val * 10),
        }, { onConflict: "challenge_id,user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entry submitted!");
      setEntryValue("");
      queryClient.invalidateQueries({ queryKey: ["challenge-leaderboard", challenge?.id] });
      queryClient.invalidateQueries({ queryKey: ["my-challenge-entry", challenge?.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const myRank = leaderboard
    ? leaderboard.findIndex((e: any) => e.user_id === user?.id) + 1
    : 0;

  const typeInfo = challenge ? challengeTypeLabels[challenge.challenge_type] : null;
  const TypeIcon = typeInfo?.icon || Zap;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Weekly Challenge</h2>
          <p className="text-muted-foreground text-sm flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            Week of {weekStart} — resets every Monday
          </p>
        </div>
      </div>

      {challengeLoading || isGenerating ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Zap className="h-8 w-8 text-primary animate-pulse mx-auto mb-3" />
            <p className="text-muted-foreground">AI is crafting this week's challenge...</p>
          </CardContent>
        </Card>
      ) : challenge ? (
        <>
          {/* Current Challenge Banner */}
          <Card className="bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10 border-primary/30">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <TypeIcon className="h-8 w-8 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-primary text-primary-foreground text-xs">{challenge.season_phase} phase</Badge>
                    <Badge variant="outline" className="text-xs capitalize">{challenge.challenge_type.replace(/_/g, " ")}</Badge>
                  </div>
                  <h3 className="text-xl font-bold text-foreground">{challenge.title}</h3>
                  <p className="text-muted-foreground mt-1">{challenge.description}</p>
                  {challenge.ai_reasoning && (
                    <p className="text-xs text-muted-foreground mt-2 italic">AI: {challenge.ai_reasoning}</p>
                  )}
                </div>
              </div>

              {myEntry ? (
                <div className="mt-4 p-3 bg-primary/10 rounded-lg flex items-center justify-between">
                  <span className="text-sm font-medium text-primary">Your entry: {myEntry.display_value || myEntry.value}</span>
                  {myRank > 0 && <Badge variant="outline" className="border-primary text-primary">Rank #{myRank}</Badge>}
                </div>
              ) : (
                <div className="mt-4 flex gap-2">
                  <Input
                    type="number"
                    step="0.1"
                    placeholder={`Your ${typeInfo?.unit || "score"}...`}
                    value={entryValue}
                    onChange={(e) => setEntryValue(e.target.value)}
                    className="max-w-48"
                  />
                  <Button
                    onClick={() => submitEntry.mutate()}
                    disabled={!entryValue || submitEntry.isPending}
                    className="gap-2"
                  >
                    <Trophy className="h-4 w-4" />
                    Submit
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Leaderboard */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                Challenge Leaderboard
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!leaderboard?.length ? (
                <div className="p-6 text-center text-muted-foreground text-sm">No entries yet. Be the first!</div>
              ) : (
                <div className="divide-y divide-border">
                  {leaderboard.map((entry: any, idx: number) => {
                    const isMe = entry.user_id === user?.id;
                    const name = entry.profiles?.username || entry.profiles?.full_name || "Athlete";
                    return (
                      <div key={entry.id} className={`flex items-center gap-3 px-4 py-3 ${isMe ? "bg-primary/5" : ""}`}>
                        <div className="w-7 text-center font-bold text-sm">
                          {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={`font-medium text-sm ${isMe ? "text-primary" : ""}`}>{name}</span>
                          {isMe && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                        </div>
                        <div className="text-sm font-medium text-foreground">{entry.display_value || entry.value}</div>
                        <div className="text-xs text-muted-foreground w-14 text-right">{entry.points} pts</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
};

export default WeeklyChallengeSection;
