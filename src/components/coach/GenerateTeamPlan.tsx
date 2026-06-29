import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeAI } from "@/lib/aiInvoke";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Brain, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface Props {
  teamId: string;
  coachId: string;
  profile: any;
  mode: "default" | "custom";
}

type Step = "idle" | "generating" | "personalizing" | "done" | "error";

const WEEKS_OPTIONS = ["4", "8", "12", "16", "24"];
const INTENSITIES = ["Easy", "Moderate", "Hard"];
const GOALS = ["Base Building", "Race Prep", "Tryout Prep", "Off Season"];

const GenerateTeamPlan = ({ teamId, coachId, mode }: Props) => {
  const { toast } = useToast();
  const [weeks, setWeeks] = useState("8");
  const [intensity, setIntensity] = useState("Moderate");
  const [goal, setGoal] = useState("Base Building");
  const [goalDate, setGoalDate] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [result, setResult] = useState<{ athletes_updated: number; total_weeks: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Check if custom philosophy exists
  const { data: philosophy, isLoading: philLoading } = useQuery({
    queryKey: ["team-training-philosophy", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_training_philosophy" as any)
        .select("philosophy")
        .eq("team_id", teamId)
        .maybeSingle();
      return data;
    },
    enabled: mode === "custom",
  });

  const hasPhilosophy = !!philosophy?.philosophy;
  const isCustomMissingPhilosophy = mode === "custom" && !philLoading && !hasPhilosophy;

  const handleGenerate = async () => {
    setStep("generating");
    setErrorMsg("");

    try {
      setStep("personalizing");

      const { data, error } = await invokeAI("generate-team-plan", {
        body: {
          team_id: teamId,
          coach_id: coachId,
          weeks: parseInt(weeks),
          intensity,
          goal,
          goal_date: goalDate || null,
          use_custom_philosophy: mode === "custom",
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setResult({ athletes_updated: data.athletes_updated, total_weeks: data.total_weeks });
      setStep("done");
    } catch (err: any) {
      setErrorMsg(err.message || "Unknown error");
      setStep("error");
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    }
  };

  const reset = () => {
    setStep("idle");
    setResult(null);
    setErrorMsg("");
  };

  const Icon = mode === "custom" ? Brain : Sparkles;
  const modeLabel = mode === "custom" ? "My Style" : "Default";

  return (
    <div className="space-y-4 max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            Generate Team Plan — {modeLabel}
          </CardTitle>
          <CardDescription>
            {mode === "custom"
              ? "Generates a plan using your uploaded training philosophy"
              : "Generates a plan using CrewSync's proven methodology"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "done" && result ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 py-6">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <p className="text-lg font-semibold text-center">Plan Generated!</p>
                <p className="text-sm text-muted-foreground text-center">
                  {result.total_weeks}-week plan created and pushed to {result.athletes_updated} athlete
                  {result.athletes_updated !== 1 ? "s" : ""}.
                </p>
              </div>
              <Button variant="outline" className="w-full" onClick={reset}>
                Generate Another Plan
              </Button>
            </div>
          ) : (
            <>
              {isCustomMissingPhilosophy && (
                <div className="flex gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-700 dark:text-yellow-400">
                    Upload your training philosophy in Team Settings first to use this mode.
                  </p>
                </div>
              )}

              {/* Plan length */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Plan Length</label>
                <Select value={weeks} onValueChange={setWeeks} disabled={step !== "idle"}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKS_OPTIONS.map((w) => (
                      <SelectItem key={w} value={w}>{w} Weeks</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Intensity */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Intensity</label>
                <Select value={intensity} onValueChange={setIntensity} disabled={step !== "idle"}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTENSITIES.map((i) => (
                      <SelectItem key={i} value={i}>{i}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Goal */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Training Goal</label>
                <Select value={goal} onValueChange={setGoal} disabled={step !== "idle"}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GOALS.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Optional goal date */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Target Date (optional)</label>
                <input
                  type="date"
                  value={goalDate}
                  onChange={(e) => setGoalDate(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={step !== "idle"}
                />
              </div>

              {/* Progress */}
              {(step === "generating" || step === "personalizing") && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/60">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <p className="text-sm">
                    {step === "generating"
                      ? "Generating plan with AI..."
                      : "Personalizing for all athletes..."}
                  </p>
                </div>
              )}

              {step === "error" && errorMsg && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                  {errorMsg}
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleGenerate}
                disabled={
                  step === "generating" ||
                  step === "personalizing" ||
                  isCustomMissingPhilosophy ||
                  philLoading
                }
              >
                {step === "generating" || step === "personalizing" ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
                ) : (
                  <><Icon className="h-4 w-4 mr-2" /> Generate & Push to Athletes</>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default GenerateTeamPlan;
