import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Trophy, Calendar, MapPin, Users, Clock, Search } from "lucide-react";

interface Entry {
  id: string;
  crew_name: string | null;
  club: string | null;
  athletes: string[];
  lane: string | null;
  finish_time: string | null;
  finish_time_seconds: number | null;
  placement: number | null;
  delta: string | null;
  split: string | null;
}

interface Race {
  id: string;
  race_name: string | null;
  event_name: string | null;
  boat_class: string | null;
  gender: string | null;
  round: string | null;
  scheduled_time: string | null;
  entries: Entry[];
}

function placementBadge(p: number | null) {
  if (!p) return null;
  if (p === 1) return <Badge className="text-xs">🥇 1st</Badge>;
  if (p === 2) return <Badge variant="secondary" className="text-xs">🥈 2nd</Badge>;
  if (p === 3) return <Badge variant="secondary" className="text-xs">🥉 3rd</Badge>;
  return <Badge variant="outline" className="text-xs">#{p}</Badge>;
}

export default function RegattaPage() {
  const { id } = useParams<{ id: string }>();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterEvent, setFilterEvent] = useState("all");
  const [filterGender, setFilterGender] = useState("all");
  const [filterRound, setFilterRound] = useState("all");

  const { data: regatta, isLoading: regattaLoading } = useQuery({
    queryKey: ["regatta-public", id],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await supabase.from("regattas").select("*").eq("id", id).maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: races = [], isLoading: racesLoading } = useQuery<Race[]>({
    queryKey: ["regatta-races-public", id],
    queryFn: async () => {
      if (!id) return [];
      const { data } = await supabase
        .from("regatta_races" as any)
        .select("*, entries:regatta_entries(*)")
        .eq("regatta_id", id)
        .order("event_name");
      return (data || []) as Race[];
    },
    enabled: !!id,
  });

  if (regattaLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
      </div>
    );
  }

  if (!regatta) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Trophy className="h-16 w-16 text-muted-foreground opacity-30" />
        <h1 className="text-2xl font-bold">Regatta not found</h1>
        <Link to="/"><Button>Back to Home</Button></Link>
      </div>
    );
  }

  const r = regatta as any;

  const allEventNames = Array.from(new Set(races.map((x) => x.event_name || "Unknown"))).sort();
  const allGenders = Array.from(new Set(races.map((x) => x.gender).filter(Boolean))).sort() as string[];
  const allRounds = Array.from(new Set(races.map((x) => x.round).filter(Boolean))).sort() as string[];

  const filteredRaces = races.filter((race) => {
    if (filterEvent !== "all" && race.event_name !== filterEvent) return false;
    if (filterGender !== "all" && race.gender !== filterGender) return false;
    if (filterRound !== "all" && race.round !== filterRound) return false;
    return true;
  }).map((race) => ({
    ...race,
    entries: searchQuery
      ? (race.entries || []).filter((e) => {
          const q = searchQuery.toLowerCase();
          return (
            e.club?.toLowerCase().includes(q) ||
            e.crew_name?.toLowerCase().includes(q) ||
            e.athletes?.some((a) => a.toLowerCase().includes(q))
          );
        })
      : (race.entries || []),
  })).filter((race) => race.entries.length > 0 || !searchQuery);

  const totalEntries = races.reduce((sum, x) => sum + (x.entries?.length ?? 0), 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-[#0a1628] text-white px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/" className="font-bold text-lg">CrewSync</Link>
          <Link to="/auth">
            <Button size="sm" variant="outline" className="text-white border-white/30 hover:bg-white/10">
              Sign In
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Regatta header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">{r.name}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
            {r.event_date && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {new Date(r.event_date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                {r.end_date && r.end_date !== r.event_date &&
                  ` – ${new Date(r.end_date).toLocaleDateString("en-US", { month: "long", day: "numeric" })}`}
              </span>
            )}
            {(r.location || r.state) && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {[r.location, r.state].filter(Boolean).join(", ")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {r.event_type && (
              <Badge variant="outline" className="capitalize">{r.event_type.replace("_", " ")}</Badge>
            )}
            {r.level && <Badge variant="secondary">{r.level}</Badge>}
            {r.status && <Badge variant={r.status === "completed" ? "secondary" : "default"}>{r.status}</Badge>}
            {r.host_club && <span className="text-sm text-muted-foreground">{r.host_club}</span>}
          </div>
        </div>

        {racesLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin h-6 w-6" /></div>
        ) : races.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Trophy className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Results not yet available</p>
              <p className="text-sm mt-1">Check back after the event</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xl font-bold">
                {totalEntries} Entries · {races.length} Races
              </h2>
            </div>

            {/* Search and filters */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by athlete, club, or crew name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {allEventNames.length > 1 && (
                  <Select value={filterEvent} onValueChange={setFilterEvent}>
                    <SelectTrigger className="w-44 h-8 text-xs">
                      <SelectValue placeholder="All Events" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Events</SelectItem>
                      {allEventNames.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {allGenders.length > 1 && (
                  <Select value={filterGender} onValueChange={setFilterGender}>
                    <SelectTrigger className="w-28 h-8 text-xs">
                      <SelectValue placeholder="Gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {allGenders.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {allRounds.length > 1 && (
                  <Select value={filterRound} onValueChange={setFilterRound}>
                    <SelectTrigger className="w-28 h-8 text-xs">
                      <SelectValue placeholder="Round" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Rounds</SelectItem>
                      {allRounds.map((x) => <SelectItem key={x} value={x} className="capitalize">{x}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {filteredRaces.map((race) => (
              <Card key={race.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-base">{race.event_name || race.race_name || "Event"}</CardTitle>
                    {race.boat_class && <Badge variant="outline" className="text-xs">{race.boat_class}</Badge>}
                    {race.gender && <Badge variant="outline" className="text-xs capitalize">{race.gender}</Badge>}
                    {race.round && race.round !== "other" && (
                      <Badge variant="outline" className="text-xs capitalize">{race.round}</Badge>
                    )}
                    {race.scheduled_time && <span className="text-xs text-muted-foreground">{race.scheduled_time}</span>}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-0">
                    {race.entries.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between py-2.5 border-b last:border-0 text-sm gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-mono text-xs w-8 shrink-0 text-muted-foreground">
                            {entry.placement ? `#${entry.placement}` : entry.lane ? `L${entry.lane}` : "—"}
                          </span>
                          <div className="min-w-0">
                            <span className="font-medium block truncate">
                              {entry.crew_name || entry.club || "Unknown"}
                            </span>
                            {entry.club && entry.crew_name && entry.club !== entry.crew_name && (
                              <span className="text-xs text-muted-foreground">{entry.club}</span>
                            )}
                            {entry.athletes?.length > 0 && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Users className="h-2.5 w-2.5" />
                                {entry.athletes.join(", ")}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {entry.finish_time && (
                            <div className="text-right">
                              <span className="font-mono text-xs flex items-center gap-1 text-muted-foreground">
                                <Clock className="h-2.5 w-2.5" />{entry.finish_time}
                              </span>
                              {entry.delta && entry.delta !== "+0:00.0" && (
                                <span className="text-[10px] text-muted-foreground/70 block">{entry.delta}</span>
                              )}
                              {entry.split && (
                                <span className="text-[10px] text-muted-foreground/70 block">{entry.split}/500m</span>
                              )}
                            </div>
                          )}
                          {placementBadge(entry.placement)}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-6 text-center">
            <Trophy className="h-8 w-8 mx-auto mb-2 text-primary" />
            <h3 className="font-bold text-lg">Track your regatta results on CrewSync</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Claim your results, track your racing history, and share performance highlights.
            </p>
            <Link to="/auth"><Button>Get Started Free</Button></Link>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
