import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trophy, Clock, Users, RefreshCw, CheckCircle2, ExternalLink } from "lucide-react";

interface Regatta {
  id: string;
  name: string;
  event_date: string | null;
  end_date: string | null;
  location: string | null;
  state: string | null;
  rc_url: string | null;
  event_type: string | null;
}

interface RegattaResult {
  id: string;
  event_name: string | null;
  boat_class: string | null;
  placement: number | null;
  finish_time: string | null;
  club: string | null;
  crew: any;
}

interface ClaimedResult {
  id: string;
  event_name: string;
  placement: number | null;
  finish_time: string | null;
}

interface Props {
  regatta: Regatta;
  profile: any;
  onClose: () => void;
}

export default function RegattaResultsView({ regatta, profile, onClose }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [manualEvent, setManualEvent] = useState("");
  const [manualPlacement, setManualPlacement] = useState("");
  const [manualTime, setManualTime] = useState("");
  const [showManual, setShowManual] = useState(false);

  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const { data: results = [], isLoading: resultsLoading, refetch } = useQuery<RegattaResult[]>({
    queryKey: ["regatta-results", regatta.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("regatta_results")
        .select("*")
        .eq("regatta_id", regatta.id)
        .order("event_name")
        .order("placement");
      return (data || []) as RegattaResult[];
    },
  });

  const { data: claimed = [] } = useQuery<ClaimedResult[]>({
    queryKey: ["claimed-results", regatta.id, profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase
        .from("claimed_results")
        .select("*")
        .eq("regatta_id", regatta.id)
        .eq("user_id", profile.id);
      return (data || []) as ClaimedResult[];
    },
    enabled: !!profile?.id,
  });

  const fetchResults = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-regattacentral", {
        body: { action: "fetch_results", regatta_id: regatta.id, force_refresh: true },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (data) => {
      if (data?.cached && data?.last_updated) {
        setLastUpdated(data.last_updated);
        toast({ title: "Showing cached results", description: `Last updated ${new Date(data.last_updated).toLocaleDateString()}` });
      } else {
        toast({ title: "Results loaded" });
        setLastUpdated(null);
      }
      refetch();
    },
    onError: () => {
      toast({ title: "Could not load results", description: "Showing cached data if available.", variant: "destructive" });
      refetch();
    },
  });

  const claimResult = useMutation({
    mutationFn: async (result: RegattaResult) => {
      if (!profile?.id) throw new Error("Not logged in");
      const { error } = await supabase.from("claimed_results").upsert(
        {
          user_id: profile.id,
          regatta_id: regatta.id,
          result_id: result.id,
          event_name: result.event_name || "Unknown Event",
          placement: result.placement,
          finish_time: result.finish_time,
          crew: result.crew,
        } as any,
        { onConflict: "user_id,regatta_id,event_name" }
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast({ title: "Result claimed!", description: "Added to your regatta history." });
      queryClient.invalidateQueries({ queryKey: ["claimed-results", regatta.id] });
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
      toast({ title: "Result saved!", description: "Added to your regatta history." });
      queryClient.invalidateQueries({ queryKey: ["claimed-results", regatta.id] });
      queryClient.invalidateQueries({ queryKey: ["my-regattas"] });
      setManualEvent("");
      setManualPlacement("");
      setManualTime("");
      setShowManual(false);
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const claimedEventNames = new Set(claimed.map((c) => c.event_name));

  // Group results by event
  const grouped: Record<string, RegattaResult[]> = {};
  for (const r of results) {
    const key = r.event_name || "Unknown Event";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }

  const placementBadge = (p: number | null) => {
    if (!p) return null;
    if (p === 1) return <Badge>🥇 1st</Badge>;
    if (p === 2) return <Badge variant="secondary">🥈 2nd</Badge>;
    if (p === 3) return <Badge variant="secondary">🥉 3rd</Badge>;
    return <Badge variant="outline">#{p}</Badge>;
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-start justify-between gap-2 pr-6">
            <div>
              <div className="font-bold text-base leading-tight">{regatta.name}</div>
              {regatta.event_date && (
                <div className="text-xs text-muted-foreground font-normal mt-0.5">
                  {new Date(regatta.event_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  {regatta.location && ` · ${regatta.location}`}
                </div>
              )}
            </div>
            {regatta.rc_url && (
              <a href={regatta.rc_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <Button size="sm" variant="outline" className="gap-1 h-7 text-xs">
                  <ExternalLink className="h-3 w-3" />
                  RegattaCentral
                </Button>
              </a>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 space-y-4 pr-1">
          {/* Claimed results summary */}
          {claimed.length > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Your Results ({claimed.length})
              </p>
              {claimed.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-xs">
                  <span className="text-foreground">{c.event_name}</span>
                  <div className="flex items-center gap-2">
                    {c.finish_time && <span className="font-mono text-muted-foreground">{c.finish_time}</span>}
                    {placementBadge(c.placement)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Results from RC */}
          {resultsLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin h-5 w-5" /></div>
          ) : results.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground space-y-3">
              <Trophy className="h-10 w-10 mx-auto opacity-30" />
              <p className="font-medium text-sm">No results loaded yet</p>
              <Button size="sm" variant="outline" className="gap-2" onClick={() => fetchResults.mutate()} disabled={fetchResults.isPending}>
                {fetchResults.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Load from RegattaCentral
              </Button>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center">
                <p className="text-xs text-muted-foreground">
                  {results.length} results across {Object.keys(grouped).length} events
                  {lastUpdated && <span className="ml-2 text-amber-600">(cached {new Date(lastUpdated).toLocaleDateString()})</span>}
                </p>
                <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={() => fetchResults.mutate()} disabled={fetchResults.isPending}>
                  {fetchResults.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Refresh
                </Button>
              </div>

              {Object.entries(grouped).map(([eventName, rows]) => (
                <div key={eventName} className="space-y-1">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{eventName}</h3>
                  <div className="border rounded-lg overflow-hidden">
                    {rows.map((r) => {
                      const isClaimed = claimedEventNames.has(r.event_name || "");
                      return (
                        <div key={r.id} className="flex items-center justify-between px-3 py-2 text-sm border-b last:border-0 hover:bg-muted/30">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono text-xs w-7 shrink-0 text-muted-foreground">
                              {r.placement ? `#${r.placement}` : "—"}
                            </span>
                            <div className="min-w-0">
                              {r.club && <span className="font-medium truncate block">{r.club}</span>}
                              {Array.isArray(r.crew) && r.crew.length > 0 && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Users className="h-2.5 w-2.5" />
                                  {r.crew.map((c: any) => c.name || c).filter(Boolean).join(", ")}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {r.finish_time && (
                              <span className="font-mono text-xs flex items-center gap-1 text-muted-foreground">
                                <Clock className="h-2.5 w-2.5" />
                                {r.finish_time}
                              </span>
                            )}
                            {isClaimed ? (
                              <Badge variant="secondary" className="text-xs h-6">
                                <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                                Claimed
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-xs px-2"
                                disabled={claimResult.isPending && claimingId === r.id}
                                onClick={() => { setClaimingId(r.id); claimResult.mutate(r); }}
                              >
                                {claimResult.isPending && claimingId === r.id
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
                  <Input placeholder="Placement (e.g. 3)" value={manualPlacement} onChange={(e) => setManualPlacement(e.target.value)} className="text-sm flex-1" />
                  <Input placeholder="Finish time (e.g. 6:23.4)" value={manualTime} onChange={(e) => setManualTime(e.target.value)} className="text-sm flex-1" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => claimManual.mutate()} disabled={claimManual.isPending || !manualEvent.trim()}>
                    {claimManual.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
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
