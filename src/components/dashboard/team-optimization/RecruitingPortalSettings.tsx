import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Globe, Eye, Sparkles, ExternalLink } from "lucide-react";
import { displayName } from "./constants";

function BetaBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full font-semibold">
      <Sparkles className="h-2.5 w-2.5" />
      Free During Beta · Elite Team Fall 2026
    </span>
  );
}

interface Props {
  teamId: string;
  teamName: string;
  teamMembers: any[];
  isCoach: boolean;
}

export default function RecruitingPortalSettings({ teamId, teamName, teamMembers, isCoach }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: team } = useQuery({
    queryKey: ["team-branding", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("slug, portal_public")
        .eq("id", teamId)
        .maybeSingle();
      return data;
    },
  });

  const { data: viewCount = 0 } = useQuery({
    queryKey: ["recruit-portal-views", teamId],
    queryFn: async () => {
      const { count } = await supabase
        .from("recruit_portal_views" as any)
        .select("*", { count: "exact", head: true })
        .eq("team_id", teamId);
      return count || 0;
    },
  });

  const { data: athleteOptIns = [] } = useQuery({
    queryKey: ["athlete-portal-optins", teamId],
    queryFn: async () => {
      const memberIds = teamMembers.map((m: any) => m.user_id).filter(Boolean);
      if (!memberIds.length) return [];
      const { data } = await supabase
        .from("athlete_profiles")
        .select("user_id, show_on_team_portal, is_recruiting")
        .in("user_id", memberIds);
      return data || [];
    },
    enabled: teamMembers.length > 0,
  });

  const toggleOptIn = useMutation({
    mutationFn: async ({ userId, value }: { userId: string; value: boolean }) => {
      const { error } = await supabase
        .from("athlete_profiles")
        .upsert({ user_id: userId, show_on_team_portal: value }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["athlete-portal-optins", teamId] }),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const slug = team?.slug || teamId.slice(0, 8);
  const portalUrl = `https://crewsync.app/recruit/${slug}`;

  const athletes = teamMembers.filter((m: any) => m.profile?.role === "athlete" || !m.profile?.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-bold text-foreground">White-Label Recruiting Portal</h3>
            <p className="text-xs text-muted-foreground">Public page for college coaches to browse your athletes</p>
          </div>
        </div>
        <BetaBadge />
      </div>

      {/* Portal URL + stats */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Portal URL</p>
            <p className="text-sm font-mono mt-0.5">{portalUrl}</p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { navigator.clipboard.writeText(portalUrl); toast({ title: "Copied!" }); }}
            >
              Copy
            </Button>
            <a href={portalUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="flex items-center gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" />
                Preview
              </Button>
            </a>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Eye className="h-4 w-4" />
          <span><strong className="text-foreground">{viewCount}</strong> portal views total</span>
        </div>
      </div>

      {/* Athlete opt-in list */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">Athlete Portal Visibility</p>
        <p className="text-xs text-muted-foreground">
          Athletes must opt in to appear on the recruiting portal. Only athletes with recruiting profiles are shown.
        </p>

        {athletes.length === 0 && (
          <p className="text-sm text-muted-foreground">No athletes on roster.</p>
        )}

        {athletes.map((m: any) => {
          const name = displayName(m.profile);
          const optIn = athleteOptIns.find((o: any) => o.user_id === m.user_id);
          const isVisible = !!optIn?.show_on_team_portal;

          return (
            <div key={m.user_id} className="flex items-center justify-between border border-border rounded-lg px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">{name}</p>
                <p className="text-xs text-muted-foreground">
                  {optIn?.is_recruiting ? "Recruiting" : "Not recruiting"} · {isVisible ? "Visible on portal" : "Hidden"}
                </p>
              </div>
              <Switch
                checked={isVisible}
                disabled={!isCoach}
                onCheckedChange={(val) => toggleOptIn.mutate({ userId: m.user_id, value: val })}
              />
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground border-t border-border pt-3">
        Athletes can also opt in from their own Recruiting Profile settings.
        The portal URL is shareable — send it to college coaches at regattas.
      </p>
    </div>
  );
}
