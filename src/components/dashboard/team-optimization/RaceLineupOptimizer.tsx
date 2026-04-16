import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Trophy, Loader2, Wand2, Save, Download, AlertTriangle } from "lucide-react";
import { BOAT_CLASSES, displayName } from "./constants";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Props {
  teamId: string;
  teamName: string;
  teamMembers: any[];
  isCoach: boolean;
  profile: any;
}

const RaceLineupOptimizer = ({ teamId, teamName, teamMembers, isCoach, profile }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [raceName, setRaceName] = useState("");
  const [raceDate, setRaceDate] = useState("");
  const [boatClass, setBoatClass] = useState("8+");
  const [selectedAthletes, setSelectedAthletes] = useState<string[]>([]);
  const [lockedSeats, setLockedSeats] = useState<any[]>([]);
  const [factorWeights, setFactorWeights] = useState({ erg: 40, onwater: 30, seat_race: 30 });
  const [aiResult, setAiResult] = useState<any | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const allAthletes = teamMembers.map((m: any) => m.profile || m).filter(Boolean);

  const { data: savedLineups = [] } = useQuery({
    queryKey: ["race-lineups", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("race_lineups")
        .select("*")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  function toggleAthlete(id: string) {
    setSelectedAthletes(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  }

  async function optimizeLineup() {
    if (selectedAthletes.length < 2) {
      toast({ title: "Select at least 2 athletes", variant: "destructive" });
      return;
    }
    setAiLoading(true);
    setAiResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("optimize-race-lineup", {
        body: {
          team_id: teamId,
          boat_class: boatClass,
          athlete_ids: selectedAthletes,
          locked_seats: lockedSeats,
          race_name: raceName,
          race_date: raceDate,
          factor_weights: {
            erg: factorWeights.erg / 100,
            onwater: factorWeights.onwater / 100,
            seat_race: factorWeights.seat_race / 100,
          },
        },
      });
      if (error) throw new Error(error.message);
      setAiResult(data);
    } catch (e: any) {
      toast({ title: "AI Error", description: e.message, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  }

  const saveLineup = useMutation({
    mutationFn: async () => {
      if (!aiResult) return;
      const { error } = await supabase.from("race_lineups").insert({
        team_id: teamId,
        race_name: raceName || null,
        race_date: raceDate || null,
        boat_class: boatClass,
        seats: aiResult.seats || [],
        ai_rationale: aiResult.overall_rationale || null,
        ai_factors: factorWeights,
        created_by: profile.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Race lineup saved!" });
      queryClient.invalidateQueries({ queryKey: ["race-lineups", teamId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function exportPDF() {
    if (!aiResult) return;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`${teamName} — Race Lineup`, 14, 20);
    doc.setFontSize(12);
    doc.text(`${raceName || "Race"} | ${raceDate || "TBD"} | ${boatClass}`, 14, 30);

    const tableData = (aiResult.seats || []).map((s: any) => {
      const athlete = allAthletes.find(a => a.id === s.user_id);
      return [
        s.seat_number === 0 ? "Cox" : `Seat ${s.seat_number}`,
        displayName(athlete),
        `${Math.round((s.confidence || 0) * 100)}%`,
        s.rationale || "",
      ];
    });

    if (aiResult.cox) {
      const coxAthlete = allAthletes.find(a => a.id === aiResult.cox?.user_id);
      tableData.unshift(["Cox", displayName(coxAthlete), "—", aiResult.cox?.rationale || ""]);
    }

    autoTable(doc, {
      head: [["Position", "Athlete", "Confidence", "Rationale"]],
      body: tableData,
      startY: 38,
      styles: { fontSize: 10 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    if (aiResult.overall_rationale) {
      doc.setFontSize(11);
      doc.text("Strategy:", 14, finalY);
      const lines = doc.splitTextToSize(aiResult.overall_rationale, 180);
      doc.setFontSize(10);
      doc.text(lines, 14, finalY + 6);
    }

    doc.save(`${raceName || "race"}-lineup.pdf`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Race Lineup Optimizer</h2>
        <p className="text-sm text-muted-foreground">AI-powered race lineup optimization using all available data</p>
      </div>

      {isCoach && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Build Optimized Lineup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Race Name</Label>
                <Input placeholder="e.g. Head of the River" value={raceName} onChange={e => setRaceName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Race Date</Label>
                <Input type="date" value={raceDate} onChange={e => setRaceDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Boat Class</Label>
                <Select value={boatClass} onValueChange={setBoatClass}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{BOAT_CLASSES.map(bc => <SelectItem key={bc} value={bc}>{bc}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Factor weights */}
            <div className="space-y-2">
              <Label>Factor Weights (must sum to 100)</Label>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Erg %</Label>
                  <Input type="number" min="0" max="100" value={factorWeights.erg} onChange={e => setFactorWeights(f => ({ ...f, erg: parseInt(e.target.value) || 0 }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">On-Water %</Label>
                  <Input type="number" min="0" max="100" value={factorWeights.onwater} onChange={e => setFactorWeights(f => ({ ...f, onwater: parseInt(e.target.value) || 0 }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Seat Race %</Label>
                  <Input type="number" min="0" max="100" value={factorWeights.seat_race} onChange={e => setFactorWeights(f => ({ ...f, seat_race: parseInt(e.target.value) || 0 }))} />
                </div>
              </div>
              {factorWeights.erg + factorWeights.onwater + factorWeights.seat_race !== 100 && (
                <p className="text-xs text-destructive">Weights must sum to 100 (currently {factorWeights.erg + factorWeights.onwater + factorWeights.seat_race})</p>
              )}
            </div>

            {/* Athlete selection */}
            <div className="space-y-2">
              <Label>Select Athletes for Lineup ({selectedAthletes.length} selected)</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {allAthletes.map(a => (
                  <div key={a.id} className="flex items-center gap-2 p-2 rounded border hover:bg-muted/50 cursor-pointer" onClick={() => toggleAthlete(a.id)}>
                    <Checkbox checked={selectedAthletes.includes(a.id)} onCheckedChange={() => toggleAthlete(a.id)} />
                    <span className="text-sm">{displayName(a)}</span>
                  </div>
                ))}
              </div>
            </div>

            <Button
              className="w-full gap-2"
              onClick={optimizeLineup}
              disabled={aiLoading || selectedAthletes.length < 2 || factorWeights.erg + factorWeights.onwater + factorWeights.seat_race !== 100}
            >
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Optimize with AI
            </Button>
          </CardContent>
        </Card>
      )}

      {/* AI Result */}
      {aiResult && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4 text-primary" />Optimized Lineup</CardTitle>
                <CardDescription>{raceName || "Race"} — {boatClass}</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1" onClick={exportPDF}><Download className="h-3 w-3" />PDF</Button>
                <Button size="sm" className="gap-1" onClick={() => saveLineup.mutate()} disabled={saveLineup.isPending}>
                  {saveLineup.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiResult.overall_confidence !== undefined && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Overall Confidence:</span>
                <Progress value={Math.round((aiResult.overall_confidence || 0) * 100)} className="w-32 h-2" />
                <span className="text-sm font-medium">{Math.round((aiResult.overall_confidence || 0) * 100)}%</span>
              </div>
            )}

            {aiResult.fatigue_flags?.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium flex items-center gap-1.5 text-destructive"><AlertTriangle className="h-4 w-4" />Fatigue Concerns</p>
                {aiResult.fatigue_flags.map((f: any, i: number) => (
                  <p key={i} className="text-xs text-muted-foreground bg-destructive/10 rounded p-2">{f.concern}</p>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              {aiResult.cox && (
                <div className="flex items-center gap-3 p-2 rounded border bg-muted/30">
                  <span className="text-sm font-medium w-16 shrink-0 text-muted-foreground">Cox</span>
                  <span className="text-sm font-semibold flex-1">
                    {displayName(allAthletes.find(a => a.id === aiResult.cox?.user_id))}
                  </span>
                  <span className="text-xs text-muted-foreground">{aiResult.cox?.rationale}</span>
                </div>
              )}
              {(aiResult.seats || []).map((seat: any) => {
                const athlete = allAthletes.find(a => a.id === seat.user_id);
                return (
                  <div key={seat.seat_number} className="flex items-center gap-3 p-2 rounded border">
                    <span className="text-sm font-medium w-16 shrink-0 text-muted-foreground">
                      {seat.seat_number === 0 ? "Cox" : `Seat ${seat.seat_number}`}
                    </span>
                    <span className="text-sm font-semibold flex-1">{displayName(athlete)}</span>
                    <div className="flex items-center gap-1">
                      <Progress value={Math.round((seat.confidence || 0) * 100)} className="w-16 h-1.5" />
                      <span className="text-xs text-muted-foreground w-8">{Math.round((seat.confidence || 0) * 100)}%</span>
                    </div>
                    {seat.rationale && <span className="text-xs text-muted-foreground hidden md:block max-w-[160px] truncate" title={seat.rationale}>{seat.rationale}</span>}
                  </div>
                );
              })}
            </div>

            {aiResult.overall_rationale && (
              <p className="text-sm text-muted-foreground italic border-l-2 border-primary/30 pl-3">{aiResult.overall_rationale}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Saved lineups */}
      {savedLineups.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Saved Race Lineups</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {savedLineups.map((lineup: any) => (
                <div key={lineup.id} className="flex items-center gap-3 p-2 rounded border hover:bg-muted/50">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{lineup.race_name || "Race"}</p>
                    <p className="text-xs text-muted-foreground">{lineup.race_date || "TBD"} — {lineup.boat_class}</p>
                  </div>
                  <Badge variant="outline">{Array.isArray(lineup.seats) ? lineup.seats.length : 0} seats</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RaceLineupOptimizer;
