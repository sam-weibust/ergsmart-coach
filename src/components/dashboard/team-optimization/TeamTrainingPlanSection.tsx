import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Wand2, Download, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { cn } from "@/lib/utils";

interface Props {
  teamId: string;
  teamName: string;
  teamMembers: any[];
  isCoach: boolean;
  profile: any;
}

const SESSION_COLORS = {
  active: "bg-primary/10 border-primary/20",
  rest: "bg-muted/50 border-border",
};

const SEASON_PHASES = ["general preparation", "early season", "competition", "championship taper", "recovery"] as const;

const SESSION_FIELDS = [
  { key: "type", label: "Type" },
  { key: "warmup", label: "Warmup" },
  { key: "workout", label: "Workout" },
  { key: "rest", label: "Rest" },
  { key: "breakup", label: "Breakup" },
  { key: "rates", label: "Rates" },
  { key: "cooldown", label: "Cooldown" },
];

function renderSessionBlock(session: any, label?: string) {
  if (!session) return null;
  const hasContent = SESSION_FIELDS.some(f => session[f.key]);
  if (!hasContent) return null;
  return (
    <div className={cn("space-y-1 text-xs", label ? "mt-2 pt-2 border-t border-dashed border-border/60 opacity-75" : "")}>
      {label && <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>}
      {SESSION_FIELDS.map(({ key, label: fieldLabel }) => (
        <div key={key} className="flex gap-2">
          <span className="text-muted-foreground font-medium w-16 shrink-0">{fieldLabel}:</span>
          <span>{session[key] || "—"}</span>
        </div>
      ))}
    </div>
  );
}

const PHASE_LABELS = [
  "Generating base phase weeks 1–4…",
  "Generating build phase weeks 5–8…",
  "Generating peak phase weeks 9–12…",
];

