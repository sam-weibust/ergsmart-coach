import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Flame, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getSessionUser } from '@/lib/getUser';

export function StreakWidget() {
  const { data: workoutDates = [] } = useQuery({
    queryKey: ["workout-dates-streak"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return [];
      const { data } = await supabase
        .from("erg_workouts")
        .select("workout_date")
        .eq("user_id", user.id)
        .order("workout_date", { ascending: false })
        .limit(400);
      return (data || []).map((w: any) => w.workout_date as string);
    },
  });

  const { current, longest } = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const unique = [...new Set(workoutDates)].sort((a, b) => b.localeCompare(a));

    // Current streak: consecutive days ending today or yesterday
    let current = 0;
    let check = today;
    for (const d of unique) {
      if (d === check) {
        current++;
        const prev = new Date(check);
        prev.setDate(prev.getDate() - 1);
        check = prev.toISOString().split("T")[0];
      } else if (current === 0 && d === yesterday) {
        // Allow streak starting from yesterday
        current++;
        const prev = new Date(yesterday);
        prev.setDate(prev.getDate() - 1);
        check = prev.toISOString().split("T")[0];
      } else if (d < check) {
        break;
      }
    }

    // Longest streak
    let longest = 0;
    let streak = 0;
    let prevDate: string | null = null;
    for (const d of unique) {
      if (!prevDate) { streak = 1; prevDate = d; continue; }
      const prev = new Date(prevDate);
      const curr = new Date(d);
      const diff = Math.round((prev.getTime() - curr.getTime()) / 86400000);
      if (diff === 1) { streak++; } else { if (streak > longest) longest = streak; streak = 1; }
      prevDate = d;
    }
    if (streak > longest) longest = streak;

    return { current, longest };
  }, [workoutDates]);

  if (current === 0 && longest === 0) return null;

  return (
    <Card className="bg-gradient-to-r from-[#0a1628] to-[#112240] border-orange-500/30 overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Flame className="h-10 w-10 text-orange-400" fill="currentColor" />
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-white">{current}</span>
                <span className="text-orange-400 font-semibold">day streak</span>
              </div>
              <p className="text-white/50 text-xs mt-0.5">Keep it going!</p>
            </div>
          </div>

          <div className="text-right">
            <div className="flex items-center gap-1.5 text-white/60 text-xs mb-0.5">
              <TrendingUp className="h-3 w-3" />
              All-time best
            </div>
            <span className="text-xl font-bold text-white">{longest} days</span>
          </div>
        </div>

        {/* Last 14 days indicator */}
        <div className="mt-3 flex gap-1">
          {Array.from({ length: 14 }).map((_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (13 - i));
            const key = d.toISOString().split("T")[0];
            const active = workoutDates.includes(key);
            return (
              <div
                key={i}
                title={key}
                className={`flex-1 h-2 rounded-full transition-all ${active ? "bg-orange-400" : "bg-white/10"}`}
              />
            );
          })}
        </div>
        <p className="text-white/30 text-xs mt-1 text-right">Last 14 days</p>
      </CardContent>
    </Card>
  );
}
