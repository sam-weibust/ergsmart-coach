import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2, Calendar, MapPin, ExternalLink, Trophy, Clock, RefreshCw, ChevronRight } from "lucide-react";
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
  rc_url: string | null;
  cached_at: string | null;
}

export default function RegattaSearch({ profile }: { profile: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState("");
  const [state, setState] = useState("all");
  const [eventType, setEventType] = useState("all");
  const [selectedRegatta, setSelectedRegatta] = useState<Regatta | null>(null);
  const [inputValue, setInputValue] = useState("");

  const { data: regattas = [], isLoading } = useQuery<Regatta[]>({
    queryKey: ["regattas-search", query, state, eventType],
    queryFn: async () => {
      let q = supabase
        .from("regattas")
        .select("*")
        .order("event_date", { ascending: false })
        .limit(60);
      if (query) q = q.ilike("name", `%${query}%`);
      if (state && state !== "all") q = q.eq("state", state);
      if (eventType && eventType !== "all") q = q.eq("event_type", eventType);
      const { data } = await q;
      return (data || []) as Regatta[];
    },
  });

  const fetchFromRC = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-regattacentral", {
        body: { action: "auto_load", force_refresh: true },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (data) => {
      const count = data?.count ?? 0;
      toast({ title: "Data refreshed", description: count > 0 ? `Loaded ${count} regattas.` : "Already up to date." });
      queryClient.invalidateQueries({ queryKey: ["regattas-search"] });
    },
    onError: () => toast({ title: "Refresh failed", description: "Using cached data.", variant: "destructive" }),
  });

  const handleSearch = () => {
    setQuery(inputValue);
  };

  const formatDate = (d: string | null) => {
    if (!d) return null;
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="space-y-4">
      {/* Search controls */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Search regattas by name..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={isLoading}>
              <Search className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
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

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => fetchFromRC.mutate()}
              disabled={fetchFromRC.isPending}
            >
              {fetchFromRC.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh Data
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div>
      ) : regattas.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Trophy className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No regattas found</p>
          <p className="text-sm mt-1">
            {query || (state && state !== "all") || (eventType && eventType !== "all")
              ? "Try adjusting your filters"
              : "Data is loading in the background — check back shortly"}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {regattas.map((r) => (
            <Card key={r.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedRegatta(r)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-semibold leading-tight">{r.name}</CardTitle>
                  {r.event_type && (
                    <Badge variant="outline" className="text-xs shrink-0 capitalize">
                      {r.event_type.replace("_", " ")}
                    </Badge>
                  )}
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
                  {r.host_club && (
                    <span className="text-muted-foreground/70">{r.host_club}</span>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); setSelectedRegatta(r); }}>
                    <Trophy className="h-3 w-3" />
                    View Results
                  </Button>
                  {r.rc_url && (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild>
                      <a href={r.rc_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                </div>

                {r.cached_at && (
                  <p className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" />
                    Cached {new Date(r.cached_at).toLocaleDateString()}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
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
