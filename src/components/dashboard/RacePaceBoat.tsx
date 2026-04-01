import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Ship, Target, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface RacePaceBoatProps {
  workout: {
    distance?: number | null;
    avg_split?: string | null;
    duration?: string | null;
  };
  userPRs?: { distance: number; split: string }[];
}

const PRESETS = [
  { label: "Sub-7:00 2K", distance: 2000, totalSeconds: 420, splitSeconds: 105 },
  { label: "Sub-6:30 2K", distance: 2000, totalSeconds: 390, splitSeconds: 97.5 },
  { label: "Sub-6:00 2K", distance: 2000, totalSeconds: 360, splitSeconds: 90 },
  { label: "Sub-20:00 5K", distance: 5000, totalSeconds: 1200, splitSeconds: 120 },
  { label: "Sub-18:00 5K", distance: 5000, totalSeconds: 1080, splitSeconds: 108 },
  { label: "Sub-22:00 6K", distance: 6000, totalSeconds: 1320, splitSeconds: 110 },
];

const parseSplitToSeconds = (split: string | null | undefined): number | null => {
  if (!split) return null;
  const clean = split.replace(/[^\d:.]/g, "");
  const parts = clean.split(":");
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(clean) || null;
};

const formatSeconds = (s: number): string => {
  const mins = Math.floor(s / 60);
  const secs = (s % 60).toFixed(1);
  return `${mins}:${parseFloat(secs) < 10 ? "0" : ""}${secs}`;
};

export const RacePaceBoat = ({ workout, userPRs }: RacePaceBoatProps) => {
  const [targetType, setTargetType] = useState<"pr" | "custom" | "preset">("custom");
  const [customSplit, setCustomSplit] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<string>("");

  const actualSplitSec = parseSplitToSeconds(workout.avg_split);
  const distance = workout.distance || 2000;
  const numSplits = Math.ceil(distance / 500);

  const targetSplitSec = useMemo(() => {
    if (targetType === "custom") return parseSplitToSeconds(customSplit);
    if (targetType === "preset") {
      const preset = PRESETS.find(p => p.label === selectedPreset);
      return preset?.splitSeconds || null;
    }
    if (targetType === "pr" && userPRs?.length) {
      const pr = userPRs.find(p => p.distance === distance);
      return pr ? parseSplitToSeconds(pr.split) : null;
    }
    return null;
  }, [targetType, customSplit, selectedPreset, userPRs, distance]);

  if (!actualSplitSec) return null;

  const diff = targetSplitSec ? actualSplitSec - targetSplitSec : null;
  const cumulativeDiffPerSplit = diff ? diff * numSplits : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Ship className="h-5 w-5 text-primary" />
          Race / Pace Boat
        </CardTitle>
        <CardDescription>Compare your performance against a target pace</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Target Selection */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Target Type</Label>
            <Select value={targetType} onValueChange={(v: "pr" | "custom" | "preset") => setTargetType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom Split</SelectItem>
                <SelectItem value="preset">Preset Goal</SelectItem>
                {userPRs?.length ? <SelectItem value="pr">My PR</SelectItem> : null}
              </SelectContent>
            </Select>
          </div>

          {targetType === "custom" && (
            <div className="space-y-1">
              <Label className="text-xs">Target Split (m:ss.s)</Label>
              <Input placeholder="1:45.0" value={customSplit} onChange={e => setCustomSplit(e.target.value)} />
            </div>
          )}

          {targetType === "preset" && (
            <div className="space-y-1">
              <Label className="text-xs">Preset</Label>
              <Select value={selectedPreset} onValueChange={setSelectedPreset}>
                <SelectTrigger><SelectValue placeholder="Select goal" /></SelectTrigger>
                <SelectContent>
                  {PRESETS.map(p => (
                    <SelectItem key={p.label} value={p.label}>{p.label} ({formatSeconds(p.splitSeconds)}/500m)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Summary */}
        {targetSplitSec && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <Target className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1 text-sm">
              <span className="font-medium">Your split: </span>{formatSeconds(actualSplitSec)}
              <span className="mx-2">vs</span>
              <span className="font-medium">Target: </span>{formatSeconds(targetSplitSec)}
            </div>
            {diff !== null && (
              <Badge variant="outline" className={diff > 0 ? "text-destructive border-destructive/30" : diff < 0 ? "text-green-600 border-green-500/30" : ""}>
                {diff > 0 ? <TrendingDown className="h-3 w-3 mr-1" /> : diff < 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <Minus className="h-3 w-3 mr-1" />}
                {diff > 0 ? "+" : ""}{diff.toFixed(1)}s/500m
              </Badge>
            )}
          </div>
        )}

        {/* Visual bar chart */}
        {targetSplitSec && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Split-by-split comparison ({numSplits} × 500m)</p>
            <div className="space-y-1.5">
              {Array.from({ length: numSplits }, (_, i) => {
                const maxSplit = Math.max(actualSplitSec, targetSplitSec);
                const actualWidth = (actualSplitSec / (maxSplit * 1.1)) * 100;
                const targetWidth = (targetSplitSec / (maxSplit * 1.1)) * 100;
                const ahead = actualSplitSec <= targetSplitSec;

                return (
                  <div key={i} className="space-y-0.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{(i * 500)}m–{((i + 1) * 500)}m</span>
                    </div>
                    <div className="relative h-5 rounded bg-muted/30">
                      {/* Target bar */}
                      <div
                        className="absolute top-0 h-full rounded bg-muted-foreground/20"
                        style={{ width: `${targetWidth}%` }}
                      />
                      {/* Actual bar */}
                      <div
                        className={`absolute top-0 h-full rounded ${ahead ? "bg-green-500/60" : "bg-destructive/50"}`}
                        style={{ width: `${actualWidth}%` }}
                      />
                      {/* Labels */}
                      <div className="absolute inset-0 flex items-center justify-between px-2 text-xs font-medium">
                        <span>You: {formatSeconds(actualSplitSec)}</span>
                        <span className="text-muted-foreground">Pace: {formatSeconds(targetSplitSec)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {cumulativeDiffPerSplit !== null && (
              <p className="text-xs text-muted-foreground mt-2">
                Total difference over {distance}m: <span className={`font-medium ${cumulativeDiffPerSplit > 0 ? "text-destructive" : "text-green-600"}`}>
                  {cumulativeDiffPerSplit > 0 ? "+" : ""}{cumulativeDiffPerSplit.toFixed(1)}s
                </span>
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
