import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Plus, Trash2, MapPin, Trophy, Users } from "lucide-react";
import { toast } from "sonner";

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];
const DIVISIONS = ["D1", "D2", "D3", "Ivy", "NAIA", "Club"];

// Simple state grid layout for the map (geographic approximate positions)
const STATE_GRID: Record<string, [number, number]> = {
  WA:[0,0],MT:[0,1],ND:[0,2],MN:[0,3],WI:[0,4],MI:[0,5],NY:[0,6],VT:[0,7],ME:[0,8],
  OR:[1,0],ID:[1,1],SD:[1,2],IA:[1,3],IL:[1,4],IN:[1,5],OH:[1,6],PA:[1,7],NH:[1,8],
  CA:[2,0],NV:[2,1],WY:[2,2],NE:[2,3],MO:[2,4],KY:[2,5],WV:[2,6],NJ:[2,7],MA:[2,8],
  AK:[3,0],AZ:[3,1],UT:[3,2],CO:[3,3],KS:[3,4],TN:[3,5],VA:[3,6],MD:[3,7],CT:[3,8],
  HI:[4,0],NM:[4,1],OK:[4,2],AR:[4,3],MS:[4,4],NC:[4,5],SC:[4,6],DE:[4,7],RI:[4,8],
  TX:[5,2],LA:[5,3],AL:[5,4],GA:[5,5],FL:[5,6],
};

const divisionColors: Record<string, string> = {
  D1: "bg-red-500",
  D2: "bg-blue-500",
  D3: "bg-green-500",
  Ivy: "bg-purple-500",
  NAIA: "bg-orange-500",
  Club: "bg-gray-500",
};

const AlumniNetworkSection = () => {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    athlete_name: "",
    grad_year: "",
    high_school: "",
    college_name: "",
    division: "D3",
    state: "",
    notes: "",
  });

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
  });

  const { data: alumni } = useQuery({
    queryKey: ["program-alumni"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await (supabase as any)
        .from("program_alumni")
        .select("*")
        .eq("coach_id", user.id)
        .order("grad_year", { ascending: false });
      return data || [];
    },
  });

  const addAlumni = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!form.athlete_name.trim()) throw new Error("Athlete name required");
      const { error } = await (supabase as any).from("program_alumni").insert({
        coach_id: user.id,
        athlete_name: form.athlete_name.trim(),
        grad_year: form.grad_year ? parseInt(form.grad_year) : null,
        high_school: form.high_school || null,
        college_name: form.college_name || null,
        division: form.division || null,
        state: form.state || null,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alumni added!");
      setForm({ athlete_name: "", grad_year: "", high_school: "", college_name: "", division: "D3", state: "", notes: "" });
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["program-alumni"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeAlumni = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("program_alumni").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed");
      queryClient.invalidateQueries({ queryKey: ["program-alumni"] });
    },
    onError: () => toast.error("Failed to remove"),
  });

  const stateCounts: Record<string, number> = {};
  const divCounts: Record<string, number> = {};
  (alumni || []).forEach((a: any) => {
    if (a.state) stateCounts[a.state] = (stateCounts[a.state] || 0) + 1;
    if (a.division) divCounts[a.division] = (divCounts[a.division] || 0) + 1;
  });

  const statesWithAlumni = new Set(Object.keys(stateCounts));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Alumni Network</h2>
          <p className="text-muted-foreground text-sm">Track where your former athletes went to college</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Add Alumni
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-primary">{alumni?.length || 0}</div>
            <div className="text-xs text-muted-foreground">Total Placements</div>
          </CardContent>
        </Card>
        {DIVISIONS.filter(d => divCounts[d]).slice(0, 3).map(d => (
          <Card key={d}>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-foreground">{divCounts[d]}</div>
              <div className="text-xs text-muted-foreground">{d} Placements</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Division Breakdown */}
      {alumni?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Division Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {DIVISIONS.filter(d => divCounts[d]).map(d => (
                <div key={d} className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 rounded-full ${divisionColors[d]}`} />
                  <span className="text-sm font-medium">{d}: {divCounts[d]}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Placement Map */}
      {alumni?.length > 0 && statesWithAlumni.size > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Placement Map
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative overflow-x-auto">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 2.5rem)", gap: "3px" }}>
                {Array.from({ length: 6 }, (_, row) =>
                  Array.from({ length: 9 }, (_, col) => {
                    const state = Object.entries(STATE_GRID).find(([, [r, c]]) => r === row && c === col)?.[0];
                    if (!state) return <div key={`${row}-${col}`} className="h-9" />;
                    const hasAlumni = statesWithAlumni.has(state);
                    const count = stateCounts[state] || 0;
                    return (
                      <div
                        key={state}
                        title={`${state}: ${count} alumni`}
                        className={`relative h-9 w-9 rounded flex items-center justify-center text-xs font-bold transition-all ${
                          hasAlumni
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {state}
                        {hasAlumni && count > 1 && (
                          <span className="absolute -top-1 -right-1 h-4 w-4 bg-secondary text-secondary-foreground rounded-full text-[10px] flex items-center justify-center">{count}</span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">Highlighted states have alumni placements</p>
          </CardContent>
        </Card>
      )}

      {/* Add Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add Alumni</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>Athlete Name *</Label>
                <Input value={form.athlete_name} onChange={e => setForm({ ...form, athlete_name: e.target.value })} placeholder="Full name" />
              </div>
              <div className="space-y-1.5">
                <Label>Grad Year</Label>
                <Input type="number" value={form.grad_year} onChange={e => setForm({ ...form, grad_year: e.target.value })} placeholder="2024" />
              </div>
              <div className="space-y-1.5">
                <Label>Division</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.division} onChange={e => setForm({ ...form, division: e.target.value })}>
                  {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>College / University</Label>
                <Input value={form.college_name} onChange={e => setForm({ ...form, college_name: e.target.value })} placeholder="e.g. University of Washington" />
              </div>
              <div className="space-y-1.5">
                <Label>State</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.state} onChange={e => setForm({ ...form, state: e.target.value })}>
                  <option value="">Select state...</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>High School (optional)</Label>
                <Input value={form.high_school} onChange={e => setForm({ ...form, high_school: e.target.value })} placeholder="High school name" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={() => addAlumni.mutate()} disabled={!form.athlete_name.trim() || addAlumni.isPending}>
                {addAlumni.isPending ? "Adding..." : "Add Alumni"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alumni List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-primary" />
            Alumni List ({alumni?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!alumni?.length ? (
            <div className="p-8 text-center text-muted-foreground">
              <GraduationCap className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No alumni logged yet</p>
              <p className="text-sm">Add former athletes to build your placement history</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {alumni.map((a: any) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-foreground">{a.athlete_name}</span>
                      {a.grad_year && <span className="text-xs text-muted-foreground">'{String(a.grad_year).slice(-2)}</span>}
                      {a.division && (
                        <Badge className={`text-xs text-white ${divisionColors[a.division] || "bg-gray-500"}`}>
                          {a.division}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      {a.college_name && <span>{a.college_name}</span>}
                      {a.state && <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{a.state}</span>}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => { if (confirm(`Remove ${a.athlete_name}?`)) removeAlumni.mutate(a.id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AlumniNetworkSection;
