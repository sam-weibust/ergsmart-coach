import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2, MapPin, ExternalLink, RefreshCw, Users } from "lucide-react";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA",
  "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK",
  "OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

const CLUB_TYPE_LABELS: Record<string, string> = {
  high_school: "High School",
  collegiate: "Collegiate",
  club: "Club",
  masters: "Masters",
  other: "Other",
};

interface Club {
  id: string;
  name: string;
  location: string | null;
  state: string | null;
  club_type: string | null;
  rc_url: string | null;
}

export default function ClubSearch() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");
  const [state, setState] = useState("all");
  const [clubType, setClubType] = useState("all");

  const { data: clubs = [], isLoading } = useQuery<Club[]>({
    queryKey: ["clubs-search", query, state, clubType],
    queryFn: async () => {
      let q = supabase.from("clubs").select("*").order("name").limit(100);
      if (query) q = q.ilike("name", `%${query}%`);
      if (state && state !== "all") q = q.eq("state", state);
      if (clubType && clubType !== "all") q = q.eq("club_type", clubType);
      const { data } = await q;
      return (data || []) as Club[];
    },
  });

  const fetchFromRC = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-regattacentral", {
        body: {
          action: "search_clubs",
          query: inputValue || null,
          state: state !== "all" ? state : null,
          club_type: clubType !== "all" ? clubType : null,
          force_refresh: true,
        },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (data) => {
      const count = data?.clubs?.length ?? 0;
      toast({ title: "Clubs updated", description: `Found ${count} clubs.` });
      queryClient.invalidateQueries({ queryKey: ["clubs-search"] });
    },
    onError: (e: Error) => toast({ title: "Fetch failed", description: e.message, variant: "destructive" }),
  });

  const handleSearch = () => setQuery(inputValue);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Search clubs by name..."
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
            <Select value={clubType} onValueChange={setClubType}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="high_school">High School</SelectItem>
                <SelectItem value="collegiate">Collegiate</SelectItem>
                <SelectItem value="club">Club</SelectItem>
                <SelectItem value="masters">Masters</SelectItem>
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
              Search RegattaCentral
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div>
      ) : clubs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No clubs found</p>
          <p className="text-sm mt-1">Try searching RegattaCentral to load club data</p>
          <Button variant="outline" className="mt-4 gap-2" onClick={() => fetchFromRC.mutate()} disabled={fetchFromRC.isPending}>
            {fetchFromRC.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Load from RegattaCentral
          </Button>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {clubs.map((c) => (
            <Card key={c.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="pt-3 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{c.name}</p>
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                      {(c.location || c.state) && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-2.5 w-2.5" />
                          {[c.location, c.state].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </div>
                    {c.club_type && (
                      <Badge variant="outline" className="text-xs mt-1.5">
                        {CLUB_TYPE_LABELS[c.club_type] ?? c.club_type}
                      </Badge>
                    )}
                  </div>
                  {c.rc_url && (
                    <a href={c.rc_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
