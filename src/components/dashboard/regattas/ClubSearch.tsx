import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, MapPin, Users, Trophy, Clock } from "lucide-react";

interface ClubSummary {
  club: string;
  regatta_count: number;
  best_placement: number | null;
  total_entries: number;
}

interface ClubResult {
  id: string;
  crew_name: string | null;
  club: string | null;
  athletes: string[];
  placement: number | null;
  finish_time: string | null;
  race: { event_name: string | null; boat_class: string | null } | null;
  regatta: { id: string; name: string; event_date: string | null; location: string | null } | null;
}

function placementBadge(p: number | null) {
  if (!p) return null;
  if (p === 1) return <Badge className="text-xs">🥇 1st</Badge>;
  if (p === 2) return <Badge variant="secondary" className="text-xs">🥈 2nd</Badge>;
  if (p === 3) return <Badge variant="secondary" className="text-xs">🥉 3rd</Badge>;
  return <Badge variant="outline" className="text-xs">#{p}</Badge>;
}

export default function ClubSearch() {
  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");
  const [selectedClub, setSelectedClub] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      if (inputValue.length >= 2) setQuery(inputValue);
      else if (inputValue.length === 0) { setQuery(""); setSelectedClub(null); }
    }, 300);
    return () => clearTimeout(t);
  }, [inputValue]);

  // Search clubs from entries
  const { data: clubSummaries = [], isLoading: summaryLoading } = useQuery<ClubSummary[]>({
    queryKey: ["club-summaries", query],
    queryFn: async () => {
      if (!query) return [];
      const { data } = await supabase
        .from("regatta_entries" as any)
        .select("club, placement, regatta_id")
        .ilike("club", `%${query}%`)
        .not("club", "is", null)
        .limit(200);

      if (!data) return [];

      // Aggregate by club name
      const map: Record<string, { club: string; regattaIds: Set<string>; placements: number[]; count: number }> = {};
      for (const row of data as any[]) {
        if (!row.club) continue;
        if (!map[row.club]) map[row.club] = { club: row.club, regattaIds: new Set(), placements: [], count: 0 };
        map[row.club].regattaIds.add(row.regatta_id);
        if (row.placement) map[row.club].placements.push(row.placement);
        map[row.club].count++;
      }

      return Object.values(map).map((v) => ({
        club: v.club,
        regatta_count: v.regattaIds.size,
        best_placement: v.placements.length ? Math.min(...v.placements) : null,
        total_entries: v.count,
      })).sort((a, b) => b.regatta_count - a.regatta_count).slice(0, 30);
    },
    enabled: query.length >= 2,
  });

  // Club race history
  const { data: clubHistory = [], isLoading: historyLoading } = useQuery<ClubResult[]>({
    queryKey: ["club-history", selectedClub],
    queryFn: async () => {
      if (!selectedClub) return [];
      const { data } = await supabase
        .from("regatta_entries" as any)
        .select(`
          id, crew_name, club, athletes, placement, finish_time,
          race:regatta_races(event_name, boat_class),
          regatta:regattas(id, name, event_date, location)
        `)
        .ilike("club", selectedClub)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data || []) as ClubResult[];
    },
    enabled: !!selectedClub,
  });

  const isLoading = summaryLoading || historyLoading;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search clubs by name..."
              value={inputValue}
              onChange={(e) => { setInputValue(e.target.value); setSelectedClub(null); }}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading && <div className="flex justify-center py-8"><Loader2 className="animate-spin h-6 w-6" /></div>}

      {/* Club list */}
      {!isLoading && !selectedClub && clubSummaries.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {clubSummaries.map((c) => (
            <Card
              key={c.club}
              className="hover:shadow-sm transition-shadow cursor-pointer"
              onClick={() => setSelectedClub(c.club)}
            >
              <CardContent className="pt-3 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{c.club}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Trophy className="h-2.5 w-2.5" />{c.regatta_count} regatta{c.regatta_count !== 1 ? "s" : ""}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-2.5 w-2.5" />{c.total_entries} entries
                      </span>
                    </div>
                    {c.best_placement && (
                      <div className="mt-1">{placementBadge(c.best_placement)}</div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !selectedClub && query.length >= 2 && clubSummaries.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No clubs found for "{query}"</p>
          <p className="text-sm mt-1">Try a different name or sync more regattas from CrewTimer</p>
        </div>
      )}

      {!isLoading && query.length < 2 && (
        <div className="text-center py-16 text-muted-foreground">
          <MapPin className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Search for a club</p>
          <p className="text-sm mt-1">Enter at least 2 characters to search</p>
        </div>
      )}

      {/* Club History */}
      {selectedClub && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{selectedClub}</h3>
              <p className="text-xs text-muted-foreground">{clubHistory.length} results</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setSelectedClub(null)}>← Back</Button>
          </div>

          {historyLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin h-6 w-6" /></div>
          ) : clubHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No results found for this club</p>
            </div>
          ) : (
            <div className="space-y-2">
              {clubHistory.map((r) => (
                <Card key={r.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{r.regatta?.name || "Unknown Regatta"}</span>
                          {placementBadge(r.placement)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {r.race?.event_name || "Event"}{r.race?.boat_class ? ` · ${r.race.boat_class}` : ""}
                        </p>
                        {r.regatta?.event_date && (
                          <p className="text-xs text-muted-foreground">
                            {new Date(r.regatta.event_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            {r.regatta.location ? ` · ${r.regatta.location}` : ""}
                          </p>
                        )}
                        {r.athletes?.length > 0 && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Users className="h-2.5 w-2.5" />
                            {r.athletes.join(", ")}
                          </p>
                        )}
                      </div>
                      {r.finish_time && (
                        <span className="font-mono text-xs flex items-center gap-1 text-muted-foreground shrink-0">
                          <Clock className="h-2.5 w-2.5" />{r.finish_time}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
