import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface GoalsSectionProps {
  profile: any;
}

const GoalsSection = ({ profile }: GoalsSectionProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [goals, setGoals] = useState({
    current_2k_time: "",
    goal_2k_time: "",
    current_5k_time: "",
    goal_5k_time: "",
    current_6k_time: "",
    goal_6k_time: "",
    notes: "",
  });

  useEffect(() => {
    fetchGoals();
  }, [profile]);

  const fetchGoals = async () => {
    if (!profile) return;

    const { data } = await supabase
      .from("user_goals")
      .select("*")
      .eq("user_id", profile.id)
      .maybeSingle();

    if (data) {
      setGoals({
        current_2k_time: formatInterval(data.current_2k_time as string | null),
        goal_2k_time: formatInterval(data.goal_2k_time as string | null),
        current_5k_time: formatInterval(data.current_5k_time as string | null),
        goal_5k_time: formatInterval(data.goal_5k_time as string | null),
        current_6k_time: formatInterval(data.current_6k_time as string | null),
        goal_6k_time: formatInterval(data.goal_6k_time as string | null),
        notes: data.notes || "",
      });
    }
  };

  const formatInterval = (interval: string | null) => {
    if (!interval) return "";
    // Format HH:MM:SS to MM:SS.S
    const match = interval.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      const [, hours, minutes, seconds] = match;
      const totalMinutes = parseInt(hours) * 60 + parseInt(minutes);
      return `${totalMinutes}:${seconds}`;
    }
    return interval;
  };

  const parseTimeToInterval = (time: string) => {
    if (!time) return null;
    // Parse MM:SS or MM:SS.S format
    const parts = time.split(":");
    if (parts.length !== 2) return null;
    
    const minutes = parseInt(parts[0]);
    const seconds = parseFloat(parts[1]);
    
    if (isNaN(minutes) || isNaN(seconds)) return null;
    
    return `00:${minutes.toString().padStart(2, '0')}:${Math.floor(seconds).toString().padStart(2, '0')}`;
  };

  const handleSave = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("user_goals")
        .upsert({
          user_id: profile.id,
          current_2k_time: parseTimeToInterval(goals.current_2k_time),
          goal_2k_time: parseTimeToInterval(goals.goal_2k_time),
          current_5k_time: parseTimeToInterval(goals.current_5k_time),
          goal_5k_time: parseTimeToInterval(goals.goal_5k_time),
          current_6k_time: parseTimeToInterval(goals.current_6k_time),
          goal_6k_time: parseTimeToInterval(goals.goal_6k_time),
          notes: goals.notes,
        });

      if (error) throw error;

      toast({
        title: "Goals saved!",
        description: "Your training goals have been updated.",
      });
    } catch (error) {
      console.error("Error saving goals:", error);
      toast({
        title: "Error",
        description: "Failed to save goals. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Training Goals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">2K Erg</h3>
            <div className="space-y-2">
              <Label htmlFor="current_2k">Current Time (MM:SS)</Label>
              <Input
                id="current_2k"
                placeholder="7:30"
                value={goals.current_2k_time}
                onChange={(e) => setGoals({ ...goals, current_2k_time: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal_2k">Goal Time (MM:SS)</Label>
              <Input
                id="goal_2k"
                placeholder="7:00"
                value={goals.goal_2k_time}
                onChange={(e) => setGoals({ ...goals, goal_2k_time: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-lg">5K Erg</h3>
            <div className="space-y-2">
              <Label htmlFor="current_5k">Current Time (MM:SS)</Label>
              <Input
                id="current_5k"
                placeholder="19:30"
                value={goals.current_5k_time}
                onChange={(e) => setGoals({ ...goals, current_5k_time: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal_5k">Goal Time (MM:SS)</Label>
              <Input
                id="goal_5k"
                placeholder="19:00"
                value={goals.goal_5k_time}
                onChange={(e) => setGoals({ ...goals, goal_5k_time: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-lg">6K Erg</h3>
            <div className="space-y-2">
              <Label htmlFor="current_6k">Current Time (MM:SS)</Label>
              <Input
                id="current_6k"
                placeholder="23:00"
                value={goals.current_6k_time}
                onChange={(e) => setGoals({ ...goals, current_6k_time: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal_6k">Goal Time (MM:SS)</Label>
              <Input
                id="goal_6k"
                placeholder="22:30"
                value={goals.goal_6k_time}
                onChange={(e) => setGoals({ ...goals, goal_6k_time: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Additional Goals & Notes</Label>
          <Textarea
            id="notes"
            placeholder="E.g., Improve endurance, prepare for competition..."
            value={goals.notes}
            onChange={(e) => setGoals({ ...goals, notes: e.target.value })}
            className="min-h-24"
          />
        </div>

        <Button onClick={handleSave} disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Goals"
          )}
        </Button>
      </CardContent>
    </Card>
  );
};

export default GoalsSection;