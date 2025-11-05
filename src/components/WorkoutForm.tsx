import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface WorkoutFormProps {
  onSubmit: (data: any) => void;
  isLoading: boolean;
}

const WorkoutForm = ({ onSubmit, isLoading }: WorkoutFormProps) => {
  const [formData, setFormData] = useState({
    experience: "intermediate",
    goals: "",
    lastWorkouts: "",
    weight: "",
    height: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Training Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="experience">Experience Level</Label>
            <Select
              value={formData.experience}
              onValueChange={(value) => setFormData({ ...formData, experience: value })}
            >
              <SelectTrigger id="experience">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="beginner">Beginner (0-6 months)</SelectItem>
                <SelectItem value="intermediate">Intermediate (6-24 months)</SelectItem>
                <SelectItem value="advanced">Advanced (2-5 years)</SelectItem>
                <SelectItem value="elite">Elite (5+ years)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="goals">Training Goals</Label>
            <Textarea
              id="goals"
              placeholder="E.g., Improve 2k time, build endurance, prepare for competition..."
              value={formData.goals}
              onChange={(e) => setFormData({ ...formData, goals: e.target.value })}
              required
              className="min-h-24"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lastWorkouts">Recent Workouts (Optional)</Label>
            <Textarea
              id="lastWorkouts"
              placeholder="E.g., 5x1500m intervals @ 1:55 split, 10k steady state @ 2:10 split..."
              value={formData.lastWorkouts}
              onChange={(e) => setFormData({ ...formData, lastWorkouts: e.target.value })}
              className="min-h-24"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="weight">Weight (kg)</Label>
              <Input
                id="weight"
                type="number"
                placeholder="70"
                value={formData.weight}
                onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="height">Height (cm)</Label>
              <Input
                id="height"
                type="number"
                placeholder="180"
                value={formData.height}
                onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                required
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Your Plan...
              </>
            ) : (
              "Generate Training Plan"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default WorkoutForm;