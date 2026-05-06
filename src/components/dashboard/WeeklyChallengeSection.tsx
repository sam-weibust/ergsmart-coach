import { type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Calendar, Zap, Target, Dumbbell, Timer, Flame, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { getSessionUser } from '@/lib/getUser';

function getISOWeek(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

function seededShuffle<T>(array: T[], seed: number): T[] {
  const arr = [...array];
  let s = seed;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

interface Challenge {
  id: string;
  title: string;
  description: string;
  category: "distance" | "intensity" | "strength" | "technique" | "consistency" | "time";
  icon: ReactNode;
}

const CHALLENGE_POOL: Challenge[] = [
  { id: "distance_50k",    title: "Half Century",       description: "Row 50,000m this week",                                             category: "distance",    icon: <TrendingUp className="h-5 w-5" /> },
  { id: "distance_75k",    title: "Road to 75K",        description: "Row 75,000m this week",                                             category: "distance",    icon: <TrendingUp className="h-5 w-5" /> },
  { id: "distance_100k",   title: "Century Row",        description: "Row 100,000m this week",                                            category: "distance",    icon: <TrendingUp className="h-5 w-5" /> },
  { id: "long_piece",      title: "Long Haul",          description: "Complete a single piece of 10,000m or more",                        category: "distance",    icon: <TrendingUp className="h-5 w-5" /> },
  { id: "intervals_3",     title: "Triple Interval",    description: "Complete 3 interval sessions this week",                            category: "intensity",   icon: <Zap className="h-5 w-5" /> },
  { id: "intervals_5",     title: "Interval Blitz",     description: "Complete 5 interval sessions this week",                            category: "intensity",   icon: <Zap className="h-5 w-5" /> },
  { id: "test_piece",      title: "On the Clock",       description: "Complete a timed test piece (2K, 5K, or 6K)",                       category: "intensity",   icon: <Zap className="h-5 w-5" /> },
  { id: "ut1_sessions",    title: "UT1 Push",           description: "Complete 2 UT1 intensity sessions this week",                       category: "intensity",   icon: <Zap className="h-5 w-5" /> },
  { id: "strength_4",      title: "Strength Week",      description: "Log 4 strength workouts this week",                                 category: "strength",    icon: <Dumbbell className="h-5 w-5" /> },
  { id: "strength_6",      title: "Iron Athlete",       description: "Log 6 strength workouts this week",                                 category: "strength",    icon: <Dumbbell className="h-5 w-5" /> },
  { id: "cross_train",     title: "Cross Trainer",      description: "Log at least one erg and one strength session on the same day",     category: "strength",    icon: <Dumbbell className="h-5 w-5" /> },
  { id: "new_exercises_3", title: "Movement Explorer",  description: "Try 3 strength exercises you haven't logged before",                 category: "strength",    icon: <Dumbbell className="h-5 w-5" /> },
  { id: "stroke_rate_ut2", title: "Steady Blade",       description: "Average stroke rate under 20 spm for all UT2 pieces",               category: "technique",   icon: <Target className="h-5 w-5" /> },
  { id: "split_variance",  title: "Split Surgeon",      description: "Row 3 pieces where your split variance stays under 5 seconds",      category: "technique",   icon: <Target className="h-5 w-5" /> },
  { id: "consistency_5of7",title: "5-Day Grind",        description: "Work out 5 of 7 days this week",                                    category: "consistency", icon: <Flame className="h-5 w-5" /> },
  { id: "consistency_6of7",title: "Nearly Perfect",     description: "Work out 6 of 7 days this week",                                    category: "consistency", icon: <Flame className="h-5 w-5" /> },
  { id: "no_rest_days",    title: "No Days Off",        description: "Work out every day this week — zero rest days",                     category: "consistency", icon: <Flame className="h-5 w-5" /> },
  { id: "back_to_back_3",  title: "Momentum Builder",   description: "Complete workouts on 3 consecutive days",                           category: "consistency", icon: <Flame className="h-5 w-5" /> },
  { id: "time_3h",         title: "3-Hour Block",       description: "Log 3 hours of total rowing this week",                             category: "time",        icon: <Timer className="h-5 w-5" /> },
  { id: "time_5h",         title: "5-Hour Commitment",  description: "Log 5 hours of total rowing this week",                             category: "time",        icon: <Timer className="h-5 w-5" /> },
  { id: "endurance_60min", title: "Endurance Hour",     description: "Log at least one workout lasting over 60 minutes",                  category: "time",        icon: <Timer className="h-5 w-5" /> },
  { id: "morning_3",       title: "Early Bird",         description: "Log 3 workouts before 9am this week",                               category: "time",        icon: <Timer className="h-5 w-5" /> },
];

const categoryColors: Record<Challenge["category"], string> = {
  distance:    "bg-blue-500/10 text-blue-600 border-blue-500/20",
  intensity:   "bg-orange-500/10 text-orange-600 border-orange-500/20",
  strength:    "bg-purple-500/10 text-purple-600 border-purple-500/20",
  technique:   "bg-green-500/10 text-green-600 border-green-500/20",
  consistency: "bg-red-500/10 text-red-600 border-red-500/20",
  time:        "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
};

const WeeklyChallengeSection = () => {
  const queryClient = useQueryClient();
  const now = new Date();
  const weekNumber = getISOWeek(now);
  const year = now.getFullYear();
  const seed = year * 100 + weekNumber;
  const weeklyChallenge = seededShuffle(CHALLENGE_POOL, seed).slice(0, 3);

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => getSessionUser(),
  });

  const { data: completions = [] } = useQuery({
    queryKey: ["weekly-challenge-completions", weekNumber, year, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("weekly_challenge_completions")
        .select("challenge_id")
        .eq("user_id", user!.id)
        .eq("week_number", weekNumber)
        .eq("year", year);
      return (data || []).map((r: any) => r.challenge_id as string);
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (challengeId: string) => {
      if (!user) throw new Error("Not logged in");
      const { error } = await (supabase as any)
        .from("weekly_challenge_completions")
        .insert({ user_id: user.id, challenge_id: challengeId, week_number: weekNumber, year });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weekly-challenge-completions", weekNumber, year, user?.id] });
      toast.success("Challenge marked complete!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const completedCount = weeklyChallenge.filter(c => completions.includes(c.id)).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Weekly Challenges</h2>
        <p className="text-muted-foreground text-sm flex items-center gap-1 mt-0.5">
          <Calendar className="h-3.5 w-3.5" />
          Week {weekNumber}, {year} — new challenges every Monday
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{completedCount}/3 completed</span>
        <div className="flex gap-1.5">
          {weeklyChallenge.map(c => (
            <div
              key={c.id}
              className={`h-2 w-10 rounded-full transition-colors ${completions.includes(c.id) ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {weeklyChallenge.map((challenge) => {
          const isComplete = completions.includes(challenge.id);
          return (
            <Card
              key={challenge.id}
              className={`transition-all ${isComplete ? "border-primary/40 bg-primary/5" : ""}`}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`p-2 rounded-lg border shrink-0 ${categoryColors[challenge.category]}`}>
                  {challenge.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{challenge.title}</p>
                    <Badge variant="outline" className={`text-xs capitalize ${categoryColors[challenge.category]}`}>
                      {challenge.category}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{challenge.description}</p>
                </div>
                {isComplete ? (
                  <CheckCircle2 className="h-6 w-6 text-primary shrink-0" />
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => completeMutation.mutate(challenge.id)}
                    disabled={completeMutation.isPending}
                  >
                    Mark Done
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {completedCount === 3 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-4 flex items-center gap-3">
            <Zap className="h-6 w-6 text-primary shrink-0" />
            <div>
              <p className="font-semibold text-primary">All challenges complete!</p>
              <p className="text-sm text-muted-foreground">Great work this week. New challenges arrive Monday.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default WeeklyChallengeSection;
