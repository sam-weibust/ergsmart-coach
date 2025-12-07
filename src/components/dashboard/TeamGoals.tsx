import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Target, Plus, Trash2, Calendar } from "lucide-react";

interface TeamGoalsProps {
  teamId: string;
  isCoach: boolean;
  currentUserId: string;
}

export const TeamGoals = ({ teamId, isCoach, currentUserId }: TeamGoalsProps) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: goals } = useQuery({
    queryKey: ["team-goals", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_goals")
        .select("*")
        .eq("team_id", teamId)
        .order("target_date", { ascending: true });
      return data || [];
    },
  });

  const addGoal = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Title is required");

      const { error } = await supabase.from("team_goals").insert({
        team_id: teamId,
        title: title.trim(),
        description: description.trim() || null,
        target_date: targetDate || null,
        created_by: currentUserId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Goal added!" });
      setTitle("");
      setDescription("");
      setTargetDate("");
      queryClient.invalidateQueries({ queryKey: ["team-goals", teamId] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteGoal = useMutation({
    mutationFn: async (goalId: string) => {
      const { error } = await supabase.from("team_goals").delete().eq("id", goalId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Goal removed" });
      queryClient.invalidateQueries({ queryKey: ["team-goals", teamId] });
    },
  });

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const isUpcoming = (date: string) => {
    return new Date(date) > new Date();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-5 w-5 text-primary" />
          Team Goals
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isCoach && (
          <div className="space-y-2 pb-4 border-b">
            <Input
              placeholder="Goal title (e.g., 'Sub 7:00 2K')"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Input
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="flex gap-2">
              <Input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="flex-1"
              />
              <Button onClick={() => addGoal.mutate()} disabled={addGoal.isPending}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {goals?.map((goal: any) => (
            <div
              key={goal.id}
              className={`p-3 rounded-lg border ${
                goal.target_date && !isUpcoming(goal.target_date)
                  ? "border-muted bg-muted/30"
                  : "border-primary/20 bg-primary/5"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h4 className="font-medium text-sm">{goal.title}</h4>
                  {goal.description && (
                    <p className="text-xs text-muted-foreground mt-1">{goal.description}</p>
                  )}
                  {goal.target_date && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {formatDate(goal.target_date)}
                      {!isUpcoming(goal.target_date) && (
                        <span className="text-destructive ml-1">(Past)</span>
                      )}
                    </div>
                  )}
                </div>
                {isCoach && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => deleteGoal.mutate(goal.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          
          {(!goals || goals.length === 0) && (
            <p className="text-center text-muted-foreground text-sm py-4">
              {isCoach ? "Add your first team goal above!" : "No team goals set yet."}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
