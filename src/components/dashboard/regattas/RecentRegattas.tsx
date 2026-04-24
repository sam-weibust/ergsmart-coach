import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Calendar, MapPin, Trophy, Search, Users, Flag, Download } from "lucide-react";

interface Regatta {
  id: string;
  name: string;
  event_date: string | null;
  end_date: string | null;
  location: string | null;
  state: string | null;
  host_club: string | null;
  event_type: string | null;
  status: string | null;
  level: string | null;
}

function formatDate(d: string | null) {
  if (!d) return null;
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function RecentRegattas({ profile }: { profile: any }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState("");
  const [fetchingId, setFetchingId] = useState<string | null>(null);

  const fetchResults = useMutation({
    mutationFn: async (regattaId: string) => {
      setFetchingId(regattaId);
      const { data, error } = await supabase.functions.invoke("fetch-crewtimer", {
        body: { action: "fetch_results", regatta_id: regattaId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recent-race-counts"] });
      queryClient.invalidateQueries({ queryKey: ["recent-entry-counts"] });
      toast({ title: "Results loaded" });
    },
    onError: (e: Error) => toast({ title: "Failed to load results", description: e.message, variant: "destructive" }),
    onSettled: () => setFetchingId(null),
  });

  const today = new Date().toISOString().split("T")[0];
  const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString().split("T")[0];

  const { data: regattas = [], isLoading: regattasLoading } = useQuery<Regatta[]>({
    queryKey: ["recent-regattas"],
    queryFn: async () => {
      const { data } = await supabase
        .from("regattas")
        .select("id, name, event_date, end_date, location, state, host_club, event_type, status, level")
        .lte("event_date", today)
        .gte("event_date", sixMonthsAgo)
        .order("event_date", { ascending: false })
        .limit(80);
      return (data || []) as Regatta[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: raceCounts } = useQuery<Record<string, number>>({
    queryKey: ["recent-race-counts", regattas.map((r) => r.id).join(",")],
    queryFn: async () => {
      if (!regattas.length) return {};
      const ids = regattas.map((r) => r.id);
      const { data } = await supabase
        .from("regatta_races" as any)
        .select("regatta_id")
        .in("regatta_id", ids)
        .limit(5000);
      const counts: Record<string, number> = {};
      for (const row of (data || []) as any[]) {
        counts[row.regatta_id] = (counts[row.regatta_id] || 0) + 1;
      }
      return counts;
    },
    enabled: regattas.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const { data: entryCounts } = useQuery<Record<string, number>>({
    queryKey: ["recent-entry-counts", regattas.map((r) => r.id).join(",")],
    queryFn: async () => {
      if (!regattas.length) return {};
      const ids = regattas.map((r) => r.id);
      const { data } = await supabase
        .from("regatta_entries" as any)
        .select("regatta_id")
        .in("regatta_id", ids)
        .limit(20000);
      const counts: Record<string, number> = {};
      for (const row of (data || []) as any[]) {
        counts[row.regatta_id] = (counts[row.regatta_id] || 0) + 1;
      }
      return counts;
    },
    enabled: regattas.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const filteredRegattas = filter
    ? regattas.filter((r) => {
        const q = filter.toLowerCase();
        return (
          r.name?.toLowerCase().includes(q) ||
          r.location?.toLowerCase().includes(q) ||
          r.host_club?.toLowerCase().includes(q)
        );
      })
    : regattas;

  // Only show regattas with at least some data or fall through to all
  const withEntries = filteredRegattas.filter((r) => (entryCounts?.[r.id] ?? 0) > 0);
  const displayed = withEntries.length > 0 ? withEntries : filteredRegattas;

  if (regattasLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div>;
  }

  if (regattas.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Trophy className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No recent regattas</p>
        <p className="text-sm mt-1">Regatta results will appear here after syncing from CrewTimer</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Filter by name, location, or club..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="pl-9"
        />
      </div>

      {displayed.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Trophy className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No regattas match "{filter}"</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {displayed.map((r) => {
            const races = raceCounts?.[r.id] ?? 0;
            const entries = entryCounts?.[r.id] ?? 0;
            return (
              <Card
                key={r.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/regatta/${r.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-semibold leading-tight">{r.name}</CardTitle>
                    <div className="flex flex-col gap-1 items-end shrink-0">
                      {r.event_type && (
                        <Badge variant="outline" className="text-xs capitalize">
                          {r.event_type.replace("_", " ")}
                        </Badge>
                      )}
                      {entries > 0 && (
                        <Badge variant="secondary" className="text-xs">Results</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {r.event_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(r.event_date)}
                        {r.end_date && r.end_date !== r.event_date &&
                          ` – ${new Date(r.end_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                      </span>
                    )}
                    {(r.location || r.state) && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {[r.location, r.state].filter(Boolean).join(", ")}
                      </span>
                    )}
                  </div>
                  {r.host_club && (
                    <p className="text-xs text-muted-foreground truncate">{r.host_club}</p>
                  )}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {races > 0 && (
                        <span className="flex items-center gap-1">
                          <Flag className="h-3 w-3" />
                          {races} race{races !== 1 ? "s" : ""}
                        </span>
                      )}
                      {entries > 0 && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {entries} entries
                        </span>
                      )}
                      {races === 0 && entries === 0 && (
                        <span className="text-muted-foreground/60 italic text-xs">Results not yet imported</span>
                      )}
                    </div>
                    {races === 0 && entries === 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs gap-1 shrink-0"
                        onClick={(e) => { e.stopPropagation(); fetchResults.mutate(r.id); }}
                        disabled={fetchingId === r.id}
                      >
                        {fetchingId === r.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Download className="h-3 w-3" />}
                        {fetchingId === r.id ? "Loading…" : "Fetch"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
