import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Activity, Target, Lightbulb, Apple, HeartPulse } from "lucide-react";

interface WorkoutDisplayProps {
  plan: {
    title: string;
    description: string;
    workouts: Array<{
      day: string;
      type: string;
      duration: string;
      intensity: string;
      details: string;
      focus: string;
    }>;
    tips: string[];
    nutritionAdvice: string;
    recoveryNotes: string;
  };
}

const WorkoutDisplay = ({ plan }: WorkoutDisplayProps) => {
  const getIntensityColor = (intensity: string) => {
    switch (intensity.toLowerCase()) {
      case "low":
        return "bg-green-500/10 text-green-700 dark:text-green-400";
      case "medium":
        return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
      case "high":
        return "bg-red-500/10 text-red-700 dark:text-red-400";
      default:
        return "bg-primary/10 text-primary";
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-2xl">{plan.title}</CardTitle>
          <CardDescription>{plan.description}</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4">
        {plan.workouts.map((workout, index) => (
          <Card key={index} className="hover:border-primary/40 transition-colors">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-xl">{workout.day}</CardTitle>
                  <CardDescription className="mt-1">{workout.type}</CardDescription>
                </div>
                <Badge className={getIntensityColor(workout.intensity)}>
                  {workout.intensity}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Activity className="h-4 w-4" />
                <span>{workout.duration}</span>
              </div>
              
              <div className="space-y-2">
                <p className="text-sm leading-relaxed">{workout.details}</p>
              </div>

              <div className="flex items-start gap-2 p-3 bg-accent/10 rounded-lg">
                <Target className="h-4 w-4 text-accent mt-1 flex-shrink-0" />
                <p className="text-sm text-accent-foreground">
                  <strong>Focus:</strong> {workout.focus}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {plan.tips && plan.tips.length > 0 && (
        <Card className="border-secondary/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-secondary" />
              <CardTitle>Training Tips</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {plan.tips.map((tip, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-secondary mt-1">•</span>
                  <span className="text-sm">{tip}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {plan.nutritionAdvice && (
          <Card className="border-accent/20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Apple className="h-5 w-5 text-accent" />
                <CardTitle>Nutrition</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{plan.nutritionAdvice}</p>
            </CardContent>
          </Card>
        )}

        {plan.recoveryNotes && (
          <Card className="border-destructive/20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <HeartPulse className="h-5 w-5 text-destructive" />
                <CardTitle>Recovery</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{plan.recoveryNotes}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default WorkoutDisplay;