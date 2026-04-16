import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, ArrowLeftRight, Loader2, Wand2, Trash2 } from "lucide-react";
import { BOAT_CLASSES } from "./constants";

interface Props {
  teamId: string;
  teamName: string;
  teamMembers: any[];
  isCoach: boolean;
  profile: any;
}

interface Piece {
  lineup_a: string[];
  lineup_b: string[];
  margin_seconds: number;
  winner: "A" | "B";
  notes: string;
}

const SeatRacingAnalysis = ({ teamId, teamMembers, isCoach, profile }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [aiResult, setAiResult] = useState<any | null>(null);
  const [form, setForm] = useState({
    race_date: new Date().toISOString().split("T")[0],
    boat_class: "8+",
    notes: "",
  });
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [pieceForm, setPieceForm] = useState({
    lineup_a: "",
    lineup_b: "",
    margin: "",
    winner: "A" as "A" | "B",
    notes: "",
  });

  const allAthletes = teamMembers.map((m: any) => m.profile || m).filter(Boolean);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["seat-races", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seat_races")
        .select("*")
        .eq("team_id", teamId)
        .order("race_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  function addPiece() {
    if (!pieceForm.lineup_a || !pieceForm.lineup_b || !pieceForm.margin) return;
    setPieces(prev => [...prev, {
      lineup_a: pieceForm.lineup_a.split(",").map(s => s.trim()).filter(Boolean),
      lineup_b: pieceForm.lineup_b.split(",").map(s => s.trim()).filter(Boolean),
      margin_seconds: parseFloat(pieceForm.margin),
      winner: pieceForm.winner,
      notes: pieceForm.notes,
    }]);
    setPieceForm({ lineup_a: "", lineup_b: "", margin: "", winner: "A", notes: "" });
  }

  const saveSession = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("seat_races").insert({
        team_id: teamId,
        race_date: form.race_date,
        boat_class: form.boat_class,
        pieces,
        notes: form.notes || null,
        created_by: profile.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Seat race session saved!" });
      queryClient.invalidateQueries({ queryKey: ["seat-races", teamId] });
      setAddOpen(false);
      setPieces([]);
      setForm({ race_date: new Date().toISOString().split("T")[0], boat_class: "8+", notes: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  async function analyzeWithAI(session: any) {
    setAiLoading(true);
    setSelectedSession(session);
    setAiResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-seat-race", {
        body: {
          pieces: session.pieces,
          boat_class: session.boat_class,
          athletes: allAthletes.map(a => ({ id: a.id, name: a.full_name || a.username })),
        },
      });
      if (error) throw new Error(error.message);
      setAiResult(data);
      // Save AI ranking back to session
      await supabase.from("seat_races").update({
        ai_ranking: data.rankings,
        ai_confidence: data.overall_confidence,
      }).eq("id", session.id);
      queryClient.invalidateQueries({ queryKey: ["seat-races", teamId] });
    } catch (e: any) {
      toast({ title: "AI Error", description: e.message, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  }

  const deleteSession = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("seat_races").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Session deleted" });
      queryClient.invalidateQueries({ queryKey: ["seat-races", teamId] });
      if (selectedSession) setSelectedSession(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin h-6 w-6" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Seat Racing Analysis</h2>
          <p className="text-sm text-muted-foreground">Log seat race sessions and get AI-powered athlete rankings</p>
        </div>
        {isCoach && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Log Session</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Log Seat Race Session</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Date</Label>
                    <Input type="date" value={form.race_date} onChange={e => setForm(f => ({ ...f, race_date: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Boat Class</Label>
                    <Select value={form.boat_class} onValueChange={v => setForm(f => ({ ...f, boat_class: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{BOAT_CLASSES.map(bc => <SelectItem key={bc} value={bc}>{bc}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Add piece */}
                <div className="border rounded-lg p-3 space-y-3">
                  <p className="text-sm font-medium">Add Piece</p>
                  <div className="space-y-1">
                    <Label className="text-xs">Lineup A (athlete names/IDs, comma separated)</Label>
                    <Input placeholder="e.g. Jones, Smith, ..." value={pieceForm.lineup_a} onChange={e => setPieceForm(f => ({ ...f, lineup_a: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Lineup B</Label>
                    <Input placeholder="e.g. Brown, Davis, ..." value={pieceForm.lineup_b} onChange={e => setPieceForm(f => ({ ...f, lineup_b: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Margin (seconds)</Label>
                      <Input type="number" step="0.1" placeholder="e.g. 2.5" value={pieceForm.margin} onChange={e => setPieceForm(f => ({ ...f, margin: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Winner</Label>
                      <Select value={pieceForm.winner} onValueChange={v => setPieceForm(f => ({ ...f, winner: v as "A" | "B" }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A">Lineup A</SelectItem>
                          <SelectItem value="B">Lineup B</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="w-full" onClick={addPiece} disabled={!pieceForm.lineup_a || !pieceForm.lineup_b || !pieceForm.margin}>
                    + Add Piece
                  </Button>
                </div>

                {pieces.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">Pieces ({pieces.length})</p>
                    {pieces.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs bg-muted/50 rounded p-2">
                        <span className="font-medium">Piece {i + 1}:</span>
                        <span>Winner {p.winner}</span>
                        <span className="text-muted-foreground">by {p.margin_seconds}s</span>
                        <Button type="button" variant="ghost" size="sm" className="h-5 w-5 p-0 ml-auto" onClick={() => setPieces(prev => prev.filter((_, idx) => idx !== i))}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="General notes..." />
                </div>
                <Button className="w-full" onClick={() => saveSession.mutate()} disabled={saveSession.isPending || pieces.length === 0}>
                  {saveSession.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Session"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ArrowLeftRight className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No seat race sessions yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sessions.map((session: any) => {
            const piecesArr = Array.isArray(session.pieces) ? session.pieces : [];
            const rankings = Array.isArray(session.ai_ranking) ? session.ai_ranking : [];
            const isSelected = selectedSession?.id === session.id;
            return (
              <Card key={session.id} className={isSelected ? "ring-2 ring-primary" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{session.race_date}</CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <Badge variant="outline">{session.boat_class}</Badge>
                        <span>{piecesArr.length} pieces</span>
                        {session.ai_confidence && (
                          <Badge variant="secondary">AI: {Math.round(session.ai_confidence * 100)}% confidence</Badge>
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex gap-1">
                      {isCoach && (
                        <>
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => analyzeWithAI(session)} disabled={aiLoading && isSelected}>
                            {aiLoading && isSelected ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                            AI Analyze
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteSession.mutate(session.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                {(rankings.length > 0 || (isSelected && aiResult)) && (
                  <CardContent>
                    <p className="text-sm font-medium mb-2">AI Rankings</p>
                    <div className="space-y-2">
                      {(isSelected && aiResult ? aiResult.rankings : rankings).map((r: any) => (
                        <div key={r.rank} className="flex items-center gap-3">
                          <span className="text-sm font-bold w-6 text-center">{r.rank}</span>
                          <span className="text-sm font-medium flex-1">{r.name}</span>
                          <Progress value={Math.round((r.score || 0) * 100)} className="w-24 h-2" />
                          <span className="text-xs text-muted-foreground w-8">{Math.round((r.score || 0) * 100)}%</span>
                        </div>
                      ))}
                    </div>
                    {isSelected && aiResult?.confidence_notes && (
                      <p className="text-xs text-muted-foreground mt-3 italic">{aiResult.confidence_notes}</p>
                    )}
                    {isSelected && aiResult?.more_racing_needed && (
                      <Badge variant="secondary" className="mt-2">More racing recommended</Badge>
                    )}
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

export default SeatRacingAnalysis;
