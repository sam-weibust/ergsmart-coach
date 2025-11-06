import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export const WorkoutPlanSection = () => {
  const [weeks, setWeeks] = useState<string>("4");
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
        .single();

      if (error) throw error;
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
          weeks: parseInt(weeks),
          weight: profile.weight,
          height: profile.height,
          experience: profile.experience_level || "intermediate",
          goals: profile.goals || "general fitness",
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from("workout_plans").insert({
        user_id: user.id,
        title: `${weeks}-Week Training Plan`,
        description: `Generated plan for ${profile?.goals || "general fitness"}`,
        workout_data: data.plan,
      });

      if (error) throw error;

      toast({
        title: "Workout Plan Generated",
        description: `Your ${weeks}-week plan is ready!`,
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Generate Training Plan</CardTitle>
          <CardDescription>Create a periodized workout schedule</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Select value={weeks} onValueChange={setWeeks}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 Weeks</SelectItem>
                <SelectItem value="4">4 Weeks</SelectItem>
                <SelectItem value="6">6 Weeks</SelectItem>
                <SelectItem value="8">8 Weeks</SelectItem>
                <SelectItem value="12">12 Weeks</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => generatePlan.mutate()}
              disabled={generatePlan.isPending}
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
                    <div className="space-y-4">
                      {(plan.workout_data as any[]).map((week: any) => (
                        <div key={week.week} className="space-y-2">
                          <h4 className="font-semibold">Week {week.week}</h4>
                          <div className="grid gap-2">
                            {week.days.map((day: any) => (
                              <div key={day.day} className="p-3 border rounded-lg space-y-2">
                                <div className="font-medium">Day {day.day}</div>
                                <div className="text-sm space-y-1">
                                  <div>
                                    <span className="font-medium">Erg:</span>{" "}
                                    {day.ergWorkout.type} - {day.ergWorkout.duration} ({day.ergWorkout.distance}m @ {day.ergWorkout.targetSplit})
                                  </div>
                                  <div>
                                    <span className="font-medium">Strength:</span>{" "}
                                    {day.strengthWorkout.exercise} - {day.strengthWorkout.sets}x{day.strengthWorkout.reps} @ {day.strengthWorkout.weight}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
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
