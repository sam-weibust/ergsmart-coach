import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Search, Calendar, MapPin, Users } from "lucide-react";
import RegattaSearch from "./RegattaSearch";
import MyRegattas from "./MyRegattas";
import UpcomingRegattas from "./UpcomingRegattas";
import ClubSearch from "./ClubSearch";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, ChevronRight } from "lucide-react";

interface RegattasSectionProps {
  profile: any;
  isCoach?: boolean;
  initialTab?: string;
}

export function RegattasSection({ profile, isCoach, initialTab }: RegattasSectionProps) {
  const [activeTab, setActiveTab] = useState(initialTab ?? "search");
  const queryClient = useQueryClient();

  // Auto-refresh cache on mount
  const { data: autoRefresh } = useQuery({
    queryKey: ["regattas-auto-refresh"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("fetch-regattacentral", {
        body: { action: "auto_load" },
      });
      return data ?? null;
    },
    staleTime: 60 * 60 * 1000,
    retry: false,
    gcTime: 0,
  });

  useEffect(() => {
    if (autoRefresh?.refreshed) {
      queryClient.invalidateQueries({ queryKey: ["regattas-search"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-regattas"] });
      queryClient.invalidateQueries({ queryKey: ["recent-results"] });
    }
  }, [autoRefresh, queryClient]);

  // Load most recent completed event's results
  const { data: recentData } = useQuery({
    queryKey: ["recent-results"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("fetch-regattacentral", {
        body: { action: "recent_results" },
      });
      return data ?? null;
    },
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Trophy className="h-6 w-6 text-primary" />
          Regattas
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Find regattas, view results, and track your racing history
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full overflow-x-auto flex-shrink-0 justify-start gap-1 h-auto flex-wrap">
          <TabsTrigger value="search" className="gap-1.5 text-xs sm:text-sm">
            <Search className="h-3.5 w-3.5" />
            Search
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="gap-1.5 text-xs sm:text-sm">
            <Calendar className="h-3.5 w-3.5" />
            Upcoming
          </TabsTrigger>
          <TabsTrigger value="my" className="gap-1.5 text-xs sm:text-sm">
            <Trophy className="h-3.5 w-3.5" />
            My Regattas
          </TabsTrigger>
          <TabsTrigger value="clubs" className="gap-1.5 text-xs sm:text-sm">
            <MapPin className="h-3.5 w-3.5" />
            Clubs
          </TabsTrigger>
          {isCoach && (
            <TabsTrigger value="team" className="gap-1.5 text-xs sm:text-sm">
              <Users className="h-3.5 w-3.5" />
              Team
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="search" className="mt-4 space-y-4">
          {recentData?.regatta && recentData.results?.length > 0 && (
            <RecentResultsBanner regatta={recentData.regatta} results={recentData.results} />
          )}
          <RegattaSearch profile={profile} />
        </TabsContent>

        <TabsContent value="upcoming" className="mt-4">
          <UpcomingRegattas profile={profile} />
        </TabsContent>

        <TabsContent value="my" className="mt-4">
          <MyRegattas profile={profile} />
        </TabsContent>

        <TabsContent value="clubs" className="mt-4">
          <ClubSearch />
        </TabsContent>

        {isCoach && (
          <TabsContent value="team" className="mt-4">
            <TeamRegattas profile={profile} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// ── Recent Results Banner ────────────────────────────────────────────────────
function RecentResultsBanner({ regatta, results }: { regatta: any; results: any[] }) {
  const [expanded, setExpanded] = useState(false);

  const grouped: Record<string, any[]> = {};
  for (const r of results) {
    const key = r.event_name || "Unknown Event";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }
  const eventNames = Object.keys(grouped);
  const shownEvents = expanded ? eventNames : eventNames.slice(0, 3);

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              Latest Results
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {regatta.name}
              {regatta.event_date && ` · ${new Date(regatta.event_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`}
              {regatta.location && ` · ${regatta.location}`}
            </p>
          </div>
          <Badge variant="secondary" className="text-xs shrink-0">{results.length} results</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {shownEvents.map((eventName) => (
          <div key={eventName}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{eventName}</p>
            <div className="space-y-0.5">
              {grouped[eventName].slice(0, 5).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono w-6 shrink-0 text-muted-foreground">#{r.placement}</span>
                    <span className="font-medium truncate">{r.club || "—"}</span>
                  </div>
                  {r.finish_time && (
                    <span className="font-mono text-muted-foreground flex items-center gap-1 shrink-0">
                      <Clock className="h-2.5 w-2.5" />
                      {r.finish_time}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {eventNames.length > 3 && (
          <Button variant="ghost" size="sm" className="w-full h-7 text-xs gap-1" onClick={() => setExpanded(!expanded)}>
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
            {expanded ? "Show less" : `Show ${eventNames.length - 3} more events`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ── Team Regattas (coaches only) ─────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

function TeamRegattas({ profile }: { profile: any }) {
  const { data: teamRegattaData, isLoading } = useQuery({
    queryKey: ["team-regattas", profile?.id],
    queryFn: async () => {
      const { data: teams } = await supabase
        .from("teams")
        .select("id, name")
        .eq("coach_id", profile.id);
      if (!teams?.length) return [];

      const teamMemberIds: string[] = [];
      for (const team of teams) {
        const { data: members } = await supabase
          .from("team_members")
          .select("user_id")
          .eq("team_id", team.id);
        members?.forEach((m) => teamMemberIds.push(m.user_id));
      }

      if (!teamMemberIds.length) return [];

      const { data: claims } = await supabase
        .from("claimed_results")
        .select("*, regatta:regattas(*), profile:profiles(full_name,username)")
        .in("user_id", teamMemberIds)
        .order("created_at", { ascending: false })
        .limit(100);

      // Group by regatta
      const grouped: Record<string, { regatta: any; athletes: any[] }> = {};
      for (const claim of claims || []) {
        const rid = claim.regatta_id;
        if (!grouped[rid]) grouped[rid] = { regatta: claim.regatta, athletes: [] };
        grouped[rid].athletes.push({
          name: (claim.profile as any)?.full_name || (claim.profile as any)?.username || "Athlete",
          event: claim.event_name,
          placement: claim.placement,
          finish_time: claim.finish_time,
        });
      }

      return Object.values(grouped).sort((a, b) => {
        const da = a.regatta?.event_date ?? "";
        const db = b.regatta?.event_date ?? "";
        return db.localeCompare(da);
      });
    },
    enabled: !!profile?.id,
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div>;

  if (!teamRegattaData?.length) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No team regatta results yet</p>
        <p className="text-sm mt-1">Athletes need to claim results to appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {teamRegattaData.map((item) => (
        <Card key={item.regatta?.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{item.regatta?.name}</CardTitle>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mt-1">
              {item.regatta?.event_date && <span>{new Date(item.regatta.event_date).toLocaleDateString()}</span>}
              {item.regatta?.location && <span>• {item.regatta.location}</span>}
              <Badge variant="secondary">{item.athletes.length} athlete{item.athletes.length !== 1 ? "s" : ""}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {item.athletes.map((a, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                  <div>
                    <span className="font-medium">{a.name}</span>
                    <span className="text-muted-foreground ml-2">{a.event}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.placement && (
                      <Badge variant={a.placement === 1 ? "default" : "outline"}>
                        {a.placement === 1 ? "🥇" : a.placement === 2 ? "🥈" : a.placement === 3 ? "🥉" : `#${a.placement}`}
                      </Badge>
                    )}
                    {a.finish_time && <span className="font-mono text-xs">{a.finish_time}</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
