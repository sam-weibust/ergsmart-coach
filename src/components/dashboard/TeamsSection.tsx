import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Users } from "lucide-react";
import { TeamBrandingProvider } from "@/context/TeamBrandingContext";
import AthleteTeamsView from "./team-optimization/AthleteTeamsView";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import crewsyncLogo from "@/assets/crewsync-logo-full.jpg";

interface TeamsSectionProps {
  profile: any;
  isCoach: boolean;
}

// ─── Join-team card (no team state) ──────────────────────────────────────────

const JoinTeamCard = ({ profile, onJoined }: { profile: any; onJoined: () => void }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const join = useMutation({
    mutationFn: async () => {
      const trimmed = code.trim();
      if (!trimmed) throw new Error("Enter a join code");
      const { data: team } = await supabase
        .from("teams")
        .select("id, name")
        .ilike("join_code", trimmed)
        .maybeSingle();
      if (!team) throw new Error("No team found with that code. Check the code and try again.");
      const { error: insertError } = await supabase.from("team_members").insert({
        team_id: team.id,
        user_id: profile.id,
      });
      if (insertError) {
        if (insertError.code === "23505") throw new Error("You are already on this team.");
        throw insertError;
      }
      return team.name;
    },
    onSuccess: (teamName) => {
      toast({ title: `Joined ${teamName}!` });
      setCode("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["teams", profile?.id] });
      queryClient.invalidateQueries({ queryKey: ["user-team-memberships"] });
      onJoined();
    },
    onError: (e: Error) => {
      setError(e.message);
    },
  });

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardContent className="pt-8 pb-8 flex flex-col items-center gap-5">
          <img src={crewsyncLogo} alt="CrewSync" className="h-16 w-16 rounded-2xl shadow-sm" />
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-foreground">Join a Team</h2>
            <p className="text-sm text-muted-foreground">Ask your coach for the team join code.</p>
          </div>
          <div className="w-full space-y-3">
            <Input
              placeholder="Enter join code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && join.mutate()}
              className="text-center text-lg font-mono tracking-widest uppercase"
              autoCapitalize="characters"
            />
            {error && (
              <p className="text-xs text-destructive text-center">{error}</p>
            )}
            <Button
              className="w-full"
              onClick={() => join.mutate()}
              disabled={join.isPending || !code.trim()}
            >
              <Users className="h-4 w-4 mr-2" />
              {join.isPending ? "Joining…" : "Join Team"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ─── Team selector (multi-team state) ────────────────────────────────────────

const TeamSelector = ({
  teams,
  selectedId,
  onSelect,
}: {
  teams: any[];
  selectedId: string;
  onSelect: (id: string) => void;
}) => (
  <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 mb-2">
    {teams.map((t) => (
      <button
        key={t.id}
        onClick={() => onSelect(t.id)}
        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
          t.id === selectedId
            ? "bg-primary text-primary-foreground border-primary"
            : "border-border text-muted-foreground hover:bg-muted"
        }`}
      >
        {t.name}
      </button>
    ))}
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

const TeamsSection = ({ profile, isCoach }: TeamsSectionProps) => {
  const queryClient = useQueryClient();
  const [activeTeamId, setActiveTeamId] = useState<string | null>(() => {
    try { return localStorage.getItem("lastActiveTeamId") || null; } catch { return null; }
  });
  const [joinedKey, setJoinedKey] = useState(0);

  const { data: memberTeams = [], isLoading } = useQuery({
    queryKey: ["teams-member-only", profile?.id, joinedKey],
    queryFn: async (): Promise<any[]> => {
      if (!profile?.id) return [];
      const { data } = await supabase
        .from("team_members")
        .select(`
          team:teams(
            id, name, join_code, logo_url, primary_color,
            coach:profiles!teams_coach_id_fkey(id, full_name, email),
            team_members(
              id,
              user_id,
              profile:profiles(id, full_name, email, username, role, is_coxswain, best_2k_seconds, best_2k_date, best_6k_seconds, best_6k_date, years_rowing, cox_years_coxing)
            )
          )
        `)
        .eq("user_id", profile.id);
      return (data || []).map((m: any) => m.team).filter(Boolean);
    },
    enabled: !!profile?.id,
  });

  // Sync active team id when list loads
  useEffect(() => {
    if (memberTeams.length === 0) return;
    const valid = memberTeams.find((t: any) => t.id === activeTeamId);
    if (!valid) {
      const id = memberTeams[0].id;
      setActiveTeamId(id);
      try { localStorage.setItem("lastActiveTeamId", id); } catch {}
    }
  }, [memberTeams]);

  const handleSelectTeam = (id: string) => {
    setActiveTeamId(id);
    try { localStorage.setItem("lastActiveTeamId", id); } catch {}
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // State 1: no teams
  if (memberTeams.length === 0) {
    return (
      <JoinTeamCard
        profile={profile}
        onJoined={() => setJoinedKey((k) => k + 1)}
      />
    );
  }

  const activeTeam = memberTeams.find((t: any) => t.id === activeTeamId) || memberTeams[0];
  const isCox =
    profile?.user_type === "coxswain" ||
    profile?.role === "coxswain" ||
    profile?.is_coxswain === true;

  return (
    <div className="space-y-2">
      {/* State 3: multiple teams — show selector */}
      {memberTeams.length > 1 && (
        <TeamSelector
          teams={memberTeams}
          selectedId={activeTeam.id}
          onSelect={handleSelectTeam}
        />
      )}

      {/* State 2 or 3: render team view */}
      <ErrorBoundary>
        <TeamBrandingProvider>
          <AthleteTeamsView
            teamId={activeTeam.id}
            teamName={activeTeam.name}
            teamMembers={activeTeam.team_members || []}
            isCox={isCox}
            profile={profile}
            safesportMode={true}
          />
        </TeamBrandingProvider>
      </ErrorBoundary>
    </div>
  );
};

export default TeamsSection;
