import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Users, UserPlus, Trash2, ChevronDown, ChevronUp, BarChart3 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Leaderboard } from "./Leaderboard";
import { TeamGoals } from "./TeamGoals";
import { MessageBoard } from "./MessageBoard";
import { TeamWorkoutPlanSection } from "./TeamWorkoutPlanSection";
import { CoachComparison } from "./CoachComparison";
import { TeamAnalytics } from "./TeamAnalytics";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const { data: teams } = useQuery({
    queryKey: ["teams", profile?.id],
    queryFn: async (): Promise<{ coached: any[]; member: any[] }> => {
      if (!profile?.id) return { coached: [], member: [] };
      
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
    mutationFn: async ({ teamId, teamName, email }: { teamId: string; teamName: string; email: string }) => {
      const sanitizedSearch = email.trim();
      
      // Use the security definer function that bypasses RLS to find users
      const { data: searchResults, error: searchError } = await supabase
        .rpc("search_users_for_friend_request", {
          current_user_id: profile.id,
          search_term: sanitizedSearch,
        });

      if (searchError) throw searchError;

      const userProfile = searchResults?.[0];
      if (!userProfile) throw new Error("User not found");

      const { error } = await supabase.from("team_members").insert({
        team_id: teamId,
        user_id: userProfile.id,
      });

      if (error) {
        if (error.code === "23505") {
          throw new Error("User is already a member of this team");
        }
        throw error;
      }

      // Non-blocking: in-app notification
      supabase.from("notifications").insert({
        user_id: userProfile.id,
        type: "plan_shared",
        title: "Added to Team",
        body: `${profile.full_name || profile.username || profile.email} added you to the team "${teamName}".`,
      }).then(({ error: e }) => e && console.error("In-app notification error:", e));

      // Non-blocking: email notification
      supabase.functions.invoke("send-notification-email", {
        body: {
          type: "team_addition",
          recipientEmail: userProfile.email,
          recipientName: userProfile.username,
          senderName: profile.full_name || profile.username || profile.email,
          teamName: teamName,
        },
      }).catch(e => console.error("Email notification error:", e));
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

  const toggleTeam = (teamId: string) => {
    setExpandedTeam(expandedTeam === teamId ? null : teamId);
  };

  return (
    <div className="space-y-6">
      {/* Coach Comparison Dashboard */}
      {isCoach && (
        <CoachComparison />
      )}
      
      <div className="space-y-4">
        {isCoach && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-5 w-5" />
                Create Team
              </CardTitle>
              <CardDescription className="text-sm">Form a team to track your athletes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Team name"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
              />
              <Input
                placeholder="Description (optional)"
                value={teamDescription}
                onChange={(e) => setTeamDescription(e.target.value)}
              />
              <Button onClick={() => createTeam.mutate()} disabled={createTeam.isPending} className="w-full md:w-auto">
                Create Team
              </Button>
            </CardContent>
          </Card>
        )}

      {/* Coached Teams */}
      {isCoach && teams?.coached && teams.coached.length > 0 && (
        <div className="space-y-4">
          {teams.coached.map((team: any) => (
            <Card key={team.id}>
              <CardHeader className="pb-3">
                <div 
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleTeam(team.id)}
                >
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{team.name}</CardTitle>
                    <Badge variant="outline" className="text-xs">
                      {team.team_members?.length || 0} members
                    </Badge>
                  </div>
                  {expandedTeam === team.id ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>
              
              {expandedTeam === team.id && (
                <CardContent className="space-y-6">
                  {team.description && (
                    <p className="text-sm text-muted-foreground">{team.description}</p>
                  )}

                  {/* Add member */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add by email or username"
                      value={memberEmail}
                      onChange={(e) => setMemberEmail(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      size="icon"
                      onClick={() => addMember.mutate({ teamId: team.id, teamName: team.name, email: memberEmail })}
                      disabled={addMember.isPending}
                    >
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Members list */}
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Members</h4>
                    {team.team_members?.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No members yet</p>
                    ) : (
                      <div className="grid gap-2">
                        {team.team_members?.map((member: any) => (
                          <div
                            key={member.id}
                            className="flex items-center justify-between p-2 border rounded-lg text-sm"
                          >
                            <div>
                              <p className="font-medium">
                                {member.profile?.full_name || member.profile?.username || "Unknown"}
                              </p>
                              <p className="text-xs text-muted-foreground">{member.profile?.email}</p>
                            </div>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remove Member</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to remove {member.profile?.full_name || member.profile?.username || "this member"} from the team?
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => removeMember.mutate(member.id)}>
                                    Remove
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Team Management Tabs */}
                  <Tabs defaultValue="overview" className="space-y-4">
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="analytics">Analytics</TabsTrigger>
                      <TabsTrigger value="plans">Plans</TabsTrigger>
                      <TabsTrigger value="goals">Goals</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <Leaderboard teamId={team.id} teamName={team.name} />
                        <div className="space-y-4">
                          <Card className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">Team Stats</span>
                              <BarChart3 className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span>Total Members:</span>
                                <span className="font-medium">{team.team_members?.length || 0}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Active This Week:</span>
                                <span className="font-medium">-</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Avg 2K Time:</span>
                                <span className="font-medium">-</span>
                              </div>
                            </div>
                          </Card>
                        </div>
                      </div>
                      
                      <MessageBoard
                        teamId={team.id}
                        currentUserId={profile.id}
                        title={`${team.name} Chat`}
                      />
                    </TabsContent>

                    <TabsContent value="analytics">
                      <TeamAnalytics teamId={team.id} teamName={team.name} />
                    </TabsContent>

                    <TabsContent value="plans">
                      <TeamWorkoutPlanSection 
                        teamId={team.id} 
                        teamName={team.name} 
                        profile={profile} 
                      />
                    </TabsContent>

                    <TabsContent value="goals">
                      <TeamGoals teamId={team.id} isCoach={isCoach} currentUserId={profile.id} />
                    </TabsContent>
                  </Tabs>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="w-full md:w-auto"
                      >
                        Delete Team
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Team</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{team.name}"? This will remove all members and cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => deleteTeam.mutate(team.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Teams user is member of */}
      {teams?.member && teams.member.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">My Teams</h3>
          {teams.member.map((team: any) => (
            <Card key={team.id}>
              <CardHeader className="pb-3">
                <div 
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleTeam(team.id)}
                >
                  <div>
                    <CardTitle className="text-base">{team.name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Coach: {team.coach?.full_name || team.coach?.email}
                    </p>
                  </div>
                  {expandedTeam === team.id ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>
              
              {expandedTeam === team.id && (
                <CardContent className="space-y-4">
                  {team.description && (
                    <p className="text-sm text-muted-foreground">{team.description}</p>
                  )}
                  
                  <div className="grid gap-4 md:grid-cols-2">
                    <Leaderboard teamId={team.id} teamName={team.name} />
                    <TeamGoals teamId={team.id} isCoach={false} currentUserId={profile.id} />
                  </div>
                  
                  <MessageBoard
                    teamId={team.id}
                    currentUserId={profile.id}
                    title={`${team.name} Chat`}
                  />
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {(!teams?.coached?.length && !teams?.member?.length) && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {isCoach ? "Create your first team above!" : "You're not part of any teams yet."}
          </CardContent>
        </Card>
      )}
    </div>
    </div>
  );
};

export default TeamsSection;
