import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, TrendingUp, Clock, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Paul's Law: t2 = t1 * (d2/d1)^1.16
// This is the standard formula for predicting erg times

const DISTANCES = [
  { value: 500, label: "500m" },
  { value: 1000, label: "1000m" },
  { value: 2000, label: "2K" },
  { value: 5000, label: "5K" },
  { value: 6000, label: "6K" },
  { value: 10000, label: "10K" },
];

const parseTimeToSeconds = (time: string): number | null => {
  // Format: MM:SS.t or M:SS.t or SS.t
  const parts = time.trim().split(":");
  
  if (parts.length === 2) {
    const minutes = parseInt(parts[0]);
    const seconds = parseFloat(parts[1]);
    if (isNaN(minutes) || isNaN(seconds)) return null;
    return minutes * 60 + seconds;
  } else if (parts.length === 1) {
    const seconds = parseFloat(parts[0]);
    if (isNaN(seconds)) return null;
    return seconds;
  }
  return null;
};

const formatSecondsToTime = (totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
};

const predictTime = (knownTime: number, knownDistance: number, targetDistance: number): number => {
  // Paul's Law formula
  return knownTime * Math.pow(targetDistance / knownDistance, 1.16);
};

const calculateSplit = (totalSeconds: number, distance: number): string => {
  const splitSeconds = (totalSeconds / distance) * 500;
  return formatSecondsToTime(splitSeconds);
};

export const ErgPredictor = () => {
  const [knownTime, setKnownTime] = useState("");
  const [knownDistance, setKnownDistance] = useState<string>("");
  const [predictions, setPredictions] = useState<{ distance: number; time: string; split: string }[]>([]);
  const [error, setError] = useState("");

  const handleCalculate = () => {
    setError("");
    const timeInSeconds = parseTimeToSeconds(knownTime);
    const distance = parseInt(knownDistance);

    if (!timeInSeconds) {
      setError("Please enter a valid time (format: MM:SS.t)");
      return;
    }

    if (!distance) {
      setError("Please select a distance");
      return;
    }

    const newPredictions = DISTANCES
      .filter(d => d.value !== distance)
      .map(d => {
        const predictedSeconds = predictTime(timeInSeconds, distance, d.value);
        return {
          distance: d.value,
          time: formatSecondsToTime(predictedSeconds),
          split: calculateSplit(predictedSeconds, d.value),
        };
      });

    setPredictions(newPredictions);
  };

  const getDistanceLabel = (meters: number): string => {
    return DISTANCES.find(d => d.value === meters)?.label || `${meters}m`;
  };

  return (
    <Card className="shadow-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" />
          2K Predictor
        </CardTitle>
        <CardDescription>
          Enter a known time to predict your performance at other distances using Paul's Law
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Input Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="known-distance">Known Distance</Label>
            <Select value={knownDistance} onValueChange={setKnownDistance}>
              <SelectTrigger>
                <SelectValue placeholder="Select distance" />
              </SelectTrigger>
              <SelectContent>
                {DISTANCES.map(d => (
                  <SelectItem key={d.value} value={d.value.toString()}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="known-time">Your Time</Label>
            <Input
              id="known-time"
              placeholder="e.g., 7:05.2"
              value={knownTime}
              onChange={e => setKnownTime(e.target.value)}
            />
          </div>

          <div className="flex items-end">
            <Button onClick={handleCalculate} className="w-full">
              <Zap className="h-4 w-4 mr-2" />
              Calculate
            </Button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {/* Predictions */}
        {predictions.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Predicted Times</h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {predictions.map(pred => (
                <div
                  key={pred.distance}
                  className="p-4 rounded-xl bg-muted/50 border border-border hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary" className="font-semibold">
                      {getDistanceLabel(pred.distance)}
                    </Badge>
                    {pred.distance === 2000 && (
                      <Badge variant="default" className="text-xs">
                        2K Target
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-2xl font-bold text-foreground">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    {pred.time}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Split: {pred.split} /500m
                  </p>
                </div>
              ))}
            </div>

            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-xs text-muted-foreground">
                <strong>Note:</strong> Predictions use Paul's Law (t₂ = t₁ × (d₂/d₁)^1.16). 
                Actual times may vary based on training, pacing strategy, and fitness level.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
