import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Medal, Loader2, Share2, TrendingUp, TrendingDown, Minus, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  teamId: string;
  teamName: string;
  teamMembers: any[];
  isCoach: boolean;
  profile: any;
}

const MEDAL_COLORS = ["text-yellow-500", "text-slate-400", "text-amber-600"];
const MEDAL_ICONS = ["🥇", "🥈", "🥉"];

function formatTime2k(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1);
  return `${m}:${s.padStart(4, "0")}`;
}

const TeamErgLeaderboard = ({ teamId, teamName, teamMembers, isCoach, profile }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [testType, setTestType] = useState("2k");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);

  const allAthletes = teamMembers.map((m: any) => m.profile || m).filter(Boolean);

  const { data: allScores = [], isLoading } = useQuery({
    queryKey: ["erg-scores-leaderboard", teamId],
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

  // Get best score per athlete for selected type
  const bestByAthlete: Record<string, any> = {};
  const previousByAthlete: Record<string, any> = {};

  for (const score of allScores.filter((s: any) => s.test_type === testType)) {
    if (!bestByAthlete[score.user_id]) {
      bestByAthlete[score.user_id] = score;
    } else if (!previousByAthlete[score.user_id]) {
      previousByAthlete[score.user_id] = score;
    }
  }

  // Build ranked list sorted by watts desc
  const ranked = allAthletes
    .filter(a => bestByAthlete[a.id])
    .map(a => ({
      athlete: a,
      score: bestByAthlete[a.id],
      prev: previousByAthlete[a.id] || null,
    }))
    .sort((a, b) => (Number(b.score.watts) || 0) - (Number(a.score.watts) || 0));

  const unranked = allAthletes.filter(a => !bestByAthlete[a.id]);

  function getTrend(current: any, prev: any): "up" | "down" | "flat" {
    if (!prev?.watts) return "flat";
    const diff = Number(current.watts) - Number(prev.watts);
    if (diff > 1) return "up";
    if (diff < -1) return "down";
    return "flat";
  }

  const createShare = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("leaderboard_shares")
        .insert({ team_id: teamId, created_by: profile.id })
        .select("token")
        .single();
      if (error) throw error;
      return data.token as string;
    },
    onSuccess: (token) => {
      setShareToken(token);
      setShareOpen(true);
      queryClient.invalidateQueries({ queryKey: ["leaderboard-shares", teamId] });
    },
    onError: (e: Error) => toast({ title: "Error creating share link", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin h-6 w-6" /></div>;

  const shareUrl = shareToken ? `${window.location.origin}/leaderboard/${shareToken}` : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Erg Leaderboard</h2>
          <p className="text-sm text-muted-foreground">Best scores per athlete ranked by watts</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={testType} onValueChange={setTestType}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="2k">2K</SelectItem>
              <SelectItem value="6k">6K</SelectItem>
              <SelectItem value="60min">60min</SelectItem>
            </SelectContent>
          </Select>
          {isCoach && (
            <Button size="sm" variant="outline" className="gap-2" onClick={() => createShare.mutate()} disabled={createShare.isPending}>
              {createShare.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
              Share
            </Button>
          )}
        </div>
      </div>

      {/* Podium top 3 */}
      {ranked.length >= 1 && (
        <div className="grid grid-cols-3 gap-3">
          {ranked.slice(0, 3).map((entry, i) => (
            <Card key={entry.athlete.id} className={i === 0 ? "border-yellow-300 ring-1 ring-yellow-300/50" : ""}>
              <CardContent className="p-4 text-center">
                <div className="text-3xl mb-1">{MEDAL_ICONS[i]}</div>
                <p className="text-sm font-bold truncate">{entry.athlete.full_name || entry.athlete.username || "—"}</p>
                <p className="text-xl font-bold text-primary mt-1">
                  {testType !== "60min"
                    ? formatTime2k(entry.score.time_seconds)
                    : `${entry.score.total_meters}m`}
                </p>
                {entry.score.watts && (
                  <p className="text-xs text-muted-foreground">{parseFloat(String(entry.score.watts)).toFixed(0)}W</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Full rankings table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Medal className="h-4 w-4" />{testType.toUpperCase()} Rankings</CardTitle>
          <CardDescription>Best score per athlete. Arrow shows trend vs previous score.</CardDescription>
        </CardHeader>
        <CardContent>
          {ranked.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">No {testType} scores logged yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 w-8 font-medium">#</th>
                    <th className="text-left py-2 pr-3 font-medium">Athlete</th>
                    <th className="text-right py-2 px-2 font-medium">
                      {testType === "60min" ? "Meters" : "Time"}
                    </th>
                    <th className="text-right py-2 px-2 font-medium">Watts</th>
                    <th className="text-right py-2 px-2 font-medium">W/kg</th>
                    <th className="text-center py-2 px-2 font-medium">Trend</th>
                    <th className="text-right py-2 pl-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((entry, i) => {
                    const trend = getTrend(entry.score, entry.prev);
                    return (
                      <tr key={entry.athlete.id} className="border-b hover:bg-muted/50">
                        <td className="py-2 font-bold text-muted-foreground">
                          {i < 3 ? <span className={MEDAL_COLORS[i]}>{i + 1}</span> : i + 1}
                        </td>
                        <td className="py-2 pr-3 font-medium">{entry.athlete.full_name || entry.athlete.username || "—"}</td>
                        <td className="py-2 px-2 text-right font-mono">
                          {testType === "60min"
                            ? (entry.score.total_meters ? `${entry.score.total_meters}m` : "—")
                            : formatTime2k(entry.score.time_seconds)}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {entry.score.watts ? `${parseFloat(String(entry.score.watts)).toFixed(0)}W` : "—"}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {entry.score.watts_per_kg ? parseFloat(String(entry.score.watts_per_kg)).toFixed(2) : "—"}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {trend === "up" && <TrendingUp className="h-4 w-4 text-green-500 inline" />}
                          {trend === "down" && <TrendingDown className="h-4 w-4 text-destructive inline" />}
                          {trend === "flat" && <Minus className="h-4 w-4 text-muted-foreground inline" />}
                        </td>
                        <td className="py-2 pl-2 text-right text-muted-foreground text-xs">{entry.score.recorded_at}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {unranked.length > 0 && (
            <div className="mt-4 pt-3 border-t">
              <p className="text-xs text-muted-foreground mb-2">No {testType} score logged: {unranked.map(a => a.full_name || a.username || "—").join(", ")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Share modal */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Share Leaderboard</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Share this link for read-only access to the leaderboard:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted rounded p-2 break-all">{shareUrl}</code>
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(shareUrl); toast({ title: "Link copied!" }); }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeamErgLeaderboard;
