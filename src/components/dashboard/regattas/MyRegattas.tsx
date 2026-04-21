import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trophy, Trash2, TrendingUp, Clock } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface ClaimedResult {
  id: string;
  event_name: string;
  placement: number | null;
  finish_time: string | null;
  created_at: string;
  regatta: {
    id: string;
    name: string;
    event_date: string | null;
    location: string | null;
  } | null;
}

function parseTimeSec(t: string | null): number | null {
  if (!t) return null;
  const parts = t.split(":");
  if (parts.length === 2) {
    const m = parseFloat(parts[0]);
    const s = parseFloat(parts[1]);
    if (!isNaN(m) && !isNaN(s)) return m * 60 + s;
  }
  return null;
}

function placementBadge(p: number | null) {
  if (!p) return null;
  if (p === 1) return <Badge className="text-xs">🥇 1st</Badge>;
  if (p === 2) return <Badge variant="secondary" className="text-xs">🥈 2nd</Badge>;
  if (p === 3) return <Badge variant="secondary" className="text-xs">🥉 3rd</Badge>;
  return <Badge variant="outline" className="text-xs">#{p}</Badge>;
}

export default function MyRegattas({ profile }: { profile: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedEvent, setSelectedEvent] = useState<string>("all");

  const { data: claimed = [], isLoading } = useQuery<ClaimedResult[]>({
    queryKey: ["my-regattas", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("claimed_results")
        .select("*, regatta:regattas(id, name, event_date, location)")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ClaimedResult[];
    },
    enabled: !!profile?.id,
  });

  const unclaim = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("claimed_results").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Result removed" });
      queryClient.invalidateQueries({ queryKey: ["my-regattas"] });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div>;

  if (claimed.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Trophy className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No regatta results yet</p>
        <p className="text-sm mt-1">Search regattas and claim your results to build your racing history</p>
      </div>
    );
  }

  const eventNames = Array.from(new Set(claimed.map((c) => c.event_name))).sort();
  const filtered = selectedEvent === "all" ? claimed : claimed.filter((c) => c.event_name === selectedEvent);

  const bestByEvent: Record<string, { placement: number | null; time: string | null }> = {};
  for (const c of claimed) {
    const existing = bestByEvent[c.event_name];
    if (!existing || (c.placement != null && (existing.placement == null || c.placement < existing.placement))) {
      bestByEvent[c.event_name] = { placement: c.placement, time: c.finish_time };
    }
  }

  const chartData = filtered
    .filter((c) => c.regatta?.event_date && parseTimeSec(c.finish_time) !== null)
    .sort((a, b) => (a.regatta!.event_date! > b.regatta!.event_date! ? 1 : -1))
    .map((c) => ({
      date: new Date(c.regatta!.event_date!).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      timeSec: parseTimeSec(c.finish_time),
      label: c.regatta?.name,
    }));

  return (
    <div className="space-y-4">
      {/* Personal Bests */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            Personal Bests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(bestByEvent).map(([event, best]) => (
              <div key={event} className="flex items-center justify-between text-sm py-1.5 px-3 rounded-lg bg-muted/30">
                <span className="font-medium truncate mr-2">{event}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {best.time && <span className="font-mono text-xs text-muted-foreground">{best.time}</span>}
                  {placementBadge(best.placement)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Event filter */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={selectedEvent === "all" ? "default" : "outline"}
          className="h-7 text-xs"
          onClick={() => setSelectedEvent("all")}
        >
          All Events
        </Button>
        {eventNames.map((e) => (
          <Button
            key={e}
            size="sm"
            variant={selectedEvent === e ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setSelectedEvent(e)}
          >
            {e}
          </Button>
        ))}
      </div>

      {/* Trend chart */}
      {chartData.length >= 2 && (
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Finish Time Trend
              {selectedEvent !== "all" && <span className="text-muted-foreground font-normal">— {selectedEvent}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => {
                    const m = Math.floor(v / 60);
                    const s = Math.round(v % 60);
                    return `${m}:${String(s).padStart(2, "0")}`;
                  }}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  formatter={(v: any) => {
                    const m = Math.floor(v / 60);
                    const s = Math.round(v % 60);
                    return [`${m}:${String(s).padStart(2, "0")}`, "Finish Time"];
                  }}
                />
                <Line type="monotone" dataKey="timeSec" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Results list */}
      <div className="space-y-3">
        {filtered.map((c) => (
          <Card key={c.id}>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{c.regatta?.name || "Unknown Regatta"}</p>
                  <p className="text-xs text-muted-foreground">{c.event_name}</p>
                  {c.regatta?.event_date && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(c.regatta.event_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      {c.regatta.location && ` · ${c.regatta.location}`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.finish_time && (
                    <span className="font-mono text-xs flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-2.5 w-2.5" />{c.finish_time}
                    </span>
                  )}
                  {placementBadge(c.placement)}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => unclaim.mutate(c.id)}
                    disabled={unclaim.isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
