import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trophy, Clock, Users, RefreshCw, CheckCircle2, Search } from "lucide-react";

interface Regatta {
  id: string;
  name: string;
  event_date: string | null;
  end_date: string | null;
  location: string | null;
  state: string | null;
  event_type: string | null;
  status?: string | null;
  level?: string | null;
}

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

interface Props {
  regatta: Regatta;
  profile: any;
  onClose: () => void;
}

function placementBadge(p: number | null) {
  if (!p) return null;
  if (p === 1) return <Badge>🥇 1st</Badge>;
  if (p === 2) return <Badge variant="secondary">🥈 2nd</Badge>;
  if (p === 3) return <Badge variant="secondary">🥉 3rd</Badge>;
  return <Badge variant="outline">#{p}</Badge>;
}

export default function RegattaResultsView({ regatta, profile, onClose }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterEvent, setFilterEvent] = useState("all");
  const [filterGender, setFilterGender] = useState("all");
  const [filterRound, setFilterRound] = useState("all");
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [manualEvent, setManualEvent] = useState("");
  const [manualPlacement, setManualPlacement] = useState("");
  const [manualTime, setManualTime] = useState("");
  const [showManual, setShowManual] = useState(false);

  const { data: races = [], isLoading, refetch } = useQuery<Race[]>({
    queryKey: ["regatta-races-ct", regatta.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("regatta_races" as any)
        .select("*, entries:regatta_entries(*)")
        .eq("regatta_id", regatta.id)
        .order("event_name");
      return (data || []) as Race[];
    },
  });

  const { data: claimed = [] } = useQuery<{ id: string; event_name: string; entry_id: string | null }[]>({
    queryKey: ["claimed-results-ct", regatta.id, profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase
        .from("claimed_results")
        .select("id, event_name, entry_id")
        .eq("regatta_id", regatta.id)
        .eq("user_id", profile.id);
      return (data || []) as any[];
    },
    enabled: !!profile?.id,
  });

  const fetchResults = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-crewtimer", {
        body: { action: "fetch_results", regatta_id: regatta.id, force_refresh: true },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      toast({ title: "Results loaded" });
      refetch();
    },
    onError: () => toast({ title: "Could not load results", variant: "destructive" }),
  });

  const claimEntry = useMutation({
    mutationFn: async ({ entry, eventName }: { entry: Entry; eventName: string }) => {
      if (!profile?.id) throw new Error("Not logged in");
      const { error } = await supabase.from("claimed_results").upsert(
        {
          user_id: profile.id,
          regatta_id: regatta.id,
          entry_id: entry.id,
          event_name: eventName,
          placement: entry.placement,
          finish_time: entry.finish_time,
          crew: entry.athletes,
        } as any,
        { onConflict: "user_id,regatta_id,event_name" }
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast({ title: "Result claimed!", description: "Added to your regatta history." });
      queryClient.invalidateQueries({ queryKey: ["claimed-results-ct", regatta.id] });
      queryClient.invalidateQueries({ queryKey: ["my-regattas"] });
      setClaimingId(null);
    },
    onError: (e: Error) => toast({ title: "Claim failed", description: e.message, variant: "destructive" }),
  });

  const claimManual = useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error("Not logged in");
      if (!manualEvent.trim()) throw new Error("Event name required");
      const { error } = await supabase.from("claimed_results").upsert(
        {
          user_id: profile.id,
          regatta_id: regatta.id,
          event_name: manualEvent.trim(),
          placement: manualPlacement ? parseInt(manualPlacement) : null,
          finish_time: manualTime.trim() || null,
        } as any,
        { onConflict: "user_id,regatta_id,event_name" }
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast({ title: "Result saved!" });
      queryClient.invalidateQueries({ queryKey: ["claimed-results-ct", regatta.id] });
      queryClient.invalidateQueries({ queryKey: ["my-regattas"] });
      setManualEvent(""); setManualPlacement(""); setManualTime(""); setShowManual(false);
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const claimedEntryIds = new Set(claimed.map((c) => c.entry_id).filter(Boolean));
  const claimedEventNames = new Set(claimed.map((c) => c.event_name));

  // All unique event names, genders, rounds
  const allEventNames = Array.from(new Set(races.map((r) => r.event_name || "Unknown"))).sort();
  const allGenders = Array.from(new Set(races.map((r) => r.gender).filter(Boolean))).sort() as string[];
  const allRounds = Array.from(new Set(races.map((r) => r.round).filter(Boolean))).sort() as string[];

  // Filter races
  const filteredRaces = races.filter((race) => {
    if (filterEvent !== "all" && race.event_name !== filterEvent) return false;
    if (filterGender !== "all" && race.gender !== filterGender) return false;
    if (filterRound !== "all" && race.round !== filterRound) return false;
    return true;
  });

  // Further filter entries by search
  const filteredWithSearch = filteredRaces.map((race) => ({
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

  const totalEntries = races.reduce((sum, r) => sum + (r.entries?.length ?? 0), 0);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="pr-6">
            <div className="font-bold text-base leading-tight">{regatta.name}</div>
            {regatta.event_date && (
              <div className="text-xs text-muted-foreground font-normal mt-0.5">
                {new Date(regatta.event_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                {regatta.location && ` · ${regatta.location}`}
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 space-y-4 pr-1">
          {/* Claimed summary */}
          {claimed.length > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Your Results ({claimed.length})
              </p>
              {claimed.map((c) => (
                <div key={c.id} className="text-xs text-foreground">{c.event_name}</div>
              ))}
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin h-5 w-5" /></div>
          ) : races.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground space-y-3">
              <Trophy className="h-10 w-10 mx-auto opacity-30" />
              <p className="font-medium text-sm">No results loaded yet</p>
              <Button size="sm" variant="outline" className="gap-2" onClick={() => fetchResults.mutate()} disabled={fetchResults.isPending}>
                {fetchResults.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Load Results from CrewTimer
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {totalEntries} entries across {races.length} race{races.length !== 1 ? "s" : ""}
                </p>
                <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={() => fetchResults.mutate()} disabled={fetchResults.isPending}>
                  {fetchResults.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Refresh
                </Button>
              </div>

              {/* Search & filters within regatta */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search by athlete name or club..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {allEventNames.length > 1 && (
                    <Select value={filterEvent} onValueChange={setFilterEvent}>
                      <SelectTrigger className="w-40 h-7 text-xs">
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
                      <SelectTrigger className="w-28 h-7 text-xs">
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
                      <SelectTrigger className="w-28 h-7 text-xs">
                        <SelectValue placeholder="Round" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Rounds</SelectItem>
                        {allRounds.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {filteredWithSearch.map((race) => (
                <div key={race.id} className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {race.event_name || race.race_name || "Event"}
                    </h3>
                    {race.boat_class && <Badge variant="outline" className="text-[10px] h-4">{race.boat_class}</Badge>}
                    {race.gender && <Badge variant="outline" className="text-[10px] h-4 capitalize">{race.gender}</Badge>}
                    {race.round && race.round !== "other" && (
                      <Badge variant="outline" className="text-[10px] h-4 capitalize">{race.round}</Badge>
                    )}
                    {race.scheduled_time && <span className="text-[10px] text-muted-foreground">{race.scheduled_time}</span>}
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    {race.entries.map((entry) => {
                      const isClaimed = claimedEntryIds.has(entry.id) || claimedEventNames.has(race.event_name || "");
                      return (
                        <div key={entry.id} className="flex items-center justify-between px-3 py-2 text-sm border-b last:border-0 hover:bg-muted/30">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono text-xs w-7 shrink-0 text-muted-foreground">
                              {entry.placement ? `#${entry.placement}` : entry.lane ? `L${entry.lane}` : "—"}
                            </span>
                            <div className="min-w-0">
                              <span className="font-medium truncate block">
                                {entry.crew_name || entry.club || "Unknown"}
                              </span>
                              {entry.club && entry.crew_name && entry.club !== entry.crew_name && (
                                <span className="text-xs text-muted-foreground block">{entry.club}</span>
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
                                  <span className="text-[10px] text-muted-foreground/70">{entry.delta}</span>
                                )}
                                {entry.split && <span className="text-[10px] text-muted-foreground/70 block">{entry.split}/500m</span>}
                              </div>
                            )}
                            {isClaimed ? (
                              <Badge variant="secondary" className="text-xs h-6">
                                <CheckCircle2 className="h-2.5 w-2.5 mr-1" />Claimed
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-xs px-2"
                                disabled={claimEntry.isPending && claimingId === entry.id}
                                onClick={() => { setClaimingId(entry.id); claimEntry.mutate({ entry, eventName: race.event_name || race.race_name || "Unknown Event" }); }}
                              >
                                {claimEntry.isPending && claimingId === entry.id
                                  ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                  : "Claim"}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Manual entry */}
          <div className="border-t pt-4">
            {showManual ? (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground">Add your result manually</p>
                <Input placeholder="Event name (e.g. Men's 8+)" value={manualEvent} onChange={(e) => setManualEvent(e.target.value)} className="text-sm" />
                <div className="flex gap-2">
                  <Input placeholder="Placement" value={manualPlacement} onChange={(e) => setManualPlacement(e.target.value)} className="text-sm flex-1" />
                  <Input placeholder="Finish time (e.g. 6:23.4)" value={manualTime} onChange={(e) => setManualTime(e.target.value)} className="text-sm flex-1" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => claimManual.mutate()} disabled={claimManual.isPending || !manualEvent.trim()}>
                    {claimManual.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                    Save Result
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowManual(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => setShowManual(true)}>
                + Add my result manually
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
