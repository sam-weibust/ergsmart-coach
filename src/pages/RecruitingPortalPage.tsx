import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search, ExternalLink } from "lucide-react";
import crewsyncLogo from "@/assets/crewsync-logo-full.jpg";

function formatSplit(s: number | null): string {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function RecruitingPortalPage() {
  const { slug } = useParams<{ slug: string }>();
  const [search, setSearch] = useState("");
  const [gradFilter, setGradFilter] = useState("");

  const { data: team, isLoading } = useQuery({
    queryKey: ["recruit-portal", slug],
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select(`
          id, name, slug, logo_url, primary_color, portal_public, portal_description,
          coach:profiles!teams_coach_id_fkey(full_name, username)
        `)
        .eq("slug", slug!)
        .maybeSingle();
      return data;
    },
    enabled: !!slug,
  });

  // Log view
  useEffect(() => {
    if (team?.id) {
      supabase.from("recruit_portal_views" as any).insert({ team_id: team.id }).then(() => {});
    }
  }, [team?.id]);

  // Get all opted-in athletes for this team
  const { data: athletes = [] } = useQuery({
    queryKey: ["recruit-portal-athletes", team?.id],
    queryFn: async () => {
      // Get team members
      const { data: members } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", team!.id);

      const memberIds = (members || []).map((m: any) => m.user_id);
      if (!memberIds.length) return [];

      // Get opted-in athlete profiles
      const { data: apData } = await supabase
        .from("athlete_profiles")
        .select("user_id, is_recruiting, show_on_team_portal")
        .in("user_id", memberIds)
        .eq("show_on_team_portal", true)
        .eq("is_recruiting", true);

      if (!apData || !apData.length) return [];

      const optedInIds = apData.map((a: any) => a.user_id);

      // Get profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, username, height, weight, age, best_2k_seconds, best_6k_seconds")
        .in("id", optedInIds);

      // Get academics (grad year, GPA, etc.)
      const { data: academics } = await supabase
        .from("athlete_academics")
        .select("user_id, gpa, class_rank_numerator, class_rank_denominator")
        .in("user_id", optedInIds);

      return (profiles || []).map((p: any) => ({
        ...p,
        academics: academics?.find((a: any) => a.user_id === p.id),
      }));
    },
    enabled: !!team?.id,
  });

  const color = team?.primary_color || "#0a1628";

  const filtered = athletes.filter((a: any) => {
    const name = (a.full_name || a.username || "").toLowerCase();
    return name.includes(search.toLowerCase());
  });

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground text-sm">Loading…</p>
    </div>
  );

  if (!team || !team.portal_public) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <p className="font-semibold">This recruiting portal is private or doesn't exist.</p>
      <Link to="/" className="text-sm text-muted-foreground hover:underline">← Back to CrewSync</Link>
    </div>
  );

  const coachName = (team.coach as any)?.full_name || (team.coach as any)?.username;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="text-white py-10 px-4" style={{ background: color }}>
        <div className="max-w-5xl mx-auto flex items-center gap-5">
          {team.logo_url ? (
            <img src={team.logo_url} alt={team.name} className="h-16 w-16 rounded-xl object-cover bg-white shadow-lg" />
          ) : (
            <img src={crewsyncLogo} alt="CrewSync" className="h-16 w-16 rounded-xl object-cover shadow-lg" />
          )}
          <div className="flex-1">
            <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-1">Recruiting Portal</p>
            <h1 className="text-2xl font-black">{team.name}</h1>
            {coachName && <p className="text-white/70 text-sm mt-0.5">Head Coach: {coachName}</p>}
          </div>
          {coachName && (
            <a
              href={`mailto:${coachName}`}
              className="hidden sm:inline-block border border-white/40 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-white/10 transition-colors whitespace-nowrap"
            >
              Contact Coaching Staff
            </a>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Search */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search athletes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Athletes grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            {athletes.length === 0
              ? "No athletes have opted in to this recruiting portal yet."
              : "No athletes match your search."}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((a: any) => (
              <Link
                key={a.id}
                to={`/athlete/${a.username || a.id}`}
                className="rounded-2xl border border-border bg-card p-5 hover:shadow-md transition-shadow block group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-bold text-foreground group-hover:text-primary transition-colors">
                      {a.full_name || a.username}
                    </p>
                    {a.age && <p className="text-xs text-muted-foreground mt-0.5">Age {a.age}</p>}
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                </div>

                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-muted/50 rounded-lg py-2">
                    <p className="text-sm font-black" style={{ color }}>{formatSplit(a.best_2k_seconds)}</p>
                    <p className="text-[10px] text-muted-foreground">Best 2K</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg py-2">
                    <p className="text-sm font-black" style={{ color }}>{formatSplit(a.best_6k_seconds)}</p>
                    <p className="text-[10px] text-muted-foreground">Best 6K</p>
                  </div>
                </div>

                <div className="mt-2 flex gap-3 text-xs text-muted-foreground flex-wrap">
                  {a.height && <span>{Math.round(a.height / 2.54 / 12)}'{Math.round((a.height / 2.54) % 12)}"</span>}
                  {a.weight && <span>{Math.round(a.weight * 2.205)} lbs</span>}
                  {a.academics?.gpa && <span>GPA {a.academics.gpa.toFixed(2)}</span>}
                </div>
              </Link>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground pt-4">
          Powered by <a href="https://crewsync.app" className="font-semibold hover:underline">CrewSync</a> · Athletes appear by consent
        </p>
      </div>
    </div>
  );
}
