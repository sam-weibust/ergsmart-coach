import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Ship } from "lucide-react";
import { BOAT_CLASSES } from "./constants";

interface Props {
  teamId: string;
  isCoach: boolean;
}

const BoatManager = ({ teamId, isCoach }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", boat_class: "8+" });
  const [showForm, setShowForm] = useState(false);

  const { data: boats = [] } = useQuery({
    queryKey: ["team-boats", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_boats")
        .select("*")
        .eq("team_id", teamId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const createBoat = useMutation({
    mutationFn: async () => {
      if (!form.name) throw new Error("Boat name required");
      const { error } = await supabase.from("team_boats").insert({
        team_id: teamId,
        name: form.name,
        boat_class: form.boat_class,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Boat added" });
      setForm({ name: "", boat_class: "8+" });
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["team-boats", teamId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, val }: { id: string; val: boolean }) => {
      const { error } = await supabase.from("team_boats").update({ is_active: val }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-boats", teamId] }),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteBoat = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("team_boats").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-boats", teamId] });
      toast({ title: "Boat removed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Named Boats</h2>
        {isCoach && (
          <Button size="sm" className="gap-2" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" />Add Boat
          </Button>
        )}
      </div>

      {showForm && isCoach && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Boat Name</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Varsity 8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Boat Class</Label>
                <Select value={form.boat_class} onValueChange={v => setForm(f => ({ ...f, boat_class: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{BOAT_CLASSES.map(bc => <SelectItem key={bc} value={bc}>{bc}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => createBoat.mutate()} disabled={createBoat.isPending}>Add Boat</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {boats.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Ship className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No boats yet. Add your team's boats to use named boats in lineups.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {boats.map((b: any) => (
            <Card key={b.id} className={!b.is_active ? "opacity-60" : ""}>
              <CardContent className="py-3 px-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Ship className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="font-medium text-sm">{b.name}</p>
                    <p className="text-xs text-muted-foreground">{b.boat_class}</p>
                  </div>
                  {!b.is_active && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                </div>
                {isCoach && (
                  <div className="flex items-center gap-2">
                    <Switch checked={b.is_active} onCheckedChange={val => toggleActive.mutate({ id: b.id, val })} />
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteBoat.mutate(b.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default BoatManager;
