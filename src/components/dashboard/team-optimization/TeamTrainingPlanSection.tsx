import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Loader2, Wand2, Download, ChevronDown, ChevronRight } from "lucide-react";
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

const ZONE_COLORS: Record<string, string> = {
  UT2: "bg-blue-100 text-blue-800 border-blue-200",
  UT1: "bg-green-100 text-green-800 border-green-200",
  TR: "bg-yellow-100 text-yellow-800 border-yellow-200",
  AT: "bg-red-100 text-red-800 border-red-200",
  rest: "bg-gray-100 text-gray-600 border-gray-200",
};

const SESSION_COLORS: Record<string, string> = {
  erg: "bg-primary/10 border-primary/20",
  on_water: "bg-blue-50 border-blue-200",
  rest: "bg-muted/50 border-border",
  cross_training: "bg-purple-50 border-purple-200",
};

const SEASON_PHASES = ["general preparation", "early season", "competition", "championship taper", "recovery"] as const;

function renderSessionBlock(session: any, label?: string) {
  if (!session) return null;
  const hasContent = session.warmup || session.main_set?.length > 0 || session.cooldown;
  if (!hasContent) return null;
  return (
    <div className={cn("space-y-1.5 text-xs", label ? "mt-2 pt-2 border-t border-dashed border-border/60" : "")}>
      {label && <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>}
      {session.warmup && (
        <div className="flex gap-2">
          <span className="text-muted-foreground font-medium w-14 shrink-0">Warmup:</span>
          <span>{session.warmup}</span>
        </div>
      )}
      {session.main_set?.length > 0 && (
        <div className="flex gap-2">
          <span className="text-muted-foreground font-medium w-14 shrink-0">Main Set:</span>
          <div className="space-y-1">
            {session.main_set.map((seg: any, si: number) => (
              <div key={si} className="flex items-center gap-1.5 flex-wrap">
                <Badge className={cn("text-xs border", ZONE_COLORS[seg.zone] || "")} variant="outline">{seg.zone}</Badge>
                <span>{seg.description}</span>
                {seg.rate && <span className="text-muted-foreground">r{seg.rate}</span>}
                {seg.rest && <span className="text-muted-foreground">/ {seg.rest} rest</span>}
                {seg.notes && <span className="text-muted-foreground italic">({seg.notes})</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {session.cooldown && (
        <div className="flex gap-2">
          <span className="text-muted-foreground font-medium w-14 shrink-0">Cooldown:</span>
          <span>{session.cooldown}</span>
        </div>
      )}
      {session.varsity_notes && (
        <div className="flex gap-2">
          <span className="text-muted-foreground font-medium w-14 shrink-0">Varsity:</span>
          <span>{session.varsity_notes}</span>
        </div>
      )}
      {session.novice_notes && (
        <div className="flex gap-2">
          <span className="text-muted-foreground font-medium w-14 shrink-0">Novice:</span>
          <span>{session.novice_notes}</span>
        </div>
      )}
    </div>
  );
}

const TeamTrainingPlanSection = ({ teamId, teamName, teamMembers, isCoach }: Props) => {
  const { toast } = useToast();
  const [aiLoading, setAiLoading] = useState(false);
  const [plan, setPlan] = useState<any | null>(null);
  const [expandedWeek, setExpandedWeek] = useState<number | null>(0);
  const [form, setForm] = useState({
    weeks: "4",
    season_phase: "general preparation",
    practice_days_per_week: "5",
  });

  const allAthletes = teamMembers.map((m: any) => m.profile || m).filter(Boolean);

  async function generatePlan() {
    setAiLoading(true);
    setPlan(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-team-training-plan", {
        body: {
          team_id: teamId,
          weeks: parseInt(form.weeks),
          season_phase: form.season_phase,
          practice_days_per_week: parseInt(form.practice_days_per_week),
          injured_athletes: [],
        },
      });
      if (error) throw new Error(error.message);
      console.log("[TrainingPlan] raw plan data:", JSON.stringify(data, null, 2));
      setPlan(data);
      setExpandedWeek(0);
      toast({ title: `${form.weeks}-week training plan generated!` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setAiLoading(false);
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
      doc.text(`Week ${week.week} — ${week.phase} (${week.focus})`, 14, y);
      y += 6;

      const tableData: any[] = [];
      for (const day of (week.days || [])) {
        // Support both required/optional structure and old flat structure
        const reqSession = day.required || (day.warmup || day.main_set ? day : null);
        const mainSetStr = (reqSession?.main_set || []).map((s: any) => `${s.description || ""} [${s.zone}]`).join("; ");
        const optStr = day.optional?.main_set?.length ? ` | OPT: ${day.optional.main_set.map((s: any) => s.description).join("; ")}` : "";
        tableData.push([
          day.day_name,
          day.title,
          day.session_type,
          day.total_meters ? `${(day.total_meters / 1000).toFixed(1)}km` : "—",
          reqSession?.warmup || "—",
          (mainSetStr || "—") + optStr,
          reqSession?.cooldown || "—",
        ]);
      }

      autoTable(doc, {
        head: [["Day", "Title", "Type", "Volume", "Warmup", "Main Set", "Cooldown"]],
        body: tableData,
        startY: y,
        styles: { fontSize: 8 },
        columnStyles: { 5: { cellWidth: 80 } },
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
          </CardContent>
        </Card>
      )}

      {plan && (
        <div className="space-y-3">
          {(plan.weeks || []).map((week: any, wi: number) => {
            const isExpanded = expandedWeek === wi;
            const totalWeekMeters = (week.days || []).reduce((acc: number, d: any) => acc + (d.total_meters || 0), 0);
            return (
              <Card key={week.week}>
                <CardHeader
                  className="pb-2 cursor-pointer"
                  onClick={() => setExpandedWeek(isExpanded ? null : wi)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <div>
                        <CardTitle className="text-base">Week {week.week}</CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-xs">{week.phase}</Badge>
                          <span>{week.focus}</span>
                          <span className="text-muted-foreground">·</span>
                          <span>{(totalWeekMeters / 1000).toFixed(0)}km total</span>
                        </CardDescription>
                      </div>
                    </div>
                    {/* Mini calendar strip */}
                    <div className="hidden md:flex gap-1">
                      {(week.days || []).map((d: any) => (
                        <div
                          key={d.day}
                          className={cn("w-8 h-8 rounded text-xs flex items-center justify-center border font-medium", SESSION_COLORS[d.session_type] || SESSION_COLORS.rest)}
                          title={`${d.day_name}: ${d.title}`}
                        >
                          {d.day_name?.slice(0, 2)}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      {(week.days || []).map((day: any) => {
                        // Normalize: support both required/optional structure and old flat structure
                        const requiredSession = day.required || (day.warmup || day.main_set?.length > 0 ? day : null);
                        const optionalSession = day.optional || null;
                        const isRest = day.session_type === "rest";
                        return (
                          <div key={day.day} className={cn("rounded-lg border p-3", SESSION_COLORS[day.session_type] || SESSION_COLORS.rest)}>
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <p className="text-sm font-semibold">{day.day_name} — {day.title}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <Badge variant="outline" className="text-xs capitalize">{day.session_type?.replace("_", " ")}</Badge>
                                  {isRest && <Badge className="text-xs bg-green-100 text-green-800 border-green-200">Rest Day</Badge>}
                                  {day.total_meters > 0 && (
                                    <span className="text-xs text-muted-foreground">{(day.total_meters / 1000).toFixed(1)}km</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {!isRest && renderSessionBlock(requiredSession)}
                            {optionalSession && (
                              <div className="opacity-80">
                                {renderSessionBlock(optionalSession, `Optional${optionalSession.title ? ` — ${optionalSession.title}` : ""}`)}
                              </div>
                            )}
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
