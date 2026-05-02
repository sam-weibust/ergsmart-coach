import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Target, TrendingDown, TrendingUp } from "lucide-react";
import { formatSplit } from "./constants";

const PIECE_TYPES = [
  { value: "intervals", label: "Intervals" },
  { value: "steady_state", label: "Steady State" },
  { value: "drills", label: "Drills" },
  { value: "race", label: "Race" },
] as const;

interface Props {
  sessionId: string;
  teamId: string;
  userId: string;
  readOnly?: boolean;
}

function parseTimeStr(t: string): number | null {
  const m = t.match(/^(\d+):(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseFloat(m[2]);
}

function parseSplitsStr(s: string): any[] {
  if (!s.trim()) return [];
  return s.split(",").map((p, i) => {
    const sec = parseTimeStr(p.trim());
    return sec != null ? { interval: (i + 1) * 500, split_seconds: sec } : null;
  }).filter(Boolean);
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const PieceTracker = ({ sessionId, teamId, userId, readOnly = false }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    piece_type: "intervals",
    distance: "",
    time: "",
    stroke_rate: "",
    target_split: "",
    splits: "",
    notes: "",
  });

  const { data: pieces = [] } = useQuery({
    queryKey: ["on-water-pieces", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("on_water_pieces" as any)
        .select("*")
        .eq("session_id", sessionId)
        .order("piece_number", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!sessionId,
  });

  const addPiece = useMutation({
    mutationFn: async () => {
      const time_seconds = parseTimeStr(form.time);
      const distance = form.distance ? parseInt(form.distance) : null;
      const avg_split = time_seconds && distance ? (time_seconds / distance) * 500 : null;
      const target = form.target_split ? parseTimeStr(form.target_split) : null;
      const splitsArr = parseSplitsStr(form.splits);
      const pieceNum = (pieces as any[]).length + 1;

      const { error } = await supabase.from("on_water_pieces" as any).insert({
        session_id: sessionId,
        team_id: teamId,
        piece_number: pieceNum,
        piece_type: form.piece_type,
        distance,
        time_seconds,
        average_split_seconds: avg_split,
        splits: splitsArr.length > 0 ? splitsArr : null,
        stroke_rate: form.stroke_rate ? parseFloat(form.stroke_rate) : null,
        target_split_seconds: target,
        notes: form.notes || null,
        created_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Piece logged!" });
      queryClient.invalidateQueries({ queryKey: ["on-water-pieces", sessionId] });
      setOpen(false);
      setForm({ piece_type: "intervals", distance: "", time: "", stroke_rate: "", target_split: "", splits: "", notes: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deletePiece = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("on_water_pieces" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Piece deleted" });
      queryClient.invalidateQueries({ queryKey: ["on-water-pieces", sessionId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Pieces ({(pieces as any[]).length})</h4>
        {!readOnly && (
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setOpen(true)}>
            <Plus className="h-3 w-3" />Add Piece
          </Button>
        )}
      </div>

      {(pieces as any[]).length === 0 && (
        <p className="text-xs text-muted-foreground py-2">No pieces logged yet.</p>
      )}

      <div className="space-y-2">
        {(pieces as any[]).map((p: any) => {
          const hitTarget = p.target_split_seconds && p.average_split_seconds
            ? p.average_split_seconds <= p.target_split_seconds
            : null;
          const typeLabel = PIECE_TYPES.find(t => t.value === p.piece_type)?.label || p.piece_type;
          return (
            <div key={p.id} className="flex items-start gap-2 p-2 rounded-lg border text-xs">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 font-bold text-primary text-[10px]">
                {p.piece_number}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">{typeLabel}</Badge>
                  {p.distance && <span>{p.distance}m</span>}
                  {p.time_seconds && <span className="font-mono">{formatTime(p.time_seconds)}</span>}
                  {p.average_split_seconds && (
                    <span className={`font-mono font-semibold ${hitTarget === true ? "text-green-600" : hitTarget === false ? "text-red-600" : ""}`}>
                      {formatSplit(p.average_split_seconds)}/500m
                    </span>
                  )}
                  {hitTarget === true && <TrendingDown className="h-3 w-3 text-green-600" />}
                  {hitTarget === false && <TrendingUp className="h-3 w-3 text-red-600" />}
                  {p.target_split_seconds && (
                    <span className="flex items-center gap-0.5 text-muted-foreground">
                      <Target className="h-2.5 w-2.5" />{formatSplit(p.target_split_seconds)}
                    </span>
                  )}
                  {p.stroke_rate && <span>{p.stroke_rate} s/m</span>}
                </div>
                {Array.isArray(p.splits) && p.splits.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {p.splits.map((sp: any, i: number) => (
                      <span key={i} className="font-mono px-1 py-0.5 rounded bg-muted text-[10px]">
                        {formatSplit(sp.split_seconds)}
                      </span>
                    ))}
                  </div>
                )}
                {p.notes && <p className="text-muted-foreground mt-0.5 line-clamp-1">{p.notes}</p>}
              </div>
              {!readOnly && (
                <button
                  onClick={() => deletePiece.mutate(p.id)}
                  className="text-muted-foreground hover:text-destructive p-0.5"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Piece #{(pieces as any[]).length + 1}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Piece Type</Label>
              <Select value={form.piece_type} onValueChange={v => setForm(f => ({ ...f, piece_type: v }))}>
                <SelectTrigger className="h-9 text-sm mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIECE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Distance (m)</Label>
                <Input className="h-9 text-sm mt-1" placeholder="2000" value={form.distance}
                  onChange={e => setForm(f => ({ ...f, distance: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Time (m:ss)</Label>
                <Input className="h-9 text-sm mt-1 font-mono" placeholder="7:30" value={form.time}
                  onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Target Split (m:ss)</Label>
                <Input className="h-9 text-sm mt-1 font-mono" placeholder="1:52" value={form.target_split}
                  onChange={e => setForm(f => ({ ...f, target_split: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Stroke Rate</Label>
                <Input className="h-9 text-sm mt-1" placeholder="32" value={form.stroke_rate}
                  onChange={e => setForm(f => ({ ...f, stroke_rate: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">500m Splits (comma-separated, e.g. 1:52, 1:53)</Label>
              <Input className="h-9 text-sm mt-1 font-mono" placeholder="1:52, 1:53, 1:51"
                value={form.splits} onChange={e => setForm(f => ({ ...f, splits: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea className="text-sm mt-1 min-h-[60px] resize-none" placeholder="Optional notes..."
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <Button className="w-full" onClick={() => addPiece.mutate()} disabled={addPiece.isPending}>
              Log Piece
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PieceTracker;
