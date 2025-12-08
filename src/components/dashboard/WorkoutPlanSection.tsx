import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Share2, Dumbbell, Utensils } from "lucide-react";

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
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
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

  const { data: plans, isLoading: plansLoading } = useQuery({
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

  // Get friends for sharing
  const { data: friends } = useQuery({
    queryKey: ["friends-for-sharing"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data } = await supabase
        .from("friendships")
        .select("*, friend:profiles!friendships_friend_id_fkey(id, full_name, email)")
        .eq("user_id", user.id)
        .eq("status", "accepted");

      return data || [];
    },
  });

  // Get teams for sharing (coaches only)
  const { data: teams } = useQuery({
    queryKey: ["teams-for-sharing"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data } = await supabase
        .from("teams")
        .select("*")
        .eq("coach_id", user.id);

      return data || [];
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

  const sharePlan = useMutation({
    mutationFn: async ({ planId, userId, teamId }: { planId: string; userId?: string; teamId?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("plan_shares").insert({
        plan_id: planId,
        shared_by: user.id,
        shared_with_user: userId || null,
        shared_with_team: teamId || null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Plan shared!" });
      setSelectedPlanId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error sharing", description: error.message, variant: "destructive" });
    },
  });

  const isProfileComplete = profile?.weight && profile?.height;
  const isCoach = (profile as any)?.user_type === "coach";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Generate Training Plan</CardTitle>
          <CardDescription>
            Create a periodized rowing program with progressive speed training, full strength workouts, and meal plans
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

      {/* Loading Skeleton */}
      {plansLoading && (
        <Card>
          <CardHeader>
            <CardTitle>Your Training Plans</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="space-y-3">
                <div className="flex justify-between items-center">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-20 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!plansLoading && plans && plans.length > 0 && (
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
                    <div className="space-y-4 max-h-[600px] overflow-y-auto">
                      {Array.isArray(plan.workout_data) && plan.workout_data.length > 0 ? (plan.workout_data as any[]).map((week: any, weekIdx: number) => (
                        <div key={week?.week ?? weekIdx} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">Week {week?.week ?? weekIdx + 1}</h4>
                            {week?.phase && (
                              <Badge variant="outline" className="text-xs">
                                {week.phase}
                              </Badge>
                            )}
                          </div>
                          <div className="grid gap-3">
                            {Array.isArray(week?.days) ? week.days.map((day: any, dayIdx: number) => (
                              <div key={day?.day ?? dayIdx} className="p-4 border rounded-lg space-y-3">
                                <div className="font-medium text-lg">Day {day?.day ?? dayIdx + 1}</div>
                                
                                {/* Erg Workout */}
                                {day?.ergWorkout && (
                                  <div className="flex flex-wrap items-start gap-2">
                                    <Badge variant="outline" className={getZoneColor(day.ergWorkout.zone)}>
                                      {day.ergWorkout.zone || "Erg"}
                                    </Badge>
                                    <div className="flex-1">
                                      <div className="font-medium">{day.ergWorkout.description || "Workout"}</div>
                                      <div className="text-sm text-muted-foreground">
                                        {day.ergWorkout.duration && `${day.ergWorkout.duration}`}
                                        {day.ergWorkout.distance && ` • ${day.ergWorkout.distance}m`}
                                        {day.ergWorkout.targetSplit && ` • Target: ${day.ergWorkout.targetSplit}`}
                                        {day.ergWorkout.rate && ` • ${day.ergWorkout.rate}`}
                                      </div>
                                      {day.ergWorkout.notes && (
                                        <div className="text-xs text-muted-foreground italic mt-1">
                                          {day.ergWorkout.notes}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                                
                                {/* Full Strength Workout */}
                                {day?.strengthWorkout && (
                                  <div className="border-l-2 border-primary/30 pl-3">
                                    <div className="flex items-center gap-2 mb-2">
                                      <Dumbbell className="h-4 w-4 text-primary" />
                                      <span className="font-medium">Strength: {day.strengthWorkout.focus || "Full Body"}</span>
                                    </div>
                                    {Array.isArray(day.strengthWorkout.exercises) && day.strengthWorkout.exercises.length > 0 ? (
                                      <div className="grid gap-1 text-sm">
                                        {day.strengthWorkout.exercises.map((ex: any, idx: number) => (
                                          <div key={idx} className="flex justify-between">
                                            <span>{ex?.exercise || "Exercise"}</span>
                                            <span className="text-muted-foreground">
                                              {ex?.sets ?? 0}x{ex?.reps ?? 0}
                                              {ex?.weight && ` @ ${ex.weight}`}
                                              {ex?.notes && ` (${ex.notes})`}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : day.strengthWorkout.exercise ? (
                                      <span className="text-sm">
                                        {day.strengthWorkout.exercise} - {day.strengthWorkout.sets ?? 0}x{day.strengthWorkout.reps ?? 0}
                                        {day.strengthWorkout.weight && ` @ ${day.strengthWorkout.weight}`}
                                      </span>
                                    ) : (
                                      <span className="text-sm text-muted-foreground">No exercises listed</span>
                                    )}
                                  </div>
                                )}

                                {/* Meal Plan */}
                                {day?.mealPlan && (
                                  <div className="border-l-2 border-secondary/30 pl-3">
                                    <div className="flex items-center gap-2 mb-2">
                                      <Utensils className="h-4 w-4 text-secondary" />
                                      <span className="font-medium">Meal Plan</span>
                                      {day.mealPlan.totalCalories && (
                                        <Badge variant="secondary" className="text-xs">
                                          {day.mealPlan.totalCalories} cal
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="grid gap-1 text-sm">
                                      {day.mealPlan.breakfast && (
                                        <div><span className="font-medium">Breakfast:</span> {day.mealPlan.breakfast}</div>
                                      )}
                                      {day.mealPlan.lunch && (
                                        <div><span className="font-medium">Lunch:</span> {day.mealPlan.lunch}</div>
                                      )}
                                      {day.mealPlan.dinner && (
                                        <div><span className="font-medium">Dinner:</span> {day.mealPlan.dinner}</div>
                                      )}
                                      {day.mealPlan.snacks && (
                                        <div><span className="font-medium">Snacks:</span> {day.mealPlan.snacks}</div>
                                      )}
                                      {day.mealPlan.macros && (
                                        <div className="text-xs text-muted-foreground mt-1">
                                          Macros: {day.mealPlan.macros}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )) : (
                              <div className="text-muted-foreground text-sm">No days in this week</div>
                            )}
                          </div>
                        </div>
                      )) : (
                        <div className="text-muted-foreground p-4 text-center">
                          {plan.workout_data ? "Unable to display workout data" : "No workout data available"}
                        </div>
                      )}
                      
                      <div className="flex gap-2 pt-4 border-t">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" onClick={() => setSelectedPlanId(plan.id)}>
                              <Share2 className="h-4 w-4 mr-2" />
                              Share Plan
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Share Training Plan</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              {friends && friends.length > 0 && (
                                <div>
                                  <h4 className="font-medium mb-2">Share with Friend</h4>
                                  <div className="space-y-2">
                                    {friends.map((f: any) => (
                                      <Button
                                        key={f.id}
                                        variant="outline"
                                        className="w-full justify-start"
                                        onClick={() => sharePlan.mutate({ planId: plan.id, userId: f.friend.id })}
                                      >
                                        {f.friend.full_name || f.friend.email}
                                      </Button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {isCoach && teams && teams.length > 0 && (
                                <div>
                                  <h4 className="font-medium mb-2">Share with Team</h4>
                                  <div className="space-y-2">
                                    {teams.map((team: any) => (
                                      <Button
                                        key={team.id}
                                        variant="outline"
                                        className="w-full justify-start"
                                        onClick={() => sharePlan.mutate({ planId: plan.id, teamId: team.id })}
                                      >
                                        {team.name}
                                      </Button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {(!friends?.length && !teams?.length) && (
                                <p className="text-muted-foreground text-center py-4">
                                  Add friends or create teams to share plans
                                </p>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                        
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deletePlan.mutate(plan.id)}
                        >
                          Delete Plan
                        </Button>
                      </div>
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