import { RefreshCw } from "lucide-react";

interface Props {
  progress: number;
  refreshing: boolean;
  threshold: number;
}

export function PullToRefreshIndicator({ progress, refreshing, threshold }: Props) {
  const ready = progress >= threshold;
  const size = Math.min(progress, threshold);
  const rotation = refreshing ? undefined : (progress / threshold) * 360;

  if (progress <= 0 && !refreshing) return null;

  return (
    <div
      className="absolute left-0 right-0 top-0 z-10 flex justify-center pointer-events-none"
      style={{ height: refreshing ? threshold : progress, transition: refreshing ? "height 0.2s" : undefined }}
    >
      <div className="flex items-center justify-center h-full">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-colors ${
            ready || refreshing ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground border border-border"
          }`}
          style={{ opacity: Math.min(progress / (threshold * 0.5), 1) }}
        >
          <RefreshCw
            className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            style={refreshing ? undefined : { transform: `rotate(${rotation}deg)` }}
          />
        </div>
      </div>
    </div>
  );
}