const TeamTrainingPlanSection = ({ teamId, teamName, isCoach }: Props) => {
  const { toast } = useToast();
  const [aiLoading, setAiLoading] = useState(false);
  const [plan, setPlan] = useState<any | null>(null);
  const [expandedWeek, setExpandedWeek] = useState<number | null>(0);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [planError, setPlanError] = useState<string | null>(null);
  const [form, setForm] = useState({
    weeks: "4",
    season_phase: "general preparation",
    practice_days_per_week: "5",
  });

  async function generatePlan() {
    setAiLoading(true);
    setPlan(null);
    setPlanError(null);
    setProgress(0);

    const totalWeeks = parseInt(form.weeks);
    const chunks: Array<[number, number]> = [];
    for (let s = 1; s <= totalWeeks; s += 4) {
      chunks.push([s, Math.min(s + 3, totalWeeks)]);
    }

    const allWeeks: any[] = [];
    let previousContext = "";

    try {
      for (let i = 0; i < chunks.length; i++) {
        const [startWeek, endWeek] = chunks[i];
        setProgressLabel(PHASE_LABELS[i] || `Generating weeks ${startWeek}–${endWeek}…`);

        const { data, error } = await supabase.functions.invoke("generate-team-training-plan", {
          body: {
            team_id: teamId,
            weeks: totalWeeks,
            season_phase: form.season_phase,
            practice_days_per_week: parseInt(form.practice_days_per_week),
            injured_athletes: [],
            start_week: startWeek,
            end_week: endWeek,
            previous_context: previousContext,
          },
        });

        if (error) throw new Error(error.message);
        if (!data?.weeks?.length) throw new Error(`No weeks returned for chunk ${i + 1}`);

        allWeeks.push(...data.weeks);
        previousContext = `Weeks ${startWeek}–${endWeek}: ${data.weeks.map((w: any) => `Week ${w.week_number} ${w.phase}`).join(", ")}`;
        setProgress(Math.round(((i + 1) / chunks.length) * 100));
      }

      const combinedPlan = { weeks: allWeeks };
      console.log("[TrainingPlan] raw plan data:", JSON.stringify(combinedPlan, null, 2));
      console.log("[TrainingPlan] first day:", JSON.stringify(combinedPlan.weeks[0]?.days[0], null, 2));

      if (allWeeks.length < totalWeeks) {
        const msg = `Plan generation incomplete. Only ${allWeeks.length} of ${totalWeeks} weeks generated.`;
        setPlanError(msg);
        toast({ title: "Incomplete Plan", description: msg, variant: "destructive" });
        return;
      }

      setPlan(combinedPlan);
      setExpandedWeek(0);
      toast({ title: `${totalWeeks}-week training plan generated!` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setAiLoading(false);
      setProgress(0);
      setProgressLabel("");
    }
  }

  function exportPDF() {
    if (!plan) return;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(18);
    doc.text(`${teamName} — Training Plan`, 14, 18);
    doc.setFontSize(11);
    doc.text(`Season Phase: ${form.season_phase} | ${form.weeks} weeks | ${form.practice_days_per_week} days/week`, 14, 26);

    let y = 35;
    for (const week of (plan.weeks || [])) {
      doc.setFontSize(13);
      doc.text(`Week ${week.week_number} — ${week.phase}`, 14, y);
      y += 6;

      const tableData: any[] = [];
      for (const day of (week.days || [])) {
        const req = day.required || {};
        const optStr = day.optional?.workout ? ` | OPT: ${day.optional.workout}` : "";
        tableData.push([
          day.day || "—",
          req.type || "—",
          req.warmup || "—",
          (req.workout || "—") + optStr,
          req.rest || "—",
          req.rates || "—",
          req.cooldown || "—",
        ]);
      }

      autoTable(doc, {
        head: [["Day", "Type", "Warmup", "Workout", "Rest", "Rates", "Cooldown"]],
        body: tableData,
        startY: y,
        styles: { fontSize: 8 },
        columnStyles: { 3: { cellWidth: 80 } },
      });
      y = (doc as any).lastAutoTable.finalY + 12;
      if (y > 185) { doc.addPage(); y = 14; }
    }

    doc.save(`${teamName.replace(/\s/g, "-")}-training-plan.pdf`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Team Training Plan Generator</h2>
          <p className="text-sm text-muted-foreground">Generate AI-powered multi-week periodized training plans</p>
        </div>
        {plan && (
          <Button size="sm" variant="outline" className="gap-2" onClick={exportPDF}>
            <Download className="h-4 w-4" />PDF Export
          </Button>
        )}
      </div>

      {isCoach && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Wand2 className="h-4 w-4" />Generate Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="space-y-1">
                <Label>Weeks</Label>
                <Select value={form.weeks} onValueChange={v => setForm(f => ({ ...f, weeks: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 6, 8].map(n => <SelectItem key={n} value={String(n)}>{n} weeks</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Season Phase</Label>
                <Select value={form.season_phase} onValueChange={v => setForm(f => ({ ...f, season_phase: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEASON_PHASES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Days/Week</Label>
                <Select value={form.practice_days_per_week} onValueChange={v => setForm(f => ({ ...f, practice_days_per_week: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[3, 4, 5, 6, 7].map(n => <SelectItem key={n} value={String(n)}>{n} days</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full gap-2" onClick={generatePlan} disabled={aiLoading}>
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Generate {form.weeks}-Week Plan
            </Button>
            {aiLoading && progressLabel && (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs text-muted-foreground">{progressLabel}</p>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {planError && !plan && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive mb-3">{planError}</p>
            <Button size="sm" variant="outline" className="gap-2" onClick={generatePlan}>
              <RefreshCw className="h-4 w-4" />Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {plan && !plan.weeks?.length && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive mb-3">No plan data returned. Please try again.</p>
            <Button size="sm" variant="outline" className="gap-2" onClick={generatePlan}>
              <RefreshCw className="h-4 w-4" />Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {plan && plan.weeks?.length > 0 && (
        <div className="space-y-3">
          {(plan.weeks as any[]).map((week, wi) => {
            const isExpanded = expandedWeek === wi;
            return (
              <Card key={week.week_number ?? wi}>
                <CardHeader
                  className="pb-2 cursor-pointer"
                  onClick={() => setExpandedWeek(isExpanded ? null : wi)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <div>
                        <CardTitle className="text-base">Week {week.week_number}</CardTitle>
                        <CardDescription className="mt-0.5">
                          <Badge variant="outline" className="text-xs">{week.phase}</Badge>
                        </CardDescription>
                      </div>
                    </div>
                    <div className="hidden md:flex gap-1">
                      {(week.days as any[] || []).map((d, di) => {
                        const isRest = d.required?.type === "Rest";
                        return (
                          <div
                            key={di}
                            className={cn("w-8 h-8 rounded text-xs flex items-center justify-center border font-medium", isRest ? SESSION_COLORS.rest : SESSION_COLORS.active)}
                            title={`${d.day}: ${d.required?.type || ""}`}
                          >
                            {typeof d.day === "string" ? d.day.slice(0, 2) : `D${di + 1}`}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      {(week.days as any[] || []).map((day, di) => {
                        const isRest = day.required?.type === "Rest";
                        return (
                          <div
                            key={di}
                            className={cn("rounded-lg border p-3", isRest ? SESSION_COLORS.rest : SESSION_COLORS.active)}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <p className="text-sm font-semibold">{day.day || `Day ${di + 1}`}</p>
                              {isRest && <Badge className="text-xs bg-green-100 text-green-800 border-green-200">Rest Day</Badge>}
                            </div>
                            {renderSessionBlock(day.required)}
                            {day.optional && renderSessionBlock(day.optional, `Optional — ${day.optional.type || "UT2"}`)}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TeamTrainingPlanSection;
