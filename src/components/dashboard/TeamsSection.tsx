import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Users, UserPlus, Trash2, Trophy, Clock } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface TeamsSectionProps {
  profile: any;
  isCoach: boolean;
}

const TeamsSection = ({ profile, isCoach }: TeamsSectionProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [teamName, setTeamName] = useState("");
  const [teamDescription, setTeamDescription] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  // Fetch teams (coach's teams or teams user is member of)
  const { data: teams } = useQuery({
    queryKey: ["teams", profile?.id],
    queryFn: async (): Promise<{ coached: any[]; member: any[] }> => {
      if (!profile?.id) return { coached: [], member: [] };
      
      // Get teams where user is coach
      const { data: coachedTeams } = await supabase
        .from("teams")
        .select(`
          *,
          team_members(
            id,
            user_id,
            profile:profiles(id, full_name, email, username)
          )
        `)
        .eq("coach_id", profile.id);

      // Get teams where user is member
      const { data: memberTeams } = await supabase
        .from("team_members")
        .select(`
          team:teams(
            *,
            coach:profiles!teams_coach_id_fkey(id, full_name, email),
            team_members(
              id,
              user_id,
              profile:profiles(id, full_name, email, username)
            )
          )
        `)
        .eq("user_id", profile.id);

      const memberTeamsData = memberTeams?.map((m: any) => m.team).filter(Boolean) || [];
      
      return {
        coached: coachedTeams || [],
        member: memberTeamsData,
      };
    },
    enabled: !!profile?.id,
  });

  // Fetch goals for team comparison (for coaches)
  const { data: teamGoals } = useQuery({
    queryKey: ["team-goals", teams?.coached],
    queryFn: async () => {
      if (!teams?.coached?.length) return {};
      
      const memberIds = teams.coached.flatMap(
        (team: any) => team.team_members?.map((m: any) => m.user_id) || []
      );
      
      if (!memberIds.length) return {};

      const { data } = await supabase
        .from("user_goals")
        .select("*")
        .in("user_id", memberIds);

      return data?.reduce((acc: any, goal: any) => {
        acc[goal.user_id] = goal;
        return acc;
      }, {}) || {};
    },
    enabled: isCoach && !!teams?.coached?.length,
  });

  const createTeam = useMutation({
    mutationFn: async () => {
      if (!teamName.trim()) throw new Error("Team name is required");
      
      const { error } = await supabase.from("teams").insert({
        name: teamName,
        description: teamDescription || null,
        coach_id: profile.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Team created!" });
      setTeamName("");
      setTeamDescription("");
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addMember = useMutation({
    mutationFn: async ({ teamId, email }: { teamId: string; email: string }) => {
      // Find user by email or username
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("id")
        .or(`email.eq.${email},username.ilike.${email}`)
        .single();

      if (!userProfile) throw new Error("User not found");

      const { error } = await supabase.from("team_members").insert({
        team_id: teamId,
        user_id: userProfile.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Member added!" });
      setMemberEmail("");
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from("team_members").delete().eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Member removed" });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });

  const deleteTeam = useMutation({
    mutationFn: async (teamId: string) => {
      const { error } = await supabase.from("teams").delete().eq("id", teamId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Team deleted" });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });

  const formatTime = (interval: any) => {
    if (!interval) return "Not set";
    if (typeof interval === "string") return interval;
    return interval;
  };

  return (
    <div className="space-y-6">
      {isCoach && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Create Team
            </CardTitle>
            <CardDescription>Form a team to track your athletes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Team name"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
            <Input
              placeholder="Team description (optional)"
              value={teamDescription}
              onChange={(e) => setTeamDescription(e.target.value)}
            />
            <Button onClick={() => createTeam.mutate()} disabled={createTeam.isPending}>
              Create Team
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Coached Teams */}
      {isCoach && teams?.coached && teams.coached.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              My Teams
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible>
              {teams.coached.map((team: any) => (
                <AccordionItem key={team.id} value={team.id}>
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <span>{team.name}</span>
                      <Badge variant="outline">{team.team_members?.length || 0} members</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4">
                    {team.description && (
                      <p className="text-sm text-muted-foreground">{team.description}</p>
                    )}

                    {/* Add member form */}
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add member by email or username"
                        value={selectedTeamId === team.id ? memberEmail : ""}
                        onChange={(e) => {
                          setSelectedTeamId(team.id);
                          setMemberEmail(e.target.value);
                        }}
                        onFocus={() => setSelectedTeamId(team.id)}
                      />
                      <Button
                        size="sm"
                        onClick={() => addMember.mutate({ teamId: team.id, email: memberEmail })}
                        disabled={addMember.isPending}
                      >
                        <UserPlus className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Team members with times comparison */}
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">Team Members & Times</h4>
                      {team.team_members?.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No members yet</p>
                      ) : (
                        <div className="space-y-2">
                          {team.team_members?.map((member: any) => {
                            const goals = teamGoals?.[member.user_id];
                            return (
                              <div
                                key={member.id}
                                className="flex items-center justify-between p-3 border rounded-lg"
                              >
                                <div>
                                  <p className="font-medium">
                                    {member.profile?.full_name || member.profile?.username || "Unknown"}
                                  </p>
                                  <p className="text-xs text-muted-foreground">{member.profile?.email}</p>
                                  {goals && (
                                    <div className="flex gap-2 mt-1 text-xs">
                                      <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        2K: {formatTime(goals.current_2k_time)}
                                      </span>
                                      {goals.current_5k_time && (
                                        <span>5K: {formatTime(goals.current_5k_time)}</span>
                                      )}
                                      {goals.current_6k_time && (
                                        <span>6K: {formatTime(goals.current_6k_time)}</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => removeMember.mutate(member.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteTeam.mutate(team.id)}
                    >
                      Delete Team
                    </Button>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}

      {/* Teams user is member of */}
      {teams?.member && teams.member.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              My Teams (as Member)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {teams.member.map((team: any) => (
                <div key={team.id} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold">{team.name}</h3>
                      {team.description && (
                        <p className="text-sm text-muted-foreground">{team.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Coach: {team.coach?.full_name || team.coach?.email}
                      </p>
                    </div>
                    <Badge variant="outline">{team.team_members?.length || 0} members</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {(!teams?.coached?.length && !teams?.member?.length) && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {isCoach ? "Create your first team above!" : "You're not part of any teams yet."}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TeamsSection;