import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, CheckCircle, Calendar } from "lucide-react";

interface Props {
  teamId: string;
  isCoach: boolean;
  onSeasonChange?: (seasonId: string | null) => void;
}

const SeasonManager = ({ teamId, isCoach, onSeasonChange }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", start_date: "", end_date: "" });
  const [showForm, setShowForm] = useState(false);

  const { data: seasons = [] } = useQuery({
    queryKey: ["team-seasons", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_seasons")
        .select("*")
        .eq("team_id", teamId)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const createSeason = useMutation({
    mutationFn: async () => {
      if (!form.name || !form.start_date || !form.end_date) throw new Error("All fields required");
      const { error } = await supabase.from("team_seasons").insert({
        team_id: teamId,
        name: form.name,
        start_date: form.start_date,
        end_date: form.end_date,
        is_active: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Season created" });
      setForm({ name: "", start_date: "", end_date: "" });
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["team-seasons", teamId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const setActive = useMutation({
    mutationFn: async (seasonId: string) => {
      await supabase.from("team_seasons").update({ is_active: false }).eq("team_id", teamId);
      const { error } = await supabase.from("team_seasons").update({ is_active: true }).eq("id", seasonId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-seasons", teamId] });
      toast({ title: "Active season updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteSeason = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("team_seasons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-seasons", teamId] });
      toast({ title: "Season deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Seasons</h2>
        {isCoach && (
          <Button size="sm" className="gap-2" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" />New Season
          </Button>
        )}
      </div>

      {showForm && isCoach && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Season Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Fall 2025" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Start Date</Label>
                <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End Date</Label>
                <Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => createSeason.mutate()} disabled={createSeason.isPending}>Create</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {seasons.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Calendar className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No seasons yet. Create your first season to organize team data.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {seasons.map((s: any) => (
            <Card key={s.id} className={s.is_active ? "border-primary/50 bg-primary/5" : ""}>
              <CardContent className="py-3 px-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{s.name}</span>
                    {s.is_active && <Badge className="text-xs bg-primary">Active</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(s.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} —{" "}
                    {new Date(s.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                {isCoach && (
                  <div className="flex gap-1">
                    {!s.is_active && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1 px-2" onClick={() => setActive.mutate(s.id)}>
                        <CheckCircle className="h-3 w-3" />Set Active
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteSeason.mutate(s.id)}>
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

export default SeasonManager;
