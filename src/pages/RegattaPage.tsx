import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Trophy, Calendar, MapPin, ExternalLink, Users, Clock } from "lucide-react";

interface RegattaResult {
  id: string;
  event_name: string | null;
  boat_class: string | null;
  placement: number | null;
  finish_time: string | null;
  club: string | null;
  crew: any;
}

export default function RegattaPage() {
  const { id } = useParams<{ id: string }>();

  const { data: regatta, isLoading: regattaLoading } = useQuery({
    queryKey: ["regatta-public", id],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await supabase.from("regattas").select("*").eq("id", id).maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: results = [], isLoading: resultsLoading } = useQuery<RegattaResult[]>({
    queryKey: ["regatta-results-public", id],
    queryFn: async () => {
      if (!id) return [];
      const { data } = await supabase
        .from("regatta_results")
        .select("*")
        .eq("regatta_id", id)
        .order("event_name")
        .order("placement");
      return (data || []) as RegattaResult[];
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
        <Link to="/">
          <Button>Back to Home</Button>
        </Link>
      </div>
    );
  }

  // Group results by event
  const grouped: Record<string, RegattaResult[]> = {};
  for (const r of results) {
    const key = r.event_name || "Unknown Event";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }

  const placementBadge = (p: number | null) => {
    if (!p) return null;
    if (p === 1) return <Badge className="text-xs">🥇 1st</Badge>;
    if (p === 2) return <Badge variant="secondary" className="text-xs">🥈 2nd</Badge>;
    if (p === 3) return <Badge variant="secondary" className="text-xs">🥉 3rd</Badge>;
    return <Badge variant="outline" className="text-xs">#{p}</Badge>;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold text-foreground">{(regatta as any).name}</h1>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                {(regatta as any).event_date && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    {new Date((regatta as any).event_date).toLocaleDateString("en-US", {
                      weekday: "long", month: "long", day: "numeric", year: "numeric",
                    })}
                    {(regatta as any).end_date && (regatta as any).end_date !== (regatta as any).event_date &&
                      ` – ${new Date((regatta as any).end_date).toLocaleDateString("en-US", { month: "long", day: "numeric" })}`}
                  </span>
                )}
                {((regatta as any).location || (regatta as any).state) && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {[(regatta as any).location, (regatta as any).state].filter(Boolean).join(", ")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2">
                {(regatta as any).event_type && (
                  <Badge variant="outline" className="capitalize">
                    {(regatta as any).event_type.replace("_", " ")}
                  </Badge>
                )}
                {(regatta as any).host_club && (
                  <span className="text-sm text-muted-foreground">{(regatta as any).host_club}</span>
                )}
              </div>
            </div>
            {(regatta as any).rc_url && (
              <a href={(regatta as any).rc_url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="gap-2">
                  <ExternalLink className="h-4 w-4" />
                  View on RegattaCentral
                </Button>
              </a>
            )}
          </div>
        </div>

        {/* Results */}
        {resultsLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin h-6 w-6" /></div>
        ) : results.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Trophy className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Results not yet available</p>
              <p className="text-sm mt-1">Check back after the event or view on RegattaCentral</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">{results.length} Results</h2>
            {Object.entries(grouped).map(([eventName, rows]) => (
              <Card key={eventName}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{eventName}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-0">
                    {rows.map((r) => (
                      <div key={r.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-mono text-xs w-8 shrink-0 text-muted-foreground">
                            {r.placement ? `#${r.placement}` : "—"}
                          </span>
                          <div className="min-w-0">
                            {r.club && <span className="font-medium block truncate">{r.club}</span>}
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
                          {placementBadge(r.placement)}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* CTA */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-6 text-center">
            <Trophy className="h-8 w-8 mx-auto mb-2 text-primary" />
            <h3 className="font-bold text-lg">Track your regatta results on CrewSync</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Claim your results, track your racing history, and share performance highlights.
            </p>
            <Link to="/auth">
              <Button>Get Started Free</Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
