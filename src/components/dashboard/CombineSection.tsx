import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Medal, TrendingUp, Users, Award, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { getSessionUser } from '@/lib/getUser';

function secondsToSplit(s: number): string {
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function splitToSeconds(split: string): number {
  const parts = split.split(":");
  if (parts.length !== 2) return 0;
  return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
}

function computeScore(entry: any): number {
  const twok = entry.two_k_watts ? Math.min(100, Math.max(0, (entry.two_k_watts - 100) / 3.5)) : 0;
  const sixk = entry.six_k_watts ? Math.min(100, Math.max(0, (entry.six_k_watts - 100) / 2.8)) : 0;
  const bench = entry.bench_press_kg || 0;
  const dead = entry.deadlift_kg || 0;
  const strength = Math.min(100, Math.max(0, ((bench + dead) - 50) / 2.5));
  let components = 0;
  let weight = 0;
  if (entry.two_k_watts) { components += twok * 0.5; weight += 0.5; }
  if (entry.six_k_watts) { components += sixk * 0.3; weight += 0.3; }
  if (bench || dead) { components += strength * 0.2; weight += 0.2; }
  if (weight === 0) return 0;
  return Math.round((components / weight) * weight * 10) / 10;
}

const CombineSection = () => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    two_k_split: "",
    six_k_split: "",
    bench_press_kg: "",
    deadlift_kg: "",
    squat_kg: "",
    weight_kg: "",
    grad_year: "",
    gender: "M",
    notes: "",
  });

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const user = await getSessionUser();
      return user;
    },
  });

  const { data: myEntry } = useQuery({
    queryKey: ["my-combine-entry"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const { data } = await (supabase as any).from("combine_entries").select("*").eq("user_id", user.id).maybeSingle();
      return data;
    },
  });

  const { data: allEntries } = useQuery({
    queryKey: ["all-combine-entries"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("combine_entries")
        .select("*, profiles(username, full_name)")
        .order("combine_score", { ascending: false });
      return (data || []).map((e: any) => ({ ...e, computed_score: computeScore(e) }));
    },
  });

  const saveEntry = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const two_k_seconds = form.two_k_split ? splitToSeconds(form.two_k_split) : null;
      const six_k_seconds = form.six_k_split ? splitToSeconds(form.six_k_split) : null;
      // Approx watts from split: watts ≈ (2.8 / (split_s / 500))^3
      const two_k_watts = two_k_seconds ? Math.round(2.8 ** 3 / Math.pow(two_k_seconds / 500, 3)) : null;
      const six_k_watts = six_k_seconds ? Math.round(2.8 ** 3 / Math.pow(six_k_seconds / 500, 3)) : null;
      const bench = form.bench_press_kg ? parseFloat(form.bench_press_kg) : null;
      const dead = form.deadlift_kg ? parseFloat(form.deadlift_kg) : null;
      const squat = form.squat_kg ? parseFloat(form.squat_kg) : null;
      const weight = form.weight_kg ? parseFloat(form.weight_kg) : null;
      const entry = {
        user_id: user.id,
        two_k_seconds,
        two_k_watts,
        six_k_seconds,
        six_k_watts,
        bench_press_kg: bench,
        deadlift_kg: dead,
        squat_kg: squat,
        weight_kg: weight,
        grad_year: form.grad_year ? parseInt(form.grad_year) : null,
        gender: form.gender,
        notes: form.notes || null,
        combine_score: computeScore({ two_k_watts, six_k_watts, bench_press_kg: bench, deadlift_kg: dead }),
      };
      const { error } = await (supabase as any).from("combine_entries").upsert(entry, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Combine entry saved!");
      queryClient.invalidateQueries({ queryKey: ["my-combine-entry"] });
      queryClient.invalidateQueries({ queryKey: ["all-combine-entries"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const myRank = allEntries ? allEntries.findIndex((e: any) => e.user_id === user?.id) + 1 : 0;
  const myPercentile = allEntries?.length && myRank > 0
    ? Math.round((1 - (myRank - 1) / allEntries.length) * 100)
    : null;
  const myScore = myEntry ? computeScore(myEntry) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Virtual Combine</h2>
          <p className="text-muted-foreground text-sm">Standardized testing for national ranking among CrewSync athletes</p>
        </div>
        <Badge variant="outline" className="gap-1 text-primary border-primary">
          <Users className="h-3.5 w-3.5" />
          {allEntries?.length || 0} athletes
        </Badge>
      </div>

      {myEntry && myScore !== null && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/30">
            <CardContent className="p-4 text-center">
              <Award className="h-7 w-7 text-primary mx-auto mb-1" />
              <div className="text-3xl font-bold text-primary">{myScore.toFixed(1)}</div>
              <div className="text-xs text-muted-foreground">Combine Score</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-secondary/10 to-secondary/5 border-secondary/30">
            <CardContent className="p-4 text-center">
              <Trophy className="h-7 w-7 text-secondary mx-auto mb-1" />
              <div className="text-3xl font-bold text-secondary">#{myRank}</div>
              <div className="text-xs text-muted-foreground">National Rank</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-accent/10 to-accent/5 border-accent/30">
            <CardContent className="p-4 text-center">
              <ChevronUp className="h-7 w-7 text-accent mx-auto mb-1" />
              <div className="text-3xl font-bold text-accent">{myPercentile}th</div>
              <div className="text-xs text-muted-foreground">Percentile</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue={myEntry ? "rankings" : "submit"} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="submit">Submit Tests</TabsTrigger>
          <TabsTrigger value="rankings">National Rankings</TabsTrigger>
        </TabsList>

        <TabsContent value="submit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Log Your Combine Results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>2k Erg Split (m:ss)</Label>
                  <Input
                    placeholder="e.g. 1:45.0"
                    value={form.two_k_split}
                    onChange={(e) => setForm({ ...form, two_k_split: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">50% of combine score</p>
                </div>
                <div className="space-y-1.5">
                  <Label>6k Erg Split (m:ss)</Label>
                  <Input
                    placeholder="e.g. 1:55.0"
                    value={form.six_k_split}
                    onChange={(e) => setForm({ ...form, six_k_split: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">30% of combine score</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Bench Press (kg)</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 80"
                    value={form.bench_press_kg}
                    onChange={(e) => setForm({ ...form, bench_press_kg: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Deadlift (kg)</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 120"
                    value={form.deadlift_kg}
                    onChange={(e) => setForm({ ...form, deadlift_kg: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Squat (kg)</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 100"
                    value={form.squat_kg}
                    onChange={(e) => setForm({ ...form, squat_kg: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Body Weight (kg)</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 80"
                    value={form.weight_kg}
                    onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Grad Year</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 2026"
                    value={form.grad_year}
                    onChange={(e) => setForm({ ...form, grad_year: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Gender</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value })}
                  >
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
                </div>
              </div>
              <Button
                onClick={() => saveEntry.mutate()}
                disabled={saveEntry.isPending || (!form.two_k_split && !form.six_k_split)}
                className="w-full"
              >
                {saveEntry.isPending ? "Saving..." : myEntry ? "Update Combine Entry" : "Submit Combine Entry"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rankings" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              {!allEntries?.length ? (
                <div className="p-8 text-center text-muted-foreground">No combine entries yet. Be the first!</div>
              ) : (
                <div className="divide-y divide-border">
                  {allEntries.map((entry: any, idx: number) => {
                    const isMe = entry.user_id === user?.id;
                    const name = entry.profiles?.username || entry.profiles?.full_name || "Athlete";
                    const score = entry.computed_score;
                    return (
                      <div key={entry.id} className={`flex items-center gap-3 p-4 ${isMe ? "bg-primary/5" : ""}`}>
                        <div className="w-8 text-center font-bold text-sm">
                          {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`font-medium text-sm ${isMe ? "text-primary" : ""}`}>{name}</span>
                            {isMe && <Badge variant="outline" className="text-xs py-0 h-4 text-primary border-primary">You</Badge>}
                            {entry.grad_year && <span className="text-xs text-muted-foreground">{entry.grad_year}</span>}
                          </div>
                          <div className="flex gap-3 mt-0.5 text-xs text-muted-foreground">
                            {entry.two_k_seconds && <span>2k: {secondsToSplit(entry.two_k_seconds)}</span>}
                            {entry.six_k_seconds && <span>6k: {secondsToSplit(entry.six_k_seconds)}</span>}
                            {entry.two_k_watts && <span>{entry.two_k_watts}W</span>}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-lg text-foreground">{score.toFixed(1)}</div>
                          <div className="text-xs text-muted-foreground">score</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CombineSection;
