import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimeInput } from "@/components/ui/TimeInput";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Plus, TrendingDown, BarChart3, Loader2 } from "lucide-react";
import { splitToWatts, wattsPerKg, displayName } from "./constants";

interface Props {
  teamId: string;
  teamName: string;
  teamMembers: any[];
  isCoach: boolean;
  profile: any;
}

function parseTimeString(timeStr: string): number | null {
  const match = timeStr.match(/^(\d+):(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  return parseInt(match[1]) * 60 + parseFloat(match[2]);
}

function calcSplit(timeSeconds: number, distance: number): number {
  return (timeSeconds / distance) * 500;
}

function formatTime2k(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1);
  return `${m}:${s.padStart(4, "0")}`;
}

const ErgScoreManager = ({ teamId, teamMembers, isCoach, profile }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ user_id: "", test_type: "2k", time: "", total_meters: "", notes: "" });

  const allAthletes = teamMembers.map((m: any) => m.profile || m).filter(Boolean);

  const { data: allScores = [], isLoading } = useQuery({
    queryKey: ["erg-scores", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erg_scores")
        .select("*")
        .eq("team_id", teamId)
        .order("recorded_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Group latest score per user per test type, and track peak
  const latestByUserAndType: Record<string, Record<string, any>> = {};
  const peakByUserAndType: Record<string, Record<string, number>> = {};

  for (const score of allScores) {
    if (!latestByUserAndType[score.user_id]) latestByUserAndType[score.user_id] = {};
    if (!latestByUserAndType[score.user_id][score.test_type]) {
      latestByUserAndType[score.user_id][score.test_type] = score;
    }
    if (!peakByUserAndType[score.user_id]) peakByUserAndType[score.user_id] = {};
    const current = peakByUserAndType[score.user_id][score.test_type] || 0;
    if ((Number(score.watts) || 0) > current) {
      peakByUserAndType[score.user_id][score.test_type] = Number(score.watts) || 0;
    }
  }

  const chartData = selectedAthleteId
    ? [...allScores]
        .filter(s => s.user_id === selectedAthleteId)
        .reverse()
        .map(s => ({
          date: s.recorded_at,
          watts: s.watts ? parseFloat(String(s.watts)) : null,
          type: s.test_type,
        }))
    : [];

  const addScore = useMutation({
    mutationFn: async (data: typeof form) => {
      let watts: number | null = null;
      let avg_split_seconds: number | null = null;
      let time_seconds: number | null = null;

      if (data.test_type !== "60min" && data.time) {
        time_seconds = parseTimeString(data.time);
        if (time_seconds) {
          const distance = data.test_type === "2k" ? 2000 : 6000;
          avg_split_seconds = calcSplit(time_seconds, distance);
          watts = splitToWatts(avg_split_seconds);
        }
      } else if (data.test_type === "60min" && data.total_meters) {
        const meters = parseInt(data.total_meters);
        avg_split_seconds = calcSplit(3600, meters);
        watts = splitToWatts(avg_split_seconds);
      }

      const athlete = allAthletes.find(a => a.id === data.user_id);
      const weight_kg = athlete?.weight_kg || null;
      const wkg = watts && weight_kg ? wattsPerKg(watts, weight_kg) : null;

      const { error } = await supabase.from("erg_scores").insert({
        team_id: teamId,
        user_id: data.user_id,
        test_type: data.test_type,
        time_seconds,
        total_meters: data.total_meters ? parseInt(data.total_meters) : null,
        avg_split_seconds,
        watts,
        watts_per_kg: wkg,
        notes: data.notes || null,
        created_by: profile.id,
        source: "manual",
        is_verified: false,
        to_leaderboard: false,
      });
      if (error) throw error;

      // Auto-update best_2k_seconds or best_6k_seconds on profile if this is a new PR
      if (time_seconds && (data.test_type === "2k" || data.test_type === "6k")) {
        const profileField = data.test_type === "2k" ? "best_2k_seconds" : "best_6k_seconds";
        const dateField = data.test_type === "2k" ? "best_2k_date" : "best_6k_date";
        const { data: currentProfile } = await supabase
          .from("profiles")
          .select(profileField)
          .eq("id", data.user_id)
          .maybeSingle();
        const current = (currentProfile as any)?.[profileField];
        if (!current || time_seconds < current) {
          await supabase.from("profiles").update({
            [profileField]: time_seconds,
            [dateField]: new Date().toISOString().split("T")[0],
          }).eq("id", data.user_id);
        }
      }
    },
    onSuccess: () => {
      toast({ title: "Erg score logged!" });
      queryClient.invalidateQueries({ queryKey: ["erg-scores", teamId] });
      setAddOpen(false);
      setForm({ user_id: "", test_type: "2k", time: "", total_meters: "", notes: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const isDropFlagged = (userId: string, testType: string): boolean => {
    const latest = latestByUserAndType[userId]?.[testType];
    const peak = peakByUserAndType[userId]?.[testType];
    if (!latest?.watts || !peak) return false;
    return (peak - Number(latest.watts)) / peak > 0.05;
  };

  if (isLoading) return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin h-6 w-6" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Erg Score Management</h2>
          <p className="text-sm text-muted-foreground">2K, 6K, and 60-min benchmark scores</p>
        </div>
        {isCoach && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Log Score</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Log Erg Score</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label>Athlete</Label>
                  <Select value={form.user_id} onValueChange={v => setForm(f => ({ ...f, user_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select athlete" /></SelectTrigger>
                    <SelectContent>
                      {allAthletes.map(a => (
                        <SelectItem key={a.id} value={a.id}>{displayName(a)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Test Type</Label>
                  <Select value={form.test_type} onValueChange={v => setForm(f => ({ ...f, test_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2k">2K</SelectItem>
                      <SelectItem value="6k">6K</SelectItem>
                      <SelectItem value="60min">60-minute</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.test_type !== "60min" ? (
                  <div className="space-y-1">
                    <Label>Time (mm:ss)</Label>
                    <TimeInput value={form.time} onChange={v => setForm(f => ({ ...f, time: v }))} />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label>Total Meters (60 min)</Label>
                    <Input type="number" placeholder="e.g. 14200" value={form.total_meters} onChange={e => setForm(f => ({ ...f, total_meters: e.target.value }))} />
                  </div>
                )}
                <div className="space-y-1">
                  <Label>Notes (optional)</Label>
                  <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Conditions, how athlete felt..." />
                </div>
                <Button
                  className="w-full"
                  onClick={() => addScore.mutate(form)}
                  disabled={addScore.isPending || !form.user_id || (form.test_type !== "60min" ? !form.time : !form.total_meters)}
                >
                  {addScore.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Score"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" />Team Erg Scores</CardTitle>
          <CardDescription>Latest scores per test type. Click an athlete to view trend.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-3 font-medium">Athlete</th>
                  <th className="text-right py-2 px-2 font-medium">2K Time</th>
                  <th className="text-right py-2 px-2 font-medium">2K Watts</th>
                  <th className="text-right py-2 px-2 font-medium">W/kg</th>
                  <th className="text-right py-2 px-2 font-medium">6K</th>
                  <th className="text-right py-2 px-2 font-medium">60min</th>
                  <th className="text-right py-2 pl-2 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody>
                {allAthletes.map(athlete => {
                  const twok = latestByUserAndType[athlete.id]?.["2k"];
                  const sixk = latestByUserAndType[athlete.id]?.["6k"];
                  const sixtymin = latestByUserAndType[athlete.id]?.["60min"];
                  const dropped = isDropFlagged(athlete.id, "2k");
                  return (
                    <tr
                      key={athlete.id}
                      className={`border-b hover:bg-muted/50 cursor-pointer transition-colors ${selectedAthleteId === athlete.id ? "bg-primary/5" : ""}`}
                      onClick={() => setSelectedAthleteId(selectedAthleteId === athlete.id ? null : athlete.id)}
                    >
                      <td className="py-2 pr-3 font-medium">{displayName(athlete)}</td>
                      <td className="py-2 px-2 text-right font-mono">{formatTime2k(twok?.time_seconds)}</td>
                      <td className="py-2 px-2 text-right">{twok?.watts ? `${parseFloat(String(twok.watts)).toFixed(0)}W` : "—"}</td>
                      <td className="py-2 px-2 text-right">{twok?.watts_per_kg ? parseFloat(String(twok.watts_per_kg)).toFixed(2) : "—"}</td>
                      <td className="py-2 px-2 text-right font-mono">{sixk ? formatTime2k(sixk.time_seconds) : "—"}</td>
                      <td className="py-2 px-2 text-right">{sixtymin ? `${sixtymin.total_meters}m` : "—"}</td>
                      <td className="py-2 pl-2 text-right">
                        {dropped && (
                          <Badge variant="destructive" className="text-xs gap-1">
                            <TrendingDown className="h-3 w-3" />Drop
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {allAthletes.length === 0 && (
                  <tr><td colSpan={7} className="py-4 text-center text-muted-foreground">No athletes in team yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selectedAthleteId && chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {displayName(allAthletes.find(a => a.id === selectedAthleteId))} — Watts Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="watts" stroke="hsl(var(--primary))" dot strokeWidth={2} name="Watts" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ErgScoreManager;
