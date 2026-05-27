import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { X, Zap } from "lucide-react";
import { getSessionUser } from "@/lib/getUser";

const DISMISS_KEY = "daily_motivation_dismissed";

function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DailyMotivation() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      const stored = localStorage.getItem(DISMISS_KEY);
      if (!stored) return false;
      const { date } = JSON.parse(stored);
      return date === getTodayStr();
    } catch {
      return false;
    }
  });

  // Detect training phase from active workout plan
  const { data: activePlan } = useQuery({
    queryKey: ["active-plan-phase"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const { data } = await supabase
        .from("workout_plans")
        .select("workout_data, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    staleTime: 60 * 60 * 1000,
  });

  // Determine category based on current training phase
  const category = (() => {
    if (!activePlan?.workout_data) return "general";
    const data = activePlan.workout_data as any;
    const weeks: any[] = Array.isArray(data) ? data : Array.isArray(data?.plan) ? data.plan : Array.isArray(data?.weeks) ? data.weeks : [];
    if (!weeks.length) return "general";

    const totalWeeks = weeks.length;
    const startDate = activePlan.created_at ? new Date(activePlan.created_at) : new Date();
    const weeksSinceStart = Math.floor((Date.now() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
    const currentWeekIdx = Math.min(weeksSinceStart, totalWeeks - 1);
    const currentWeek = weeks[currentWeekIdx];
    const phase = (currentWeek?.phase || "").toLowerCase();

    if (phase.includes("taper")) return "taper";
    if (phase.includes("peak") || phase.includes("race")) return "peak";
    if (phase.includes("base") || phase.includes("build")) return "base_building";
    return "general";
  })();

  const { data: messages = [] } = useQuery({
    queryKey: ["daily-motivations", category],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_motivations")
        .select("id, message")
        .eq("category", category);
      return data || [];
    },
    staleTime: 24 * 60 * 60 * 1000,
  });

  const message = (() => {
    if (!messages.length) return null;
    const idx = getDayOfYear() % messages.length;
    return messages[idx];
  })();

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify({ date: getTodayStr() }));
    } catch {}
    setDismissed(true);
  };

  if (dismissed || !message) return null;

  return (
    <div className="relative rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10 p-4 mb-4 animate-fade-in">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
          <Zap className="h-4 w-4 text-primary" />
        </div>
        <p className="text-sm font-medium text-foreground leading-relaxed">
          {message.message}
        </p>
      </div>
    </div>
  );
}
