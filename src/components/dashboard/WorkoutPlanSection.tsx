import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const getZoneColor = (zone: string) => {
  switch (zone?.toUpperCase()) {
    case "UT2": return "bg-green-500/20 text-green-700 border-green-500/30";
    case "UT1": return "bg-blue-500/20 text-blue-700 border-blue-500/30";
    case "TR": return "bg-yellow-500/20 text-yellow-700 border-yellow-500/30";
    case "AT": return "bg-red-500/20 text-red-700 border-red-500/30";
    default: return "bg-muted text-muted-foreground";
  }
};

export const WorkoutPlanSection = () => {
  const [months, setMonths] = useState<string>("3");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  const { data: userGoals } = useQuery({
    queryKey: ["user-goals"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("user_goals")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
  });

  const { data: plans } = useQuery({
    queryKey: ["workout-plans"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("workout_plans")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const generatePlan = useMutation({
    mutationFn: async () => {
      if (!profile?.weight || !profile?.height) {
        throw new Error("Please complete your profile first");
      }

      const { data, error } = await supabase.functions.invoke("generate-workout", {
        body: {
          months: parseInt(months),
          weight: profile.weight,
          height: profile.height,
          experience: profile.experience_level || "intermediate",
          goals: profile.goals || "general fitness",
          current2k: userGoals?.current_2k_time || null,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: async (data) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from("workout_plans").insert({
        user_id: user.id,
        title: `${months}-Month Training Plan`,
        description: `Generated plan for ${profile?.goals || "general fitness"}`,
        workout_data: data.plan,
      });

      if (error) throw error;

      toast({
        title: "Workout Plan Generated",
        description: `Your ${months}-month plan is ready!`,
      });
      queryClient.invalidateQueries({ queryKey: ["workout-plans"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deletePlan = useMutation({
    mutationFn: async (planId: string) => {
      const { error } = await supabase
        .from("workout_plans")
        .delete()
        .eq("id", planId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Plan deleted" });
      queryClient.invalidateQueries({ queryKey: ["workout-plans"] });
    },
  });

  const isProfileComplete = profile?.weight && profile?.height;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Generate Training Plan</CardTitle>
          <CardDescription>
            Create a periodized rowing program with UT2, UT1, TR, and AT training zones
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isProfileComplete && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-700 dark:text-yellow-400">
              Please complete your profile (weight and height) in the Profile tab before generating a plan.
            </div>
          )}
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className={getZoneColor("UT2")}>UT2: Base endurance</Badge>
            <Badge variant="outline" className={getZoneColor("UT1")}>UT1: Aerobic development</Badge>
            <Badge variant="outline" className={getZoneColor("TR")}>TR: Threshold</Badge>
            <Badge variant="outline" className={getZoneColor("AT")}>AT: High intensity</Badge>
          </div>
          <div className="flex gap-4">
            <Select value={months} onValueChange={setMonths}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 Months</SelectItem>
                <SelectItem value="6">6 Months</SelectItem>
                <SelectItem value="9">9 Months</SelectItem>
                <SelectItem value="12">12 Months</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => generatePlan.mutate()}
              disabled={generatePlan.isPending || !isProfileComplete}
            >
              {generatePlan.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate Plan
            </Button>
          </div>
        </CardContent>
      </Card>

      {plans && plans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your Training Plans</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {plans.map((plan) => (
                <AccordionItem key={plan.id} value={plan.id}>
                  <AccordionTrigger>
                    <div className="flex justify-between w-full pr-4">
                      <span>{plan.title}</span>
                      <span className="text-sm text-muted-foreground">
                        {new Date(plan.created_at!).toLocaleDateString()}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 max-h-[500px] overflow-y-auto">
                      {Array.isArray(plan.workout_data) ? (plan.workout_data as any[]).map((week: any) => (
                        <div key={week.week} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">Week {week.week}</h4>
                            {week.phase && (
                              <Badge variant="outline" className="text-xs">
                                {week.phase}
                              </Badge>
                            )}
                          </div>
                          <div className="grid gap-2">
                            {week.days?.map((day: any) => (
                              <div key={day.day} className="p-3 border rounded-lg space-y-2">
                                <div className="font-medium">Day {day.day}</div>
                                <div className="text-sm space-y-2">
                                  {day.ergWorkout && (
                                    <div className="flex flex-wrap items-start gap-2">
                                      <Badge variant="outline" className={getZoneColor(day.ergWorkout.zone)}>
                                        {day.ergWorkout.zone}
                                      </Badge>
                                      <div className="flex-1">
                                        <div className="font-medium">{day.ergWorkout.description}</div>
                                        <div className="text-muted-foreground">
                                          {day.ergWorkout.duration && `${day.ergWorkout.duration}`}
                                          {day.ergWorkout.distance && ` • ${day.ergWorkout.distance}m`}
                                          {day.ergWorkout.targetSplit && ` • ${day.ergWorkout.targetSplit}`}
                                          {day.ergWorkout.rate && ` • ${day.ergWorkout.rate}`}
                                        </div>
                                        {day.ergWorkout.notes && (
                                          <div className="text-xs text-muted-foreground italic">
                                            {day.ergWorkout.notes}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  {day.strengthWorkout && (
                                    <div className="pl-2 border-l-2 border-muted">
                                      <span className="font-medium">Strength:</span>{" "}
                                      {day.strengthWorkout.exercise} - {day.strengthWorkout.sets}x{day.strengthWorkout.reps}
                                      {day.strengthWorkout.weight && ` @ ${day.strengthWorkout.weight}`}
                                      {day.strengthWorkout.notes && (
                                        <span className="text-muted-foreground"> ({day.strengthWorkout.notes})</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )) : (
                        <div className="text-muted-foreground">Invalid workout data format</div>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deletePlan.mutate(plan.id)}
                      >
                        Delete Plan
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
