import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Loader2, Calendar, MapPin, Trophy, RefreshCw, Users, Clock, ChevronRight, X,
} from "lucide-react";
import RegattaResultsView from "./RegattaResultsView";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA",
  "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK",
  "OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

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

interface AthleteResult {
  id: string;
  crew_name: string | null;
  club: string | null;
  athletes: string[];
  placement: number | null;
  finish_time: string | null;
  race: { event_name: string | null; boat_class: string | null; round: string | null } | null;
  regatta: { id: string; name: string; event_date: string | null; location: string | null } | null;
}

function formatDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function placementBadge(p: number | null) {
  if (!p) return null;
  if (p === 1) return <Badge className="text-xs">🥇 1st</Badge>;
  if (p === 2) return <Badge variant="secondary" className="text-xs">🥈 2nd</Badge>;
  if (p === 3) return <Badge variant="secondary" className="text-xs">🥉 3rd</Badge>;
  return <Badge variant="outline" className="text-xs">#{p}</Badge>;
}

export default function RegattaSearch({ profile }: { profile: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");
  const [state, setState] = useState("all");
  const [eventType, setEventType] = useState("all");
  const [selectedRegatta, setSelectedRegatta] = useState<Regatta | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setQuery(inputValue), 300);
    return () => clearTimeout(t);
  }, [inputValue]);

  // Regattas search
  const { data: regattas = [], isLoading: regattasLoading } = useQuery<Regatta[]>({
    queryKey: ["regattas-search-ct", query, state, eventType],
    queryFn: async () => {
      let q = supabase
        .from("regattas")
        .select("id, name, event_date, end_date, location, state, host_club, event_type, status, level")
        .order("event_date", { ascending: false })
        .limit(50);
      if (query) q = q.or(`name.ilike.%${query}%,location.ilike.%${query}%,host_club.ilike.%${query}%`);
      if (state !== "all") q = q.eq("state", state);
      if (eventType !== "all") q = q.eq("event_type", eventType);
      const { data } = await q;
      return (data || []) as Regatta[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Athlete name search (searches entries)
  const { data: athleteResults = [], isLoading: athleteLoading } = useQuery<AthleteResult[]>({
    queryKey: ["athlete-search-ct", query],
    queryFn: async () => {
      if (!query || query.length < 3) return [];
      const { data, error } = await supabase
        .from("regatta_entries" as any)
        .select(`
          id, crew_name, club, athletes, placement, finish_time,
          race:regatta_races(event_name, boat_class, round),
          regatta:regattas(id, name, event_date, location)
        `)
        .ilike("athletes::text", `%${query}%`)
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) return [];
      return (data || []) as AthleteResult[];
    },
    staleTime: 5 * 60 * 1000,
    enabled: query.length >= 3,
  });

  // Club search (searches entries)
  const { data: clubResults = [], isLoading: clubLoading } = useQuery<AthleteResult[]>({
    queryKey: ["club-search-ct", query],
    queryFn: async () => {
      if (!query || query.length < 2) return [];
      // Only show club results if not showing athlete results predominantly
      const { data, error } = await supabase
        .from("regatta_entries" as any)
        .select(`
          id, crew_name, club, athletes, placement, finish_time,
          race:regatta_races(event_name, boat_class, round),
          regatta:regattas(id, name, event_date, location)
        `)
        .ilike("club", `%${query}%`)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) return [];
      return (data || []) as AthleteResult[];
    },
    staleTime: 5 * 60 * 1000,
    enabled: query.length >= 2,
  });

  const syncFromCrewTimer = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-crewtimer", {
        body: { action: "sync" },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Synced from CrewTimer", description: `${data?.count ?? 0} regattas updated.` });
      queryClient.invalidateQueries({ queryKey: ["regattas-search-ct"] });
    },
    onError: (e: Error) => toast({ title: "Sync failed", description: e.message, variant: "destructive" }),
  });

  const isLoading = regattasLoading || athleteLoading || clubLoading;
  const hasQuery = query.length > 0;
  const showAthletes = athleteResults.length > 0;
  const showClubs = clubResults.length > 0 && athleteResults.length === 0;

  return (
    <div className="space-y-4">
      {/* Search Controls */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search regattas, athletes, clubs, locations..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="pl-9 pr-9 min-h-[44px]"
              />
              {inputValue && (
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground min-w-[44px] min-h-[44px] flex items-center justify-center"
                  onClick={() => { setInputValue(""); setQuery(""); }}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="shrink-0 min-h-[44px] px-4">
              Filters
            </Button>
            <Button
              variant="outline"
              className="gap-1.5 shrink-0 min-h-[44px] px-3"
              onClick={() => syncFromCrewTimer.mutate()}
              disabled={syncFromCrewTimer.isPending}
            >
              {syncFromCrewTimer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Sync</span>
            </Button>
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Select value={state} onValueChange={setState}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="State" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  {US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="sprint">Sprint</SelectItem>
                  <SelectItem value="head_race">Head Race</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin h-6 w-6" /></div>
      )}

      {/* Athlete Results Section */}
      {!isLoading && showAthletes && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Athlete: "{query}" — {athleteResults.length} race{athleteResults.length !== 1 ? "s" : ""}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mb-2">Complete racing history where this athlete appeared</p>
          <div className="space-y-2">
            {athleteResults.map((r) => (
              <Card key={r.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{r.regatta?.name || "Unknown Regatta"}</span>
                        {placementBadge(r.placement)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {r.race?.event_name || "Event"}{r.race?.boat_class ? ` · ${r.race.boat_class}` : ""}
                        {r.race?.round && r.race.round !== "other" ? ` · ${r.race.round}` : ""}
                      </p>
                      {r.regatta?.event_date && (
                        <p className="text-xs text-muted-foreground">
                          {formatDate(r.regatta.event_date)}{r.regatta.location ? ` · ${r.regatta.location}` : ""}
                        </p>
                      )}
                      {r.club && <p className="text-xs text-muted-foreground">Club: {r.club}</p>}
                      {r.athletes?.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Users className="h-2.5 w-2.5" />
                          {r.athletes.join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.finish_time && (
                        <span className="font-mono text-xs flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-2.5 w-2.5" />{r.finish_time}
                        </span>
                      )}
                      {r.regatta?.id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => {
                            const rg = regattas.find((x) => x.id === r.regatta?.id);
                            if (rg) setSelectedRegatta(rg);
                          }}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Club Results Section */}
      {!isLoading && showClubs && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Club: "{query}" — {clubResults.length} result{clubResults.length !== 1 ? "s" : ""}
            </h3>
          </div>
          <div className="space-y-2">
            {clubResults.map((r) => (
              <Card key={r.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{r.regatta?.name || "Unknown Regatta"}</span>
                        {placementBadge(r.placement)}
                      </div>
                      <p className="text-xs text-muted-foreground">{r.race?.event_name || "Event"}</p>
                      {r.regatta?.event_date && (
                        <p className="text-xs text-muted-foreground">
                          {formatDate(r.regatta.event_date)}{r.regatta.location ? ` · ${r.regatta.location}` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.finish_time && (
                        <span className="font-mono text-xs text-muted-foreground">{r.finish_time}</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Regattas Section */}
      {!isLoading && (
        <div className="space-y-2">
          {hasQuery && (
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Regattas{query ? ` matching "${query}"` : ""} — {regattas.length}
              </h3>
            </div>
          )}

          {regattas.length === 0 && !showAthletes && !showClubs ? (
            <div className="text-center py-16 text-muted-foreground">
              <Trophy className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">{hasQuery ? "No regattas found" : "No regattas loaded yet"}</p>
              <p className="text-sm mt-1 mb-4">
                {hasQuery ? "Try a different search or" : ""} Sync from CrewTimer to load data
              </p>
              <Button
                variant="default"
                size="sm"
                className="gap-1.5"
                onClick={() => syncFromCrewTimer.mutate()}
                disabled={syncFromCrewTimer.isPending}
              >
                {syncFromCrewTimer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Sync from CrewTimer
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {regattas.map((r) => (
                <Card
                  key={r.id}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setSelectedRegatta(r)}
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
                        {r.status && (
                          <Badge
                            variant={r.status === "completed" ? "secondary" : "default"}
                            className="text-xs"
                          >
                            {r.status}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {r.event_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(r.event_date)}
                          {r.end_date && r.end_date !== r.event_date && ` – ${formatDate(r.end_date)}`}
                        </span>
                      )}
                      {(r.location || r.state) && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {[r.location, r.state].filter(Boolean).join(", ")}
                        </span>
                      )}
                      {r.host_club && <span className="text-muted-foreground/70">{r.host_club}</span>}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full min-h-[44px] text-sm gap-1"
                      onClick={(e) => { e.stopPropagation(); setSelectedRegatta(r); }}
                    >
                      <Trophy className="h-3.5 w-3.5" />
                      View Results
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedRegatta && (
        <RegattaResultsView
          regatta={selectedRegatta}
          profile={profile}
          onClose={() => setSelectedRegatta(null)}
        />
      )}
    </div>
  );
}
