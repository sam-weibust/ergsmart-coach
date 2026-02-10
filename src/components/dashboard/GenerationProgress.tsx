import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";

interface GenerationProgressProps {
  currentBatch: number;
  totalBatches: number;
  isGenerating: boolean;
}

export const GenerationProgress = ({ currentBatch, totalBatches, isGenerating }: GenerationProgressProps) => {
  if (!isGenerating) return null;

  const progress = totalBatches > 0 ? (currentBatch / totalBatches) * 100 : 0;
  const startWeek = (currentBatch - 1) * 4 + 1;
  const endWeek = Math.min(currentBatch * 4, totalBatches * 4);

  return (
    <div className="space-y-3 p-4 bg-primary/5 border border-primary/20 rounded-lg animate-in fade-in duration-300">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="font-medium text-sm">Generating your training plan...</span>
      </div>
      
      <Progress value={progress} className="h-2" />
      
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          {currentBatch > 0 ? (
            <>Generating weeks {startWeek}-{endWeek}</>
          ) : (
            <>Preparing plan generation...</>
          )}
        </span>
        <span>{Math.round(progress)}% complete</span>
      </div>
      
      <div className="text-xs text-muted-foreground">
        Batch {currentBatch} of {totalBatches} • Each batch contains 4 weeks of training
      </div>
    </div>
  );
};
