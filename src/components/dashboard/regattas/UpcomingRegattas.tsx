import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Calendar, MapPin, CheckCircle2, Plus, ExternalLink, Clock } from "lucide-react";

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
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function countdownLabel(days: number | null) {
  if (days === null) return null;
  if (days < 0) return "Past";
  if (days === 0) return "Today!";
  if (days === 1) return "Tomorrow";
  return `${days} days`;
}

export default function UpcomingRegattas({ profile }: { profile: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const today = new Date().toISOString().split("T")[0];
  const future = new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0];

  const { data: regattas = [], isLoading } = useQuery<Regatta[]>({
    queryKey: ["upcoming-regattas"],
    queryFn: async () => {
      const { data } = await supabase
        .from("regattas")
        .select("*")
        .gte("event_date", today)
        .lte("event_date", future)
        .order("event_date", { ascending: true })
        .limit(50);
      return (data || []) as Regatta[];
    },
  });

  const { data: attending = [] } = useQuery<{ regatta_id: string }[]>({
    queryKey: ["regatta-attendance", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase
        .from("regatta_attendees")
        .select("regatta_id")
        .eq("user_id", profile.id);
      return (data || []) as { regatta_id: string }[];
    },
    enabled: !!profile?.id,
  });

  const toggleAttend = useMutation({
    mutationFn: async ({ regattaId, isAttending }: { regattaId: string; isAttending: boolean }) => {
      if (!profile?.id) throw new Error("Not logged in");
      if (isAttending) {
        const { error } = await supabase
          .from("regatta_attendees")
          .delete()
          .eq("user_id", profile.id)
          .eq("regatta_id", regattaId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("regatta_attendees")
          .upsert({ user_id: profile.id, regatta_id: regattaId } as any, { onConflict: "user_id,regatta_id" });
        if (error) throw error;
      }
    },
    onSuccess: (_, { isAttending }) => {
      toast({ title: isAttending ? "Removed from schedule" : "Added to schedule" });
      queryClient.invalidateQueries({ queryKey: ["regatta-attendance"] });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const attendingSet = new Set(attending.map((a) => a.regatta_id));

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div>;

  if (regattas.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No upcoming regattas found</p>
        <p className="text-sm mt-1">Check back soon or search RegattaCentral to load data</p>
      </div>
    );
  }

  // Group by month
  const grouped: Record<string, Regatta[]> = {};
  for (const r of regattas) {
    const key = r.event_date
      ? new Date(r.event_date).toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : "Unknown Date";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }

  return (
    <div className="space-y-6">
      {/* My upcoming */}
      {attending.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            My Schedule ({attending.length})
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {regattas
              .filter((r) => attendingSet.has(r.id))
              .map((r) => {
                const days = daysUntil(r.event_date);
                return (
                  <Card key={r.id} className="border-primary/30 bg-primary/5">
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-sm">{r.name}</p>
                          {r.event_date && (
                            <p className="text-xs text-muted-foreground">
                              {new Date(r.event_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </p>
                          )}
                        </div>
                        {days !== null && days >= 0 && (
                          <Badge variant={days <= 7 ? "default" : "secondary"} className="shrink-0 flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            {countdownLabel(days)}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </div>
      )}

      {/* All upcoming by month */}
      {Object.entries(grouped).map(([month, monthRegattas]) => (
        <div key={month}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">{month}</h2>
          <div className="space-y-2">
            {monthRegattas.map((r) => {
              const isAttending = attendingSet.has(r.id);
              const days = daysUntil(r.event_date);
              return (
                <Card key={r.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2 flex-wrap">
                          <p className="font-semibold text-sm">{r.name}</p>
                          {r.event_type && (
                            <Badge variant="outline" className="text-xs capitalize shrink-0">
                              {r.event_type.replace("_", " ")}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                          {r.event_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-2.5 w-2.5" />
                              {new Date(r.event_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              {r.end_date && r.end_date !== r.event_date &&
                                ` – ${new Date(r.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                            </span>
                          )}
                          {(r.location || r.state) && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-2.5 w-2.5" />
                              {[r.location, r.state].filter(Boolean).join(", ")}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {days !== null && days >= 0 && days <= 30 && (
                          <Badge variant={days <= 7 ? "default" : "outline"} className="text-xs">
                            {countdownLabel(days)}
                          </Badge>
                        )}
                        {r.rc_url && (
                          <a href={r.rc_url} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </a>
                        )}
                        <Button
                          size="sm"
                          variant={isAttending ? "default" : "outline"}
                          className="h-7 text-xs gap-1"
                          onClick={() => toggleAttend.mutate({ regattaId: r.id, isAttending })}
                          disabled={toggleAttend.isPending}
                        >
                          {isAttending
                            ? <><CheckCircle2 className="h-3 w-3" /> Going</>
                            : <><Plus className="h-3 w-3" /> Attend</>}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
