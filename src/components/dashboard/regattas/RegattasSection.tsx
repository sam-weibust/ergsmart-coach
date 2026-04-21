import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Search, Calendar, MapPin, Users, Loader2 } from "lucide-react";
import RegattaSearch from "./RegattaSearch";
import MyRegattas from "./MyRegattas";
import UpcomingRegattas from "./UpcomingRegattas";
import { supabase } from "@/integrations/supabase/client";

interface RegattasSectionProps {
  profile: any;
  isCoach?: boolean;
  initialTab?: string;
}

export function RegattasSection({ profile, isCoach, initialTab }: RegattasSectionProps) {
  const [activeTab, setActiveTab] = useState(initialTab ?? "search");
  const queryClient = useQueryClient();

  // Auto-refresh CrewTimer cache on mount
  const { data: autoRefresh } = useQuery({
    queryKey: ["regattas-auto-refresh-ct"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("fetch-crewtimer", {
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
    }
  }, [autoRefresh, queryClient]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Trophy className="h-6 w-6 text-primary" />
          Regattas
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Find regattas, search athlete results, and track your racing history — powered by CrewTimer
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
          {isCoach && (
            <TabsTrigger value="team" className="gap-1.5 text-xs sm:text-sm">
              <Users className="h-3.5 w-3.5" />
              Team
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="search" className="mt-4">
          <RegattaSearch profile={profile} />
        </TabsContent>

        <TabsContent value="upcoming" className="mt-4">
          <UpcomingRegattas profile={profile} />
        </TabsContent>

        <TabsContent value="my" className="mt-4">
          <MyRegattas profile={profile} />
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

function TeamRegattas({ profile }: { profile: any }) {
  const { data: teamRegattaData, isLoading } = useQuery({
    queryKey: ["team-regattas-ct", profile?.id],
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
        <div key={item.regatta?.id} className="border rounded-lg p-4">
          <p className="font-semibold">{item.regatta?.name}</p>
          <p className="text-xs text-muted-foreground mb-3">
            {item.regatta?.event_date && new Date(item.regatta.event_date).toLocaleDateString()}
            {item.regatta?.location && ` · ${item.regatta.location}`}
          </p>
          {item.athletes.map((a, i) => (
            <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
              <span className="font-medium">{a.name}</span>
              <span className="text-muted-foreground text-xs">{a.event} {a.placement ? `· #${a.placement}` : ""} {a.finish_time ? `· ${a.finish_time}` : ""}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
