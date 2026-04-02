import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Trophy, Flame, Target, Dumbbell, Timer, Users, Calendar, Zap, Award, Star, Medal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StreakFreeze } from "./StreakFreeze";

interface AwardsSectionProps {
  profile: any;
}

type TierLevel = "none" | "bronze" | "silver" | "gold" | "platinum" | "diamond";

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  currentValue: number;
  tiers: { level: TierLevel; threshold: number; label: string }[];
  unit: string;
}

const tierColors: Record<TierLevel, string> = {
  none: "bg-muted text-muted-foreground",
  bronze: "bg-amber-700 text-white",
  silver: "bg-slate-400 text-white",
  gold: "bg-yellow-500 text-black",
  platinum: "bg-cyan-300 text-black",
  diamond: "bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 text-white",
};

const tierBorderColors: Record<TierLevel, string> = {
  none: "border-muted",
  bronze: "border-amber-700",
  silver: "border-slate-400",
  gold: "border-yellow-500",
  platinum: "border-cyan-300",
  diamond: "border-purple-400",
};

const getTier = (value: number, tiers: Achievement["tiers"]): { current: TierLevel; next: TierLevel | null; progress: number; nextThreshold: number } => {
  let current: TierLevel = "none";
  let next: TierLevel | null = null;
  let progress = 0;
  let nextThreshold = tiers[0]?.threshold || 0;
  let prevThreshold = 0;

  for (let i = 0; i < tiers.length; i++) {
    if (value >= tiers[i].threshold) {
      current = tiers[i].level;
      prevThreshold = tiers[i].threshold;
      if (i < tiers.length - 1) {
        next = tiers[i + 1].level;
        nextThreshold = tiers[i + 1].threshold;
        progress = ((value - prevThreshold) / (nextThreshold - prevThreshold)) * 100;
      } else {
        next = null;
        progress = 100;
        nextThreshold = tiers[i].threshold;
      }
    } else {
      if (current === "none") {
        next = tiers[i].level;
        nextThreshold = tiers[i].threshold;
        progress = (value / nextThreshold) * 100;
      }
      break;
    }
  }

  return { current, next, progress: Math.min(progress, 100), nextThreshold };
};

