import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, TrendingUp } from "lucide-react";
import { getSessionUser } from '@/lib/getUser';

interface PercentileRankBadgeProps {
  leaderboard: any[];
}

export const PercentileRankBadge = ({ leaderboard }: PercentileRankBadgeProps) => {
  const { data: userId } = useQuery({
    queryKey: ["current-user-id"],
    queryFn: async () => {
      const user = await getSessionUser();
      return user?.id || null;
    },
  });

  if (!userId || !leaderboard || leaderboard.length === 0) return null;

  const rank = leaderboard.findIndex((e: any) => e.user_id === userId);
  if (rank === -1) return null;

  const total = leaderboard.length;
  const percentile = Math.round((1 - (rank + 1) / total) * 100);
  const entry = leaderboard[rank];

  const formatInterval = (interval: string | null): string => {
    if (!interval) return "-";
    const match = interval.match(/(\d+):(\d+):(\d+\.?\d*)/);
    if (match) {
      const hours = parseInt(match[1]);
      const minutes = parseInt(match[2]);
      const seconds = parseFloat(match[3]);
      return `${hours * 60 + minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
    }
    return interval;
  };

  const color = percentile >= 75 ? "text-green-600 bg-green-500/10 border-green-500/20" :
    percentile >= 40 ? "text-yellow-600 bg-yellow-500/10 border-yellow-500/20" :
    "text-muted-foreground bg-muted/50 border-border";

  return (
    <Card className={`border ${color}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${color}`}>
            <TrendingUp className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">My Rank</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-2xl font-bold font-mono">#{rank + 1}</span>
              <span className="text-sm text-muted-foreground">of {total}</span>
              <span className="text-lg font-semibold">Top {Math.max(1, 100 - percentile)}%</span>
            </div>
            <p className="text-sm font-mono mt-0.5">{formatInterval(entry.time_achieved)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
