import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Snowflake } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StreakFreezeProps {
  profile: any;
  currentStreak: number;
  uniqueDaysLogged: number;
}

export const StreakFreeze = ({ profile, currentStreak, uniqueDaysLogged }: StreakFreezeProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: freezes } = useQuery({
    queryKey: ["streak-freezes", profile?.id],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .from("streak_freezes")
        .select("*")
        .eq("user_id", user.id);
      return data || [];
    },
    enabled: !!profile?.id,
  });

  // Calculate available freezes: 1 per 7-day streak milestone, max 2 banked
  const milestonesEarned = Math.floor(currentStreak / 7);
  const freezesUsed = freezes?.length || 0;
  const availableFreezes = Math.min(2, Math.max(0, milestonesEarned - freezesUsed));

  const today = new Date().toISOString().split("T")[0];
  const alreadyFrozenToday = freezes?.some((f: any) => f.freeze_date === today);

  const freezeMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");
      const { error } = await supabase
        .from("streak_freezes")
        .insert({ user_id: user.id, freeze_date: today } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["streak-freezes"] });
      queryClient.invalidateQueries({ queryKey: ["achievement-stats"] });
      toast({ title: "Streak Protected!", description: "Today is covered by a freeze." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to activate freeze.", variant: "destructive" });
    },
  });

  return (
    <div className="flex items-center gap-2 mt-2">
      <Badge variant="outline" className="gap-1 text-xs">
        <Snowflake className="h-3 w-3" />
        {availableFreezes} freeze{availableFreezes !== 1 ? "s" : ""} available
      </Badge>
      <Button
        variant="outline"
        size="sm"
        disabled={availableFreezes <= 0 || alreadyFrozenToday || freezeMutation.isPending}
        onClick={() => freezeMutation.mutate()}
        className="gap-1 text-xs h-7"
      >
        <Shield className="h-3 w-3" />
        {alreadyFrozenToday ? "Today Protected" : "Protect Streak"}
      </Button>
    </div>
  );
};
