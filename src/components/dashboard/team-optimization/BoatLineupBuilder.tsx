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
import { DndContext, closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Ship, Loader2, Wand2, Save, GripVertical, Trash2 } from "lucide-react";
import { BOAT_CLASSES, BOAT_SEAT_COUNTS, HAS_COX } from "./constants";

interface Props {
  teamId: string;
  teamName: string;
  teamMembers: any[];
  isCoach: boolean;
  profile: any;
}

interface SeatAssignment {
  seat_number: number;
  user_id: string | null;
  name: string;
  rationale?: string;
}

function SortableSeat({ seat, athletes, onAthleteChange }: {
  seat: SeatAssignment;
  athletes: any[];
  onAthleteChange: (seatNum: number, userId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: String(seat.seat_number) });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 p-2 rounded-lg border bg-card">
      <button {...attributes} {...listeners} className="cursor-grab touch-none text-muted-foreground hover:text-foreground">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="w-16 text-sm font-medium text-muted-foreground shrink-0">
        {seat.seat_number === 0 ? "Cox" : `Seat ${seat.seat_number}`}
      </div>
      <Select value={seat.user_id || "none"} onValueChange={v => onAthleteChange(seat.seat_number, v === "none" ? "" : v)}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder="Unassigned" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Unassigned</SelectItem>
          {athletes.map(a => (
            <SelectItem key={a.id} value={String(a.id)}>{a.full_name || a.username || a.id}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {seat.rationale && (
        <span className="text-xs text-muted-foreground truncate max-w-[120px]" title={seat.rationale}>{seat.rationale}</span>
      )}
    </div>
  );
}

const BoatLineupBuilder = ({ teamId, teamMembers, isCoach, profile }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor));

  const [createOpen, setCreateOpen] = useState(false);
  const [editingLineup, setEditingLineup] = useState<any | null>(null);
  const [newName, setNewName] = useState("");
  const [newBoatClass, setNewBoatClass] = useState<string>("8+");
  const [seats, setSeats] = useState<SeatAssignment[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [balanceScore, setBalanceScore] = useState<number | null>(null);
  const [aiRationale, setAiRationale] = useState<string>("");

  const allAthletes = teamMembers.map((m: any) => m.profile || m).filter((a: any) => a?.id);

  const { data: lineups = [], isLoading } = useQuery({
    queryKey: ["boat-lineups", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("boat_lineups")
        .select("*")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  function initSeats(boatClass: string) {
    const count = BOAT_SEAT_COUNTS[boatClass] || 8;
    const hasCox = HAS_COX[boatClass];
    const newSeats: SeatAssignment[] = [];
    if (hasCox) {
      newSeats.push({ seat_number: 0, user_id: null, name: "Cox" });
    }
    const rowerCount = hasCox ? count - 1 : count;
    for (let i = 1; i <= rowerCount; i++) {
      newSeats.push({ seat_number: i, user_id: null, name: `Seat ${i}` });
    }
    return newSeats;
  }

  function openCreate() {
    setNewName("");
    setNewBoatClass("8+");
    setSeats(initSeats("8+"));
    setBalanceScore(null);
    setAiRationale("");
    setEditingLineup(null);
    setCreateOpen(true);
  }

  function openEdit(lineup: any) {
    setNewName(lineup.name);
    setNewBoatClass(lineup.boat_class);
    const savedSeats: SeatAssignment[] = Array.isArray(lineup.seats) ? lineup.seats : [];
    const basedSeats = initSeats(lineup.boat_class).map(s => {
      const saved = savedSeats.find((ss: any) => ss.seat_number === s.seat_number);
      return saved ? { ...s, ...saved } : s;
    });
    setSeats(basedSeats);
    setBalanceScore(null);
    setAiRationale(lineup.ai_rationale || "");
    setEditingLineup(lineup);
    setCreateOpen(true);
  }

  function handleBoatClassChange(bc: string) {
    setNewBoatClass(bc);
    setSeats(initSeats(bc));
    setBalanceScore(null);
    setAiRationale("");
  }

  function handleAthleteChange(seatNum: number, userId: string) {
    const cleanId = userId && userId !== "none" ? userId : null;
    setSeats(prev => prev.map(s => s.seat_number === seatNum ? {
      ...s,
      user_id: cleanId,
      name: cleanId ? (allAthletes.find((a: any) => a.id === cleanId)?.full_name || "") : "",
    } : s));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSeats(prev => {
      const oldIndex = prev.findIndex(s => String(s.seat_number) === active.id);
      const newIndex = prev.findIndex(s => String(s.seat_number) === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  async function suggestLineup() {
    setAiLoading(true);
    try {
      const athletePool = allAthletes;
      const { data, error } = await supabase.functions.invoke("suggest-boat-lineup", {
        body: { team_id: teamId, boat_class: newBoatClass, athlete_pool: athletePool, locked_seats: [] },
      });
      if (error) throw new Error(error.message);
      if (data?.seats) {
        const updatedSeats = initSeats(newBoatClass).map(s => {
          if (s.seat_number === 0 && data.cox) {
            return { ...s, user_id: data.cox.user_id, name: data.cox.name || "", rationale: data.cox.rationale };
          }
          const suggested = data.seats.find((ss: any) => ss.seat_number === s.seat_number);
          return suggested ? { ...s, user_id: suggested.user_id, name: suggested.name || "", rationale: suggested.rationale } : s;
        });
        setSeats(updatedSeats);
        setBalanceScore(data.balance_score ?? null);
        setAiRationale(data.overall_rationale || "");
        toast({ title: "AI lineup suggested!" });
      }
    } catch (e: any) {
      toast({ title: "AI Error", description: e.message, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  }

  const saveLineup = useMutation({
    mutationFn: async () => {
      const payload = {
        team_id: teamId,
        name: newName,
        boat_class: newBoatClass,
        seats,
        ai_suggestion_used: !!aiRationale,
        ai_rationale: aiRationale || null,
        updated_at: new Date().toISOString(),
        created_by: profile.id,
      };
      if (editingLineup) {
        const { error } = await supabase.from("boat_lineups").update(payload).eq("id", editingLineup.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("boat_lineups").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: editingLineup ? "Lineup updated!" : "Lineup saved!" });
      queryClient.invalidateQueries({ queryKey: ["boat-lineups", teamId] });
      setCreateOpen(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteLineup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("boat_lineups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Lineup deleted" });
      queryClient.invalidateQueries({ queryKey: ["boat-lineups", teamId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin h-6 w-6" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Boat Lineup Builder</h2>
          <p className="text-sm text-muted-foreground">Create and manage boat lineups with AI assistance</p>
        </div>
        {isCoach && (
          <Button size="sm" className="gap-2" onClick={openCreate}><Plus className="h-4 w-4" />New Lineup</Button>
        )}
      </div>

      {lineups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Ship className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No lineups yet. Create your first boat lineup.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {lineups.map((lineup: any) => {
            const seatsArr: SeatAssignment[] = Array.isArray(lineup.seats) ? lineup.seats : [];
            const filledSeats = seatsArr.filter(s => s.user_id).length;
            return (
              <Card key={lineup.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{lineup.name}</CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <Badge variant="outline">{lineup.boat_class}</Badge>
                        <Badge variant={lineup.status === "final" ? "default" : "secondary"}>{lineup.status}</Badge>
                        {lineup.ai_suggestion_used && <Badge variant="outline" className="gap-1 text-xs"><Wand2 className="h-3 w-3" />AI</Badge>}
                      </CardDescription>
                    </div>
                    {isCoach && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(lineup)}>Edit</Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteLineup.mutate(lineup.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground mb-2">{filledSeats}/{seatsArr.length} seats filled</div>
                  {seatsArr.slice(0, 4).map((s: any) => (
                    <div key={s.seat_number} className="flex gap-2 text-xs py-0.5">
                      <span className="text-muted-foreground w-12 shrink-0">{s.seat_number === 0 ? "Cox" : `Seat ${s.seat_number}`}</span>
                      <span className="font-medium">{s.name || s.user_id || "—"}</span>
                    </div>
                  ))}
                  {seatsArr.length > 4 && <p className="text-xs text-muted-foreground mt-1">+{seatsArr.length - 4} more seats</p>}
                  {lineup.ai_rationale && (
                    <p className="text-xs text-muted-foreground mt-2 italic line-clamp-2">{lineup.ai_rationale}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLineup ? "Edit Lineup" : "New Boat Lineup"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Lineup Name</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Varsity 8+" />
              </div>
              <div className="space-y-1">
                <Label>Boat Class</Label>
                <Select value={newBoatClass} onValueChange={handleBoatClassChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BOAT_CLASSES.map(bc => <SelectItem key={bc} value={bc}>{bc}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isCoach && (
              <Button type="button" variant="outline" className="w-full gap-2" onClick={suggestLineup} disabled={aiLoading}>
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                AI Suggest Lineup
              </Button>
            )}

            {balanceScore !== null && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Balance Score:</span>
                <Badge variant={balanceScore >= 75 ? "default" : balanceScore >= 50 ? "secondary" : "destructive"}>
                  {balanceScore}/100
                </Badge>
              </div>
            )}

            {aiRationale && (
              <p className="text-xs text-muted-foreground italic bg-muted/50 rounded p-2">{aiRationale}</p>
            )}

            <div className="space-y-1">
              <Label>Seat Assignments (drag to reorder)</Label>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={seats.map(s => String(s.seat_number))} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5">
                    {seats.map(seat => (
                      <SortableSeat
                        key={seat.seat_number}
                        seat={seat}
                        athletes={allAthletes}
                        onAthleteChange={handleAthleteChange}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            <Button
              className="w-full gap-2"
              onClick={() => saveLineup.mutate()}
              disabled={saveLineup.isPending || !newName}
            >
              {saveLineup.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingLineup ? "Update Lineup" : "Save Lineup"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BoatLineupBuilder;
