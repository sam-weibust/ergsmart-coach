import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Battery, Moon, Activity } from "lucide-react";
import { getLocalDate } from "@/lib/dateUtils";

interface Props {
  teamId: string;
  userId: string;
}

function ScaleInput({ label, icon: Icon, value, onChange, min = 1, max = 10 }: {
  label: string;
  icon: React.ElementType;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <Label className="text-xs">{label} ({value}/{max})</Label>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="w-full accent-primary"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

const WellnessCheckin = ({ teamId, userId }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = getLocalDate();
  const [energy, setEnergy] = useState(7);
  const [soreness, setSoreness] = useState(3);
  const [sleep, setSleep] = useState(8);
  const [open, setOpen] = useState(false);

  const { data: todayCheckin } = useQuery({
    queryKey: ["wellness-checkin-today", userId, teamId, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("wellness_checkins" as any)
        .select("*")
        .eq("user_id", userId)
        .eq("team_id", teamId)
        .eq("checkin_date", today)
        .maybeSingle();
      return data;
    },
    enabled: !!userId && !!teamId,
  });

  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("wellness_checkins" as any).upsert({
        user_id: userId,
        team_id: teamId,
        checkin_date: today,
        energy,
        soreness,
        sleep_hours: sleep,
      }, { onConflict: "user_id,team_id,checkin_date" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Check-in saved!" });
      queryClient.invalidateQueries({ queryKey: ["wellness-checkin-today", userId, teamId, today] });
      setOpen(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (todayCheckin && !open) {
    return (
      <Card className="border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/20">
        <CardContent className="py-2 px-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs">
              <span className="font-medium text-green-700 dark:text-green-400">Today's Check-in ✓</span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Battery className="h-3 w-3" />{(todayCheckin as any).energy}/10
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Activity className="h-3 w-3" />{(todayCheckin as any).soreness}/10
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Moon className="h-3 w-3" />{(todayCheckin as any).sleep_hours}h
              </span>
            </div>
            <button onClick={() => setOpen(true)} className="text-[10px] text-muted-foreground hover:text-primary">Edit</button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-200 dark:border-amber-800">
      <CardContent className="p-3 space-y-3">
        <p className="text-sm font-medium">How are you feeling today?</p>
        <ScaleInput label="Energy" icon={Battery} value={energy} onChange={setEnergy} />
        <ScaleInput label="Soreness" icon={Activity} value={soreness} onChange={setSoreness} />
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Moon className="h-3.5 w-3.5 text-muted-foreground" />
            <Label className="text-xs">Sleep (hours)</Label>
          </div>
          <Input
            type="number"
            min="0"
            max="12"
            step="0.5"
            value={sleep}
            onChange={e => setSleep(parseFloat(e.target.value) || 0)}
            className="h-8 text-sm"
          />
        </div>
        <Button className="w-full h-8 text-xs" onClick={() => submit.mutate()} disabled={submit.isPending}>
          Submit Check-in
        </Button>
      </CardContent>
    </Card>
  );
};

export default WellnessCheckin;
