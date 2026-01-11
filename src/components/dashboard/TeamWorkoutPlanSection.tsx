import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Dumbbell, Utensils, ChevronDown, ChevronUp, Trash2, Upload } from "lucide-react";
import { SpreadsheetUpload } from "./SpreadsheetUpload";

interface TeamWorkoutPlanSectionProps {
  teamId: string;
  teamName: string;
  profile: any;
}

const getZoneColor = (zone: string) => {
  switch (zone?.toUpperCase()) {
    case "UT2": return "bg-green-500/20 text-green-700 border-green-500/30";
    case "UT1": return "bg-blue-500/20 text-blue-700 border-blue-500/30";
    case "TR": return "bg-yellow-500/20 text-yellow-700 border-yellow-500/30";
    case "AT": return "bg-red-500/20 text-red-700 border-red-500/30";
    default: return "bg-muted text-muted-foreground";
  }
};

export const TeamWorkoutPlanSection = ({ teamId, teamName, profile }: TeamWorkoutPlanSectionProps) => {
  const [months, setMonths] = useState<string>("3");
  const [expandedWeeks, setExpandedWeeks] = useState<Record<string, string[]>>({});
  const [showUpload, setShowUpload] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const toggleAllWeeks = (planId: string, weeks: any[]) => {
    const weekIds = weeks.map((_, idx) => `week-${idx}`);
    const currentExpanded = expandedWeeks[planId] || [];
    
    if (currentExpanded.length === weekIds.length) {
      setExpandedWeeks(prev => ({ ...prev, [planId]: [] }));
    } else {
      setExpandedWeeks(prev => ({ ...prev, [planId]: weekIds }));
    }
  };

  // Get team plans shared with this team
  const { data: teamPlans, isLoading: plansLoading } = useQuery({
    queryKey: ["team-workout-plans", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plan_shares")
        .select(`
          *,
          plan:workout_plans(*)
        `)
        .eq("shared_with_team", teamId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data?.map(share => share.plan).filter(Boolean) || [];
    },
    enabled: !!teamId,
  });

  const generateTeamPlan = useMutation({
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
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: async (data) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Create the workout plan
      const { data: newPlan, error: planError } = await supabase
        .from("workout_plans")
        .insert({
          user_id: user.id,
          title: `${teamName} - ${months}-Month Training Plan`,
          description: `Team plan generated for ${teamName}`,
          workout_data: data.plan,
        })
        .select()
        .single();

      if (planError) throw planError;

      // Share it with the team
      const { error: shareError } = await supabase
        .from("plan_shares")
        .insert({
          plan_id: newPlan.id,
          shared_by: user.id,
          shared_with_team: teamId,
        });

      if (shareError) throw shareError;

      toast({
        title: "Team Plan Generated",
        description: `Your ${months}-month plan is ready and shared with ${teamName}!`,
      });
      queryClient.invalidateQueries({ queryKey: ["team-workout-plans", teamId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const removeTeamPlan = useMutation({
    mutationFn: async (planId: string) => {
      const { error } = await supabase
        .from("plan_shares")
        .delete()
        .eq("plan_id", planId)
        .eq("shared_with_team", teamId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Plan removed from team" });
      queryClient.invalidateQueries({ queryKey: ["team-workout-plans", teamId] });
    },
  });

  const isProfileComplete = profile?.weight && profile?.height;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Team Training Plans</CardTitle>
          <CardDescription className="text-sm">
            Generate or upload training plans for your team
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isProfileComplete && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-700 dark:text-yellow-400">
              Complete your profile (weight/height) before generating plans.
            </div>
          )}
          
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className={getZoneColor("UT2")}>UT2: Base</Badge>
            <Badge variant="outline" className={getZoneColor("UT1")}>UT1: Aerobic</Badge>
            <Badge variant="outline" className={getZoneColor("TR")}>TR: Threshold</Badge>
            <Badge variant="outline" className={getZoneColor("AT")}>AT: High intensity</Badge>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <Select value={months} onValueChange={setMonths}>
              <SelectTrigger className="w-32">
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
              onClick={() => generateTeamPlan.mutate()}
              disabled={generateTeamPlan.isPending || !isProfileComplete}
              size="sm"
            >
              {generateTeamPlan.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate Plan
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowUpload(!showUpload)}
            >
              <Upload className="h-4 w-4 mr-2" />
              Import Plan
            </Button>
          </div>
          
          {showUpload && (
            <div className="pt-2">
              <SpreadsheetUpload teamId={teamId} onSuccess={() => {
                setShowUpload(false);
                queryClient.invalidateQueries({ queryKey: ["team-workout-plans", teamId] });
              }} />
            </div>
          )}
        </CardContent>
      </Card>

      {plansLoading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {!plansLoading && teamPlans && teamPlans.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Shared Plans</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {teamPlans.map((plan: any) => {
                const workoutWeeks = Array.isArray(plan.workout_data) ? plan.workout_data as any[] : [];
                const planExpandedWeeks = expandedWeeks[plan.id] || [];
                const allExpanded = workoutWeeks.length > 0 && planExpandedWeeks.length === workoutWeeks.length;
                
                return (
                  <AccordionItem key={plan.id} value={plan.id}>
                    <AccordionTrigger>
                      <div className="flex justify-between w-full pr-4">
                        <span className="text-sm">{plan.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(plan.created_at!).toLocaleDateString()}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3 max-h-[400px] overflow-y-auto">
                        {workoutWeeks.length > 0 && (
                          <div className="flex justify-between mb-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => toggleAllWeeks(plan.id, workoutWeeks)}
                            >
                              {allExpanded ? (
                                <>
                                  <ChevronUp className="h-4 w-4 mr-1" />
                                  Collapse
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="h-4 w-4 mr-1" />
                                  Expand All
                                </>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => removeTeamPlan.mutate(plan.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                        
                        {workoutWeeks.length > 0 ? (
                          <Accordion 
                            type="multiple" 
                            value={planExpandedWeeks}
                            onValueChange={(values) => setExpandedWeeks(prev => ({ ...prev, [plan.id]: values }))}
                            className="w-full"
                          >
                            {workoutWeeks.map((week: any, weekIdx: number) => (
                              <AccordionItem key={weekIdx} value={`week-${weekIdx}`}>
                                <AccordionTrigger className="hover:no-underline py-2">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm">Week {week?.week ?? weekIdx + 1}</span>
                                    {week?.phase && (
                                      <Badge variant="outline" className="text-xs">
                                        {week.phase}
                                      </Badge>
                                    )}
                                  </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                  <div className="grid gap-2">
                                    {Array.isArray(week?.days) ? week.days.map((day: any, dayIdx: number) => (
                                      <div key={day?.day ?? dayIdx} className="p-3 border rounded-lg space-y-2 text-sm">
                                        <div className="font-medium">Day {day?.day ?? dayIdx + 1}</div>
                                        
                                        {day?.ergWorkout && (
                                          <div className="flex flex-wrap items-start gap-2">
                                            <Badge variant="outline" className={getZoneColor(day.ergWorkout.zone)}>
                                              {day.ergWorkout.zone || "Erg"}
                                            </Badge>
                                            <div className="flex-1">
                                              <div>{day.ergWorkout.description || "Workout"}</div>
                                              <div className="text-xs text-muted-foreground">
                                                {day.ergWorkout.duration && `${day.ergWorkout.duration}`}
                                                {day.ergWorkout.distance && ` • ${day.ergWorkout.distance}m`}
                                                {day.ergWorkout.targetSplit && ` • ${day.ergWorkout.targetSplit}`}
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                        
                                        {day?.strengthWorkout && (
                                          <div className="flex items-center gap-2 text-muted-foreground">
                                            <Dumbbell className="h-3 w-3" />
                                            <span>{day.strengthWorkout.focus || "Strength"}</span>
                                          </div>
                                        )}

                                        {day?.yogaSession && (
                                          <div className="text-muted-foreground">
                                            🧘 Rest Day - {day.yogaSession.focus || "Recovery"}
                                          </div>
                                        )}

                                        {day?.mealPlan && (
                                          <div className="flex items-center gap-2 text-muted-foreground">
                                            <Utensils className="h-3 w-3" />
                                            <span>Meal plan included</span>
                                          </div>
                                        )}
                                      </div>
                                    )) : (
                                      <div className="text-muted-foreground text-sm">No days</div>
                                    )}
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            ))}
                          </Accordion>
                        ) : (
                          <div className="text-muted-foreground p-4 text-center text-sm">
                            No workout data available
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </CardContent>
        </Card>
      )}

      {!plansLoading && (!teamPlans || teamPlans.length === 0) && (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground text-sm">
            No training plans shared with this team yet.
          </CardContent>
        </Card>
      )}
    </div>
  );
};
