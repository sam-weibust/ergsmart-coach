import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TimeInput } from "@/components/ui/TimeInput";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Layers } from "lucide-react";

interface MultiPieceSessionProps {
  profile: any;
}

interface Piece {
  id: string;
  distance: string;
  time: string;
  avgSplit: string;
  avgHR: string;
  notes: string;
  swapErg: boolean;
}

const createPiece = (): Piece => ({
  id: crypto.randomUUID(),
  distance: "",
  time: "",
  avgSplit: "",
  avgHR: "",
  notes: "",
  swapErg: false,
});

const parseTime = (t: string): number | null => {
  const parts = t.trim().split(":");
  if (parts.length === 2) {
    const m = parseInt(parts[0]);
    const s = parseFloat(parts[1]);
    return isNaN(m) || isNaN(s) ? null : m * 60 + s;
  }
  const s = parseFloat(t);
  return isNaN(s) ? null : s;
};

const fmt = (s: number): string => {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, "0")}`;
};

const MultiPieceSession = ({ profile }: MultiPieceSessionProps) => {
  const { toast } = useToast();
  const [pieces, setPieces] = useState<Piece[]>([createPiece()]);
  const [loading, setLoading] = useState(false);

  const updatePiece = (id: string, field: keyof Piece, value: any) => {
    setPieces(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const addPiece = () => setPieces(prev => [...prev, createPiece()]);
  const removePiece = (id: string) => {
    if (pieces.length > 1) setPieces(prev => prev.filter(p => p.id !== id));
  };

  // Summary calculations
  const totalDistance = pieces.reduce((sum, p) => sum + (parseInt(p.distance) || 0), 0);
  const totalTimeSec = pieces.reduce((sum, p) => sum + (parseTime(p.time) || 0), 0);
  const avgPace = totalDistance > 0 ? totalTimeSec / (totalDistance / 500) : 0;

  const weightedHR = (() => {
    let totalWeightedHR = 0;
    let totalHRDist = 0;
    pieces.forEach(p => {
      const hr = parseInt(p.avgHR);
      const dist = parseInt(p.distance);
      if (hr && dist) {
        totalWeightedHR += hr * dist;
        totalHRDist += dist;
      }
    });
    return totalHRDist > 0 ? Math.round(totalWeightedHR / totalHRDist) : null;
  })();

  const handleSave = async () => {
    if (!profile) return;
    setLoading(true);

    try {
      const sessionId = crypto.randomUUID();
      const pieceRows = pieces.map((p, i) => {
        const dist = parseInt(p.distance) || null;
        const timeSec = parseTime(p.time);
        let split = p.avgSplit || null;
        if (!split && dist && timeSec) {
          split = fmt(timeSec / (dist / 500));
        }
        return {
          user_id: profile.id,
          workout_type: "multi_piece",
          distance: dist,
          duration: p.time || null,
          avg_split: split,
          avg_heart_rate: parseInt(p.avgHR) || null,
          notes: `Piece ${i + 1}${p.swapErg ? " [Swap Erg]" : ""}${p.notes ? ": " + p.notes : ""}`,
          session_id: sessionId,
        };
      });

      // Insert individual pieces
      const { error: pErr } = await supabase.from("erg_workouts").insert(pieceRows as any);
      if (pErr) throw pErr;

      // Insert summary row
      const { error: sErr } = await supabase.from("erg_workouts").insert({
        user_id: profile.id,
        workout_type: "multi_piece_summary",
        distance: totalDistance || null,
        duration: totalTimeSec > 0 ? fmt(totalTimeSec) : null,
        avg_split: avgPace > 0 ? fmt(avgPace) : null,
        avg_heart_rate: weightedHR,
        notes: `Multi-piece session: ${pieces.length} pieces`,
        session_id: sessionId,
      } as any);
      if (sErr) throw sErr;

      toast({ title: "Session saved!", description: `${pieces.length} pieces logged.` });
      setPieces([createPiece()]);
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Failed to save session.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5" />
          Multi-Piece Session
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {pieces.map((piece, i) => (
          <div key={piece.id} className="p-3 border rounded-lg bg-muted/20 space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="secondary">Piece {i + 1}</Badge>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    checked={piece.swapErg}
                    onCheckedChange={v => updatePiece(piece.id, "swapErg", !!v)}
                    id={`swap-${piece.id}`}
                  />
                  <Label htmlFor={`swap-${piece.id}`} className="text-xs cursor-pointer">Swap Erg</Label>
                </div>
                {pieces.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => removePiece(piece.id)} className="h-7 w-7 p-0">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Distance (m)</Label>
                <Input type="number" placeholder="2000" value={piece.distance} onChange={e => updatePiece(piece.id, "distance", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Time (mm:ss)</Label>
                <TimeInput value={piece.time} onChange={v => updatePiece(piece.id, "time", v)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Avg Split</Label>
                <TimeInput value={piece.avgSplit} onChange={v => updatePiece(piece.id, "avgSplit", v)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Avg HR</Label>
                <Input type="number" placeholder="155" value={piece.avgHR} onChange={e => updatePiece(piece.id, "avgHR", e.target.value)} />
              </div>
            </div>
            <Input placeholder="Notes for this piece..." value={piece.notes} onChange={e => updatePiece(piece.id, "notes", e.target.value)} className="text-sm" />
          </div>
        ))}

        <Button variant="outline" onClick={addPiece} className="w-full gap-1.5">
          <Plus className="h-4 w-4" /> Add Piece
        </Button>

        {/* Live Summary */}
        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 space-y-1">
          <h4 className="text-sm font-semibold">Session Summary</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Total Distance:</span>
              <span className="font-mono font-bold ml-1">{totalDistance}m</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total Time:</span>
              <span className="font-mono font-bold ml-1">{totalTimeSec > 0 ? fmt(totalTimeSec) : "--"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Avg Pace:</span>
              <span className="font-mono font-bold ml-1">{avgPace > 0 ? fmt(avgPace) + " /500m" : "--"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Avg HR:</span>
              <span className="font-mono font-bold ml-1">{weightedHR ? weightedHR + " bpm" : "--"}</span>
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={loading || pieces.every(p => !p.distance)} className="w-full">
          {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save Multi-Piece Session"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default MultiPieceSession;
