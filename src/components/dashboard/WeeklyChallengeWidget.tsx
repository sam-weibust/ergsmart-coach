import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Zap, ChevronRight, Trophy } from "lucide-react";
import { startOfWeek, format } from "date-fns";
import { getSessionUser } from '@/lib/getUser';

interface Props {
  onNavigate: (tab: string) => void;
}

const WeeklyChallengeWidget = ({ onNavigate }: Props) => {
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");

  const { data: challenge } = useQuery({
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

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const user = await getSessionUser();
      return user;
    },
  });

  const { data: myEntry } = useQuery({
    queryKey: ["my-challenge-entry", challenge?.id],
    enabled: !!challenge?.id && !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("challenge_entries")
        .select("value, display_value, points")
        .eq("challenge_id", challenge.id)
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  if (!challenge) return null;

  return (
    <Card
      className="border-primary/30 bg-gradient-to-r from-primary/5 to-secondary/5 cursor-pointer hover:border-primary/50 transition-all"
      onClick={() => onNavigate("challenges")}
    >
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg shrink-0">
          <Zap className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">This Week's Challenge</p>
          <p className="font-semibold text-sm text-foreground truncate">{challenge.title}</p>
          {myEntry ? (
            <p className="text-xs text-primary">Your entry: {myEntry.display_value || myEntry.value} · {myEntry.points} pts</p>
          ) : (
            <p className="text-xs text-muted-foreground">{challenge.description}</p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </CardContent>
    </Card>
  );
};

export default WeeklyChallengeWidget;
