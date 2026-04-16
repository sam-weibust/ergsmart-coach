import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { GraduationCap, Loader2, Wand2, Plus, Trash2 } from "lucide-react";

interface Props {
  teamId: string;
  teamName: string;
  teamMembers: any[];
  isCoach: boolean;
  profile: any;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

const URGENCY_LABELS: Record<string, string> = {
  immediate: "Immediate",
  "2_years": "Within 2 yrs",
  long_term: "Long Term",
};

const RecruitingGaps = ({ teamId, teamMembers, isCoach, profile }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ position: "", side_needed: "", graduation_years: "", priority: "medium", notes: "" });

  const allAthletes = teamMembers.map((m: any) => m.profile || m).filter(Boolean);

  const { data: targets = [], isLoading } = useQuery({
    queryKey: ["recruitment-targets", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_recruitment_targets")
        .select("*")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Group athletes by graduation year
  const byGradYear: Record<number, any[]> = {};
  for (const a of allAthletes) {
    if (a.graduation_year) {
      if (!byGradYear[a.graduation_year]) byGradYear[a.graduation_year] = [];
      byGradYear[a.graduation_year].push(a);
    }
  }
  const gradYears = Object.keys(byGradYear).map(Number).sort();
  const currentYear = new Date().getFullYear();

  // Port/starboard counts
  const portCount = allAthletes.filter(a => a.side_preference === "port").length;
  const starboardCount = allAthletes.filter(a => a.side_preference === "starboard").length;
  const bothCount = allAthletes.filter(a => !a.side_preference || a.side_preference === "both").length;

  async function runAIAnalysis() {
    setAiLoading(true);
    setAiResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-recruiting-gaps", {
        body: { team_id: teamId },
      });
      if (error) throw new Error(error.message);
      setAiResult(data);
    } catch (e: any) {
      toast({ title: "AI Error", description: e.message, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  }

  const addTarget = useMutation({
    mutationFn: async () => {
      const years = form.graduation_years
        ? form.graduation_years.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n))
        : [];
      const { error } = await supabase.from("team_recruitment_targets").insert({
        team_id: teamId,
        position: form.position || null,
        side_needed: form.side_needed || null,
        graduation_years: years.length > 0 ? years : null,
        priority: form.priority,
        notes: form.notes || null,
        created_by: profile.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Recruitment target added!" });
      queryClient.invalidateQueries({ queryKey: ["recruitment-targets", teamId] });
      setAddOpen(false);
      setForm({ position: "", side_needed: "", graduation_years: "", priority: "medium", notes: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteTarget = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("team_recruitment_targets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Target removed" });
      queryClient.invalidateQueries({ queryKey: ["recruitment-targets", teamId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin h-6 w-6" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Recruiting Gaps</h2>
          <p className="text-sm text-muted-foreground">Roster analysis and recruitment targets</p>
        </div>
        <div className="flex gap-2">
          {isCoach && (
            <>
              <Button size="sm" variant="outline" className="gap-2" onClick={runAIAnalysis} disabled={aiLoading}>
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                AI Analysis
              </Button>
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Add Target</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Recruitment Target</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Position</Label>
                        <Input placeholder="stroke, bow, cox, mid" value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label>Side Needed</Label>
                        <Select value={form.side_needed} onValueChange={v => setForm(f => ({ ...f, side_needed: v }))}>
                          <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Any</SelectItem>
                            <SelectItem value="port">Port</SelectItem>
                            <SelectItem value="starboard">Starboard</SelectItem>
                            <SelectItem value="both">Both</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Grad Years (comma sep.)</Label>
                        <Input placeholder="2027, 2028" value={form.graduation_years} onChange={e => setForm(f => ({ ...f, graduation_years: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label>Priority</Label>
                        <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>Notes</Label>
                      <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any additional details..." />
                    </div>
                    <Button className="w-full" onClick={() => addTarget.mutate()} disabled={addTarget.isPending}>
                      {addTarget.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Target"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      {/* Roster summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Athletes</p>
            <p className="text-2xl font-bold">{allAthletes.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Port</p>
            <p className="text-2xl font-bold">{portCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Starboard</p>
            <p className="text-2xl font-bold">{starboardCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">No Pref / Both</p>
            <p className="text-2xl font-bold">{bothCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Graduation timeline */}
      {gradYears.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Graduation Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {gradYears.map(year => (
                <div key={year} className="flex items-center gap-3">
                  <span className="text-sm font-medium w-12">{year}</span>
                  <div className="flex gap-1 flex-wrap flex-1">
                    {byGradYear[year].map(a => (
                      <Badge key={a.id} variant={year <= currentYear + 1 ? "destructive" : year <= currentYear + 2 ? "secondary" : "outline"} className="text-xs">
                        {a.full_name || a.username || "—"}
                      </Badge>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">{byGradYear[year].length} athletes</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Result */}
      {aiResult && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Wand2 className="h-4 w-4" />AI Recruiting Analysis</CardTitle>
            <CardDescription>Roster health score: {aiResult.roster_health_score}/100</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiResult.graduation_risk && (
              <p className="text-sm text-muted-foreground">{aiResult.graduation_risk}</p>
            )}
            {aiResult.gaps?.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Identified Gaps</p>
                {aiResult.gaps.map((gap: any, i: number) => (
                  <div key={i} className="border rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={gap.urgency === "immediate" ? "destructive" : gap.urgency === "2_years" ? "secondary" : "outline"}>
                        {URGENCY_LABELS[gap.urgency] || gap.urgency}
                      </Badge>
                      <span className="text-sm font-medium">{gap.position} — {gap.side}</span>
                      {gap.target_2k_watts && <span className="text-xs text-muted-foreground">Target: {gap.target_2k_watts}W</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">{gap.reason}</p>
                  </div>
                ))}
              </div>
            )}
            {aiResult.priority_recruit_profile && (
              <div>
                <p className="text-sm font-medium mb-1">Ideal Next Recruit</p>
                <p className="text-sm text-muted-foreground italic">{aiResult.priority_recruit_profile}</p>
              </div>
            )}
            {aiResult.recommendations?.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Recommendations</p>
                <ul className="space-y-1">
                  {aiResult.recommendations.map((r: string, i: number) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2">
                      <span className="text-primary">•</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recruitment targets */}
      {targets.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><GraduationCap className="h-4 w-4" />Recruitment Targets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {targets.map((t: any) => (
                <div key={t.id} className="flex items-start gap-3 p-2 rounded border">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={(PRIORITY_COLORS[t.priority] as any) || "outline"}>{t.priority}</Badge>
                      {t.position && <span className="text-sm font-medium">{t.position}</span>}
                      {t.side_needed && <Badge variant="outline">{t.side_needed}</Badge>}
                      {t.graduation_years?.length > 0 && (
                        <span className="text-xs text-muted-foreground">Grad: {t.graduation_years.join(", ")}</span>
                      )}
                    </div>
                    {t.notes && <p className="text-xs text-muted-foreground">{t.notes}</p>}
                  </div>
                  {isCoach && (
                    <Button size="sm" variant="ghost" className="text-destructive h-7 w-7 p-0" onClick={() => deleteTarget.mutate(t.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RecruitingGaps;