export const AwardsSection = ({ profile }: AwardsSectionProps) => {
  const { data: streakFreezes } = useQuery({
    queryKey: ["streak-freezes-for-calc", profile?.id],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase.from("streak_freezes").select("freeze_date").eq("user_id", user.id);
      return (data || []).map((f: any) => f.freeze_date);
    },
    enabled: !!profile?.id,
  });

  const { data: stats, isLoading } = useQuery({
    queryKey: ["achievement-stats", profile?.id, streakFreezes],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: ergWorkouts } = await supabase
        .from("erg_workouts")
        .select("*")
        .eq("user_id", user.id)
        .order("workout_date", { ascending: true });

      const { data: strengthWorkouts } = await supabase
        .from("strength_workouts")
        .select("*")
        .eq("user_id", user.id)
        .order("workout_date", { ascending: true });

      // Get friends count
      const { data: friends } = await supabase
        .from("friendships")
        .select("id")
        .eq("status", "accepted")
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

      // Calculate stats
      const totalErgWorkouts = ergWorkouts?.length || 0;
      const totalStrengthWorkouts = strengthWorkouts?.length || 0;
      const totalWorkouts = totalErgWorkouts + totalStrengthWorkouts;

      // Total meters
      const totalMeters = ergWorkouts?.reduce((sum, w) => sum + (w.distance || 0), 0) || 0;

      // Unique workout days
      const workoutDays = new Set<string>();
      ergWorkouts?.forEach(w => workoutDays.add(w.workout_date));
      strengthWorkouts?.forEach(w => workoutDays.add(w.workout_date));
      const uniqueDaysLogged = workoutDays.size;

      // Calculate streak
      const allDates = Array.from(workoutDays).sort().reverse();
      let currentStreak = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = 0; i < allDates.length; i++) {
        const workoutDate = new Date(allDates[i]);
        workoutDate.setHours(0, 0, 0, 0);
        const expectedDate = new Date(today);
        expectedDate.setDate(today.getDate() - i);
        expectedDate.setHours(0, 0, 0, 0);

        // Allow for yesterday if today hasn't been logged yet
        if (i === 0) {
          const yesterday = new Date(today);
          yesterday.setDate(today.getDate() - 1);
          if (workoutDate.getTime() === today.getTime() || workoutDate.getTime() === yesterday.getTime()) {
            currentStreak = 1;
          } else {
            break;
          }
        } else {
          const prevWorkoutDate = new Date(allDates[i - 1]);
          prevWorkoutDate.setHours(0, 0, 0, 0);
          const dayDiff = (prevWorkoutDate.getTime() - workoutDate.getTime()) / (1000 * 60 * 60 * 24);
          if (dayDiff === 1) {
            currentStreak++;
          } else {
            break;
          }
        }
      }

      // Unique exercises
      const uniqueExercises = new Set(strengthWorkouts?.map(w => w.exercise.toLowerCase()));

      // 2K tests completed
      const testsCompleted = ergWorkouts?.filter(w => w.workout_type === "test").length || 0;

      // Friends connected
      const friendsCount = friends?.length || 0;

      // Total weight lifted (sum of weight * sets * reps)
      const totalWeightLifted = strengthWorkouts?.reduce((sum, w) => sum + (w.weight * w.sets * w.reps), 0) || 0;

      return {
        totalWorkouts,
        totalMeters,
        uniqueDaysLogged,
        currentStreak,
        uniqueExercises: uniqueExercises.size,
        testsCompleted,
        friendsCount,
        totalWeightLifted,
        totalErgWorkouts,
        totalStrengthWorkouts,
      };
    },
    enabled: !!profile?.id,
  });

  const achievements: Achievement[] = [
    {
      id: "days-logged",
      name: "Consistency Champion",
      description: "Days with logged workouts",
      icon: <Calendar className="h-6 w-6" />,
      currentValue: stats?.uniqueDaysLogged || 0,
      tiers: [
        { level: "bronze", threshold: 7, label: "7 days" },
        { level: "silver", threshold: 30, label: "30 days" },
        { level: "gold", threshold: 100, label: "100 days" },
        { level: "platinum", threshold: 365, label: "365 days" },
        { level: "diamond", threshold: 1000, label: "1000 days" },
      ],
      unit: "days",
    },
    {
      id: "total-workouts",
      name: "Workout Warrior",
      description: "Total workouts completed",
      icon: <Dumbbell className="h-6 w-6" />,
      currentValue: stats?.totalWorkouts || 0,
      tiers: [
        { level: "bronze", threshold: 10, label: "10 workouts" },
        { level: "silver", threshold: 50, label: "50 workouts" },
        { level: "gold", threshold: 200, label: "200 workouts" },
        { level: "platinum", threshold: 500, label: "500 workouts" },
        { level: "diamond", threshold: 1000, label: "1000 workouts" },
      ],
      unit: "workouts",
    },
    {
      id: "streak",
      name: "Fire Streak",
      description: "Current consecutive days",
      icon: <Flame className="h-6 w-6" />,
      currentValue: stats?.currentStreak || 0,
      tiers: [
        { level: "bronze", threshold: 3, label: "3 days" },
        { level: "silver", threshold: 7, label: "7 days" },
        { level: "gold", threshold: 30, label: "30 days" },
        { level: "platinum", threshold: 90, label: "90 days" },
        { level: "diamond", threshold: 365, label: "365 days" },
      ],
      unit: "day streak",
    },
    {
      id: "total-meters",
      name: "Distance Dominator",
      description: "Total meters rowed",
      icon: <Target className="h-6 w-6" />,
      currentValue: stats?.totalMeters || 0,
      tiers: [
        { level: "bronze", threshold: 50000, label: "50km" },
        { level: "silver", threshold: 250000, label: "250km" },
        { level: "gold", threshold: 1000000, label: "1,000km" },
        { level: "platinum", threshold: 5000000, label: "5,000km" },
        { level: "diamond", threshold: 10000000, label: "10,000km" },
      ],
      unit: "meters",
    },
    {
      id: "tests-completed",
      name: "Test Taker",
      description: "2K/5K/6K tests completed",
      icon: <Timer className="h-6 w-6" />,
      currentValue: stats?.testsCompleted || 0,
      tiers: [
        { level: "bronze", threshold: 1, label: "1 test" },
        { level: "silver", threshold: 5, label: "5 tests" },
        { level: "gold", threshold: 15, label: "15 tests" },
        { level: "platinum", threshold: 30, label: "30 tests" },
        { level: "diamond", threshold: 50, label: "50 tests" },
      ],
      unit: "tests",
    },
    {
      id: "exercise-variety",
      name: "Movement Master",
      description: "Unique exercises performed",
      icon: <Zap className="h-6 w-6" />,
      currentValue: stats?.uniqueExercises || 0,
      tiers: [
        { level: "bronze", threshold: 5, label: "5 exercises" },
        { level: "silver", threshold: 15, label: "15 exercises" },
        { level: "gold", threshold: 30, label: "30 exercises" },
        { level: "platinum", threshold: 50, label: "50 exercises" },
        { level: "diamond", threshold: 100, label: "100 exercises" },
      ],
      unit: "exercises",
    },
    {
      id: "friends",
      name: "Social Butterfly",
      description: "Friends connected",
      icon: <Users className="h-6 w-6" />,
      currentValue: stats?.friendsCount || 0,
      tiers: [
        { level: "bronze", threshold: 1, label: "1 friend" },
        { level: "silver", threshold: 5, label: "5 friends" },
        { level: "gold", threshold: 15, label: "15 friends" },
        { level: "platinum", threshold: 30, label: "30 friends" },
        { level: "diamond", threshold: 50, label: "50 friends" },
      ],
      unit: "friends",
    },
    {
      id: "weight-lifted",
      name: "Iron Crusher",
      description: "Total weight lifted (kg)",
      icon: <Medal className="h-6 w-6" />,
      currentValue: stats?.totalWeightLifted || 0,
      tiers: [
        { level: "bronze", threshold: 1000, label: "1,000 kg" },
        { level: "silver", threshold: 10000, label: "10,000 kg" },
        { level: "gold", threshold: 50000, label: "50,000 kg" },
        { level: "platinum", threshold: 100000, label: "100,000 kg" },
        { level: "diamond", threshold: 500000, label: "500,000 kg" },
      ],
      unit: "kg",
    },
  ];

  // Calculate total badges earned
  const badgesEarned = achievements.filter(a => getTier(a.currentValue, a.tiers).current !== "none").length;
  const tierCounts = achievements.reduce((acc, a) => {
    const tier = getTier(a.currentValue, a.tiers).current;
    if (tier !== "none") {
      acc[tier] = (acc[tier] || 0) + 1;
    }
    return acc;
  }, {} as Record<TierLevel, number>);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Awards & Achievements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Awards & Achievements
          </CardTitle>
          <CardDescription>
            Earn badges by reaching milestones in your training journey
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              <span className="font-semibold">{badgesEarned}/{achievements.length}</span>
              <span className="text-muted-foreground text-sm">badges earned</span>
            </div>
            <div className="flex gap-2">
              {tierCounts.diamond && (
                <Badge className={tierColors.diamond}>{tierCounts.diamond} 💎</Badge>
              )}
              {tierCounts.platinum && (
                <Badge className={tierColors.platinum}>{tierCounts.platinum} ⭐</Badge>
              )}
              {tierCounts.gold && (
                <Badge className={tierColors.gold}>{tierCounts.gold} 🥇</Badge>
              )}
              {tierCounts.silver && (
                <Badge className={tierColors.silver}>{tierCounts.silver} 🥈</Badge>
              )}
              {tierCounts.bronze && (
                <Badge className={tierColors.bronze}>{tierCounts.bronze} 🥉</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Achievement Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {achievements.map((achievement) => {
          const tierInfo = getTier(achievement.currentValue, achievement.tiers);
          const currentTierData = achievement.tiers.find(t => t.level === tierInfo.current);
          const nextTierData = achievement.tiers.find(t => t.level === tierInfo.next);

          return (
            <Card 
              key={achievement.id} 
              className={`border-2 ${tierBorderColors[tierInfo.current]} transition-all hover:shadow-lg`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-full ${tierColors[tierInfo.current]}`}>
                    {achievement.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-semibold truncate">{achievement.name}</h4>
                      {tierInfo.current !== "none" && (
                        <Badge variant="outline" className={tierColors[tierInfo.current]}>
                          {tierInfo.current.charAt(0).toUpperCase() + tierInfo.current.slice(1)}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{achievement.description}</p>
                    
                    <div className="mt-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-mono font-semibold">
                          {achievement.id === "total-meters" 
                            ? `${(achievement.currentValue / 1000).toFixed(1)}km`
                            : achievement.id === "weight-lifted"
                            ? `${(achievement.currentValue / 1000).toFixed(1)}t`
                            : `${achievement.currentValue} ${achievement.unit}`
                          }
                        </span>
                        {nextTierData && (
                          <span className="text-muted-foreground">
                            Next: {nextTierData.label}
                          </span>
                        )}
                        {!nextTierData && tierInfo.current !== "none" && (
                          <span className="text-primary font-semibold flex items-center gap-1">
                            <Star className="h-3 w-3" /> Max Level!
                          </span>
                        )}
                      </div>
                      <Progress value={tierInfo.progress} className="h-2" />
                    </div>

                    {/* Tier ladder */}
                    <div className="flex gap-1 mt-2">
                      {achievement.tiers.map((tier) => {
                        const isEarned = achievement.currentValue >= tier.threshold;
                        return (
                          <div
                            key={tier.level}
                            className={`h-2 flex-1 rounded-full ${isEarned ? tierColors[tier.level] : "bg-muted"}`}
                            title={tier.label}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default AwardsSection;
