import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, TrendingUp, Lightbulb, Sparkles, X } from "lucide-react";

interface WorkoutFeedbackProps {
  feedback: {
    overallRating: "excellent" | "good" | "average" | "needs_improvement";
    summary: string;
    strengths: string[];
    improvements: string[];
    recommendation: string;
    motivationalMessage: string;
    progressNote?: string;
  };
  onDismiss: () => void;
}

const getRatingColor = (rating: string) => {
  switch (rating) {
    case "excellent": return "bg-green-500/20 text-green-700 border-green-500/30";
    case "good": return "bg-blue-500/20 text-blue-700 border-blue-500/30";
    case "average": return "bg-yellow-500/20 text-yellow-700 border-yellow-500/30";
    case "needs_improvement": return "bg-orange-500/20 text-orange-700 border-orange-500/30";
    default: return "bg-muted text-muted-foreground";
  }
};

const getRatingLabel = (rating: string) => {
  switch (rating) {
    case "excellent": return "Excellent! 🏆";
    case "good": return "Good Work! 💪";
    case "average": return "Solid Effort 👍";
    case "needs_improvement": return "Keep Going 🚀";
    default: return rating;
  }
};

export const WorkoutFeedback = ({ feedback, onDismiss }: WorkoutFeedbackProps) => {
  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent animate-in slide-in-from-top duration-300">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Performance Feedback
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onDismiss}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={`text-sm px-3 py-1 ${getRatingColor(feedback.overallRating)}`}>
            {getRatingLabel(feedback.overallRating)}
          </Badge>
        </div>

        <p className="text-sm">{feedback.summary}</p>

        {feedback.strengths.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              What You Did Well
            </h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              {feedback.strengths.map((strength, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-green-600">•</span>
                  {strength}
                </li>
              ))}
            </ul>
          </div>
        )}

        {feedback.improvements.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              Areas to Focus On
            </h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              {feedback.improvements.map((improvement, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-blue-600">•</span>
                  {improvement}
                </li>
              ))}
            </ul>
          </div>
        )}

        {feedback.recommendation && (
          <div className="p-3 bg-accent/50 rounded-lg">
            <h4 className="text-sm font-medium flex items-center gap-2 mb-1">
              <Lightbulb className="h-4 w-4 text-yellow-600" />
              Next Workout Tip
            </h4>
            <p className="text-sm text-muted-foreground">{feedback.recommendation}</p>
          </div>
        )}

        {feedback.progressNote && (
          <p className="text-xs text-muted-foreground italic border-t pt-3">
            📈 {feedback.progressNote}
          </p>
        )}

        <p className="text-sm font-medium text-primary">
          {feedback.motivationalMessage}
        </p>
      </CardContent>
    </Card>
  );
};
