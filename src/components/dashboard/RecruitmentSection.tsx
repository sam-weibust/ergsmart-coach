import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  GraduationCap, Loader2, AlertTriangle, Trophy, Target,
  TrendingUp, School, Lightbulb, Info, RefreshCw, ChevronDown, ChevronUp, Clock, History
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger
} from "@/components/ui/collapsible";

interface RecruitmentSectionProps {
  profile: any;
}

interface SchoolPrediction {
  school: string;
  division: string;
  chance: "high" | "medium" | "low" | "reach";
  type: "recruited" | "walk-on" | "club";
  notes: string;
}

interface TierBreakdown {
  tier: string;
  likelihood: "strong" | "possible" | "unlikely" | "not_competitive";
  explanation: string;
  time_needed_2k?: string;
}

interface RecruitmentPrediction {
  overall_assessment: string;
  predicted_tier: string;
  weight_class: string;
  tier_breakdown: TierBreakdown[];
  school_predictions: SchoolPrediction[];
  improvement_tips: string[];
  missing_data_notes?: string[];
}

const chanceConfig = {
  high: { label: "Strong", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30", progress: 75 },
  medium: { label: "Possible", color: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30", progress: 50 },
  low: { label: "Competitive", color: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30", progress: 25 },
  reach: { label: "Reach", color: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30", progress: 10 },
};

const likelihoodConfig = {
  strong: { label: "Strong Fit", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", icon: "🟢" },
  possible: { label: "Possible", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", icon: "🟡" },
  unlikely: { label: "Unlikely", color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10", icon: "🟠" },
  not_competitive: { label: "Not Competitive", color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", icon: "🔴" },
};

const RecruitmentSection = ({ profile }: RecruitmentSectionProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [tiersOpen, setTiersOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const { data: goals } = useQuery({
    queryKey: ["user-goals-recruit", profile?.id],
    queryFn: async () => {
      if (!profile) return null;
      const { data } = await supabase
        .from("user_goals")
        .select("*")
        .eq("user_id", profile.id)
        .maybeSingle();
      return data;
    },
    enabled: !!profile,
  });

  // Load saved predictions
  const { data: savedPredictions = [] } = useQuery({
    queryKey: ["recruitment-predictions", profile?.id],
    queryFn: async () => {
      if (!profile) return [];
      const { data } = await supabase
        .from("recruitment_predictions")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: !!profile,
  });

  const latestPrediction = savedPredictions[0];
  const prediction: RecruitmentPrediction | null = latestPrediction?.prediction_data as any;

  // Detect if profile/goals changed since last prediction
  const hasProfileChanged = useMemo(() => {
    if (!latestPrediction || !profile) return false;
    const snap = latestPrediction.profile_snapshot as any;
    const goalSnap = latestPrediction.goals_snapshot as any;
    return (
      snap?.weight !== profile.weight ||
      snap?.height !== profile.height ||
      snap?.age !== profile.age ||
      goalSnap?.current_2k_time !== goals?.current_2k_time ||
      goalSnap?.current_5k_time !== goals?.current_5k_time ||
      goalSnap?.current_6k_time !== goals?.current_6k_time
    );
  }, [latestPrediction, profile, goals]);

  const hasMinimumData = profile && (goals?.current_2k_time || goals?.current_5k_time || goals?.current_6k_time);

  // Convert metric for display
  const displayWeight = profile?.weight ? Math.round(profile.weight * 2.20462) : null;
  const displayHeightIn = profile?.height ? Math.round(profile.height / 2.54) : null;
  const displayHeight = displayHeightIn ? `${Math.floor(displayHeightIn / 12)}'${displayHeightIn % 12}"` : null;

  const generatePrediction = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("predict-recruitment", {
        body: { profile, goals },
      });

      if (error) throw error;
      if (data?.error) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
        return;
      }

      // Save to database
      const { error: saveError } = await supabase
        .from("recruitment_predictions")
        .insert({
          user_id: profile.id,
          prediction_data: data,
          profile_snapshot: {
            weight: profile.weight,
            height: profile.height,
            age: profile.age,
            experience_level: profile.experience_level,
          },
          goals_snapshot: goals ? {
            current_2k_time: goals.current_2k_time,
            current_5k_time: goals.current_5k_time,
            current_6k_time: goals.current_6k_time,
          } : null,
        } as any);

      if (saveError) console.error("Failed to save prediction:", saveError);

      queryClient.invalidateQueries({ queryKey: ["recruitment-predictions"] });
    } catch (err: any) {
      toast({
        title: "Prediction Failed",
        description: err.message || "Could not generate prediction. Try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Group schools by chance level
  const groupedSchools = prediction?.school_predictions?.reduce((acc, school) => {
    const group = school.chance;
    if (!acc[group]) acc[group] = [];
    acc[group].push(school);
    return acc;
  }, {} as Record<string, SchoolPrediction[]>);

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <GraduationCap className="h-6 w-6 text-primary" />
                Recruitment Predictor
              </CardTitle>
              <CardDescription className="mt-1.5">
                AI-powered predictions based on your erg times, body metrics, and experience
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Metrics Display */}
          {profile && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-2.5 rounded-lg bg-muted/50 border border-border text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Weight</p>
                <p className="font-bold text-sm">{displayWeight ? `${displayWeight} lbs` : "—"}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/50 border border-border text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Height</p>
                <p className="font-bold text-sm">{displayHeight || "—"}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/50 border border-border text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">2K Time</p>
                <p className="font-bold text-sm">{goals?.current_2k_time || "—"}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/50 border border-border text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Age</p>
                <p className="font-bold text-sm">{profile.age || "—"}</p>
              </div>
            </div>
          )}

          {!hasMinimumData && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-amber-700 dark:text-amber-300 text-sm">Missing Erg Times</p>
                <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1">
                  Go to the <strong>Profile</strong> tab to add your stats, and the <strong>Stats</strong> tab to set your current erg times.
                </p>
              </div>
            </div>
          )}

          {hasProfileChanged && prediction && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
              <RefreshCw className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">Profile Updated</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Your metrics have changed since the last prediction. Refresh to get an updated assessment.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 items-start">
            <Button
              onClick={generatePrediction}
              disabled={loading}
              size="lg"
              className="gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : prediction ? (
                <>
                  <RefreshCw className="h-4 w-4" />
                  {hasProfileChanged ? "Update Prediction" : "Refresh Prediction"}
                </>
              ) : (
                <>
                  <Target className="h-4 w-4" />
                  Get My Prediction
                </>
              )}
            </Button>
            {savedPredictions.length > 1 && (
              <Button variant="outline" size="lg" className="gap-2" onClick={() => setShowHistory(!showHistory)}>
                <History className="h-4 w-4" />
                History ({savedPredictions.length})
              </Button>
            )}
          </div>

          {latestPrediction && (
            <p className="text-[10px] text-muted-foreground">
              Last prediction: {new Date(latestPrediction.created_at).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Prediction History */}
      {showHistory && savedPredictions.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Prediction History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {savedPredictions.map((p: any, i: number) => {
                const pred = p.prediction_data as RecruitmentPrediction;
                const snap = p.profile_snapshot as any;
                const gSnap = p.goals_snapshot as any;
                const snapWeight = snap?.weight ? Math.round(snap.weight * 2.20462) : null;
                return (
                  <div key={p.id} className={`p-3 rounded-lg border ${i === 0 ? "border-primary/30 bg-primary/5" : "border-border"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={i === 0 ? "default" : "outline"} className="text-xs">
                          {pred.predicted_tier}
                        </Badge>
                        {i === 0 && <Badge variant="secondary" className="text-[10px]">Latest</Badge>}
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{pred.overall_assessment}</p>
                    <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground">
                      {snapWeight && <span>Weight: {snapWeight} lbs</span>}
                      {gSnap?.current_2k_time && <span>2K: {gSnap.current_2k_time}</span>}
                      <span>{pred.school_predictions?.length || 0} schools</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {prediction && (
        <div className="space-y-5 animate-fade-in">
          {/* Overall Assessment */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-primary" />
                  Your Assessment
                </CardTitle>
                <div className="flex gap-2">
                  <Badge variant="outline" className="font-semibold">{prediction.predicted_tier}</Badge>
                  {prediction.weight_class !== "Unknown" && (
                    <Badge variant="secondary">{prediction.weight_class}</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">{prediction.overall_assessment}</p>

              {prediction.missing_data_notes && prediction.missing_data_notes.length > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-muted/50 border border-border">
                  <p className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground mb-1.5">
                    <Info className="h-3.5 w-3.5" /> Data Notes
                  </p>
                  <ul className="space-y-1">
                    {prediction.missing_data_notes.map((note, i) => (
                      <li key={i} className="text-xs text-muted-foreground">• {note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tier Breakdown */}
          <Collapsible open={tiersOpen} onOpenChange={setTiersOpen}>
            <Card>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      Division Breakdown
                    </CardTitle>
                    {tiersOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {prediction.tier_breakdown.map((tier, i) => {
                      const config = likelihoodConfig[tier.likelihood];
                      return (
                        <div key={i} className={`p-3 rounded-lg border ${config.bg}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-sm">{config.icon} {tier.tier}</span>
                            <Badge variant="outline" className={`text-xs ${config.color}`}>{config.label}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{tier.explanation}</p>
                          {tier.time_needed_2k && (
                            <p className="text-xs mt-1.5 font-medium text-foreground/80">
                              Target 2K: {tier.time_needed_2k}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* School Predictions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <School className="h-5 w-5 text-primary" />
                School Predictions
              </CardTitle>
              <CardDescription>Specific programs ranked by your competitiveness</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-5">
                {(["high", "medium", "low", "reach"] as const).map((level) => {
                  const schools = groupedSchools?.[level];
                  if (!schools || schools.length === 0) return null;
                  const config = chanceConfig[level];
                  return (
                    <div key={level}>
                      <div className="flex items-center gap-2 mb-3">
                        <Badge className={`${config.color} border`}>{config.label}</Badge>
                        <Separator className="flex-1" />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {schools.map((school, i) => (
                          <div key={i} className="p-3 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold text-sm truncate">{school.school}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{school.division}</span>
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{school.type}</Badge>
                                </div>
                              </div>
                              <div className="shrink-0 w-12">
                                <Progress value={config.progress} className="h-1.5" />
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{school.notes}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Improvement Tips */}
          {prediction.improvement_tips && prediction.improvement_tips.length > 0 && (
            <Card className="border-primary/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-primary" />
                  How to Improve Your Chances
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {prediction.improvement_tips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-sm text-muted-foreground leading-relaxed">{tip}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <p className="text-[10px] text-muted-foreground text-center px-4">
            These predictions are AI-generated estimates based on publicly available recruiting data. Actual recruitment depends on many factors including academics, team needs, coaching relationships, and video submissions. Use this as a starting point, not a guarantee.
          </p>
        </div>
      )}
    </div>
  );
};

export default RecruitmentSection;
