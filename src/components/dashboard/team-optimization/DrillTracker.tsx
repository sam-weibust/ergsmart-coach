import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Clock } from "lucide-react";

const DRILL_LIBRARY = [
  "Pause Drill",
  "Pick Drill",
  "Square Blade Rowing",
  "Feet Out Rowing",
  "Arms Only",
  "Body Swing",
  "Catch Placement",
  "Finish Drill",
  "Ratio Work",
  "Balance Drill",
  "Custom...",
];

interface Props {
  sessionId: string;
  teamId: string;
  userId: string;
  isCoach?: boolean;
  readOnly?: boolean;
}

const DrillTracker = ({ sessionId, teamId, userId, readOnly = false }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [drillName, setDrillName] = useState("");
  const [customName, setCustomName] = useState("");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");

  const { data: drills = [] } = useQuery({
    queryKey: ["practice-drills", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("practice_drills" as any)
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!sessionId,
  });

  const addDrill = useMutation({
    mutationFn: async () => {
      const name = drillName === "Custom..." ? customName : drillName;
      if (!name.trim()) throw new Error("Drill name required");
      const { error } = await supabase.from("practice_drills" as any).insert({
        session_id: sessionId,
        team_id: teamId,
        drill_name: name.trim(),
        duration_minutes: duration ? parseInt(duration) : null,
        notes: notes || null,
        logged_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Drill logged!" });
      queryClient.invalidateQueries({ queryKey: ["practice-drills", sessionId] });
      setOpen(false);
      setDrillName("");
      setCustomName("");
      setDuration("");
      setNotes("");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteDrill = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("practice_drills" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["practice-drills", sessionId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Drills ({(drills as any[]).length})</h4>
        {!readOnly && (
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setOpen(true)}>
            <Plus className="h-3 w-3" />Add Drill
          </Button>
        )}
      </div>

      {(drills as any[]).length === 0 && (
        <p className="text-xs text-muted-foreground">No drills logged.</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {(drills as any[]).map((d: any) => (
          <div key={d.id} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs group">
            <span className="font-medium">{d.drill_name}</span>
            {d.duration_minutes && (
              <span className="flex items-center gap-0.5 text-muted-foreground">
                <Clock className="h-2.5 w-2.5" />{d.duration_minutes}m
              </span>
            )}
            {!readOnly && (
              <button
                onClick={() => deleteDrill.mutate(d.id)}
                className="hidden group-hover:flex text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Log Drill</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Drill</Label>
              <Select value={drillName} onValueChange={setDrillName}>
                <SelectTrigger className="h-9 text-sm mt-1">
                  <SelectValue placeholder="Select drill..." />
                </SelectTrigger>
                <SelectContent>
                  {DRILL_LIBRARY.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {drillName === "Custom..." && (
              <div>
                <Label className="text-xs">Custom Drill Name</Label>
                <Input className="h-9 text-sm mt-1" placeholder="Drill name..." value={customName}
                  onChange={e => setCustomName(e.target.value)} />
              </div>
            )}
            <div>
              <Label className="text-xs">Duration (minutes)</Label>
              <Input className="h-9 text-sm mt-1" placeholder="10" type="number" value={duration}
                onChange={e => setDuration(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea className="text-sm mt-1 min-h-[60px] resize-none" placeholder="Optional notes..."
                value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => addDrill.mutate()} disabled={addDrill.isPending}>
              Log Drill
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DrillTracker;
