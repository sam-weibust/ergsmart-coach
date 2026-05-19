import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, Trophy, Waves, Calendar } from "lucide-react";
import crewsyncLogo from "@/assets/crewsync-logo-full.jpg";

function formatSplit(s: number | null): string {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function TeamPortalPage() {
  const { slug } = useParams<{ slug: string }>();

  const { data: team, isLoading, error } = useQuery({
    queryKey: ["team-portal", slug],
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select(`
          id, name, slug, logo_url, primary_color, portal_public, portal_description,
          coach:profiles!teams_coach_id_fkey(full_name, username),
          team_members(
            user_id,
            profile:profiles(id, full_name, username, best_2k_seconds, best_6k_seconds)
          )
        `)
        .eq("slug", slug!)
        .maybeSingle();
      return data;
    },
    enabled: !!slug,
  });

  // Season stats
  const memberIds = team?.team_members?.map((m: any) => m.user_id) ?? [];
  const { data: ergStats } = useQuery({
    queryKey: ["team-portal-erg", team?.id],
    queryFn: async () => {
      if (!memberIds.length) return { totalMeters: 0, avg2k: null };
      const { data } = await supabase
        .from("erg_workouts")
        .select("distance, user_id")
        .in("user_id", memberIds)
        .gte("workout_date", new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0]);

      const totalMeters = (data || []).reduce((s: number, w: any) => s + (w.distance || 0), 0);
      const athletes2k = team?.team_members
        ?.map((m: any) => m.profile?.best_2k_seconds)
        .filter((t: any): t is number => !!t);
      const avg2k = athletes2k?.length
        ? athletes2k.reduce((a: number, b: number) => a + b, 0) / athletes2k.length
        : null;
      return { totalMeters, avg2k };
    },
    enabled: !!team,
  });

  const color = team?.primary_color || "#0a1628";

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground text-sm">Loading…</p>
    </div>
  );

  if (!team || !team.portal_public) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
      <p className="text-foreground font-semibold">This team portal is private or doesn't exist.</p>
      <Link to="/" className="text-sm text-muted-foreground hover:underline">← Back to CrewSync</Link>
    </div>
  );

  const top5 = [...(team.team_members || [])]
    .filter((m: any) => m.profile?.best_2k_seconds)
    .sort((a: any, b: any) => a.profile.best_2k_seconds - b.profile.best_2k_seconds)
    .slice(0, 5);

  const coachName = (team.coach as any)?.full_name || (team.coach as any)?.username;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="text-white py-10 px-4" style={{ background: color }}>
        <div className="max-w-3xl mx-auto flex items-center gap-5">
          {team.logo_url ? (
            <img src={team.logo_url} alt={team.name} className="h-20 w-20 rounded-2xl object-cover bg-white shadow-lg" />
          ) : (
            <img src={crewsyncLogo} alt="CrewSync" className="h-20 w-20 rounded-2xl object-cover shadow-lg" />
          )}
          <div>
            <h1 className="text-3xl font-black">{team.name}</h1>
            {coachName && <p className="text-white/70 mt-1">Coach: {coachName}</p>}
            {team.portal_description && <p className="text-white/60 text-sm mt-1 max-w-md">{team.portal_description}</p>}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-border p-4 text-center">
            <Users className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
            <p className="text-2xl font-black text-foreground">{team.team_members?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Athletes</p>
          </div>
          <div className="rounded-xl border border-border p-4 text-center">
            <Trophy className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
            <p className="text-2xl font-black text-foreground">{ergStats?.avg2k ? formatSplit(ergStats.avg2k) : "—"}</p>
            <p className="text-xs text-muted-foreground mt-1">Avg 2K</p>
          </div>
          <div className="rounded-xl border border-border p-4 text-center">
            <Waves className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
            <p className="text-2xl font-black text-foreground">
              {ergStats?.totalMeters ? `${(ergStats.totalMeters / 1_000_000).toFixed(1)}M` : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Meters Logged</p>
          </div>
        </div>

        {/* Top 5 leaderboard */}
        {top5.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Trophy className="h-4 w-4" style={{ color }} />
              Top Athletes — 2K Leaderboard
            </h2>
            <div className="rounded-2xl border border-border overflow-hidden">
              {top5.map((m: any, i: number) => (
                <div
                  key={m.user_id}
                  className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <span className="text-sm font-black text-muted-foreground w-5">{i + 1}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{m.profile?.full_name || m.profile?.username}</p>
                  </div>
                  <span className="font-mono text-sm font-bold" style={{ color }}>
                    {formatSplit(m.profile.best_2k_seconds)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Join CTA */}
        <div className="rounded-2xl p-6 text-center text-white" style={{ background: color }}>
          <h2 className="text-xl font-bold mb-2">Want to join {team.name}?</h2>
          <p className="text-white/70 text-sm mb-4">Ask your coach for the team join code, then sign up on CrewSync.</p>
          <Link
            to="/auth"
            className="inline-block bg-white font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-white/90 transition-colors"
            style={{ color }}
          >
            Join CrewSync Free →
          </Link>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Powered by <a href="https://crewsync.app" className="hover:underline font-semibold">CrewSync</a>
        </p>
      </div>
    </div>
  );
}
