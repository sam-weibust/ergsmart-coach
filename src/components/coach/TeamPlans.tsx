import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { ClipboardList, Loader2, Trash2, Zap } from "lucide-react";
import { format } from "date-fns";

interface Props {
  teamId: string;
  coachId: string;
}

interface TeamPlan {
  id: string;
  title: string;
  source: "imported" | "generated" | "custom";
  total_weeks: number;
  is_active: boolean;
  created_at: string;
  plan_data: any;
}

const SOURCE_BADGE: Record<string, { label: string; className: string }> = {
  imported: { label: "Imported", className: "bg-blue-500/20 text-blue-700 border-blue-500/30" },
  generated: { label: "Generated", className: "bg-green-500/20 text-green-700 border-green-500/30" },
  custom: { label: "My Style", className: "bg-purple-500/20 text-purple-700 border-purple-500/30" },
};

const TeamPlans = ({ teamId, coachId }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: plans = [], isLoading } = useQuery<TeamPlan[]>({
    queryKey: ["team-plans", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_plans" as any)
        .select("*")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as TeamPlan[];
    },
  });

  const handleActivate = async (planId: string, planData: any, planTitle: string) => {
    setActivatingId(planId);
    try {
      // Deactivate all plans for this team
      await supabase
        .from("team_plans" as any)
        .update({ is_active: false })
        .eq("team_id", teamId);

      // Activate selected plan
      const { error } = await supabase
        .from("team_plans" as any)
        .update({ is_active: true })
        .eq("id", planId);

      if (error) throw error;

      // Re-push personalized plan to all athletes via generate-team-plan
      // Use a lightweight approach: call the function with existing plan_data
      const { data: members } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", teamId);

      if (members && members.length > 0) {
        for (const member of members) {
          await supabase
            .from("workout_plans")
            .delete()
            .eq("user_id", member.user_id)
            .eq("coach_plan_id", planId);

          await supabase.from("workout_plans").insert({
            user_id: member.user_id,
            title: planTitle,
            workout_data: planData,
            coach_plan_id: planId,
            is_coach_assigned: true,
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ["team-plans", teamId] });
      toast({ title: "Plan activated", description: "Plan pushed to all athletes." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setActivatingId(null);
    }
  };

  const handleDelete = async (planId: string) => {
    setDeletingId(planId);
    try {
      const { error } = await supabase
        .from("team_plans" as any)
        .delete()
        .eq("id", planId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["team-plans", teamId] });
      toast({ title: "Plan deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5" />
        <h2 className="text-lg font-semibold">Team Plans</h2>
      </div>

      {plans.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No team plans yet. Import or generate a plan to get started.
          </CardContent>
        </Card>
      ) : (
        <Accordion type="single" collapsible className="space-y-2">
          {plans.map((plan) => {
            const badge = SOURCE_BADGE[plan.source] || SOURCE_BADGE.generated;
            const weeks = plan.plan_data?.plan || plan.plan_data?.weeks || [];
            const phases = Array.isArray(weeks)
              ? [...new Set(weeks.map((w: any) => w.phase).filter(Boolean))]
              : [];

            return (
              <Card key={plan.id} className={plan.is_active ? "border-green-500/50" : ""}>
                <AccordionItem value={plan.id} className="border-0">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline">
                    <div className="flex flex-col items-start gap-1 text-left w-full pr-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{plan.title}</span>
                        <Badge variant="outline" className={`text-xs ${badge.className}`}>
                          {badge.label}
                        </Badge>
                        {plan.is_active && (
                          <Badge variant="outline" className="text-xs bg-green-500/20 text-green-700 border-green-500/30">
                            Active
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {plan.total_weeks} weeks · Created {format(new Date(plan.created_at), "MMM d, yyyy")}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    {phases.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs text-muted-foreground mb-1">Phases</p>
                        <div className="flex flex-wrap gap-1">
                          {phases.map((p) => (
                            <Badge key={String(p)} variant="secondary" className="text-xs">
                              {String(p)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 mt-3">
                      {!plan.is_active && (
                        <Button
                          size="sm"
                          onClick={() => handleActivate(plan.id, plan.plan_data, plan.title)}
                          disabled={activatingId === plan.id}
                        >
                          {activatingId === plan.id ? (
                            <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Activating...</>
                          ) : (
                            <><Zap className="h-3 w-3 mr-1" /> Activate</>
                          )}
                        </Button>
                      )}

                      {confirmDeleteId === plan.id ? (
                        <>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(plan.id)}
                            disabled={deletingId === plan.id}
                          >
                            {deletingId === plan.id ? (
                              <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Deleting...</>
                            ) : "Confirm Delete"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmDeleteId(plan.id)}
                          disabled={deletingId === plan.id}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Card>
            );
          })}
        </Accordion>
      )}
    </div>
  );
};

export default TeamPlans;
