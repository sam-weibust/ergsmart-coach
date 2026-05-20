import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Users, UserPlus, Trash2, Copy, Check, ChevronDown, GraduationCap, Mail, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Shield } from "lucide-react";
import TeamOptimizationDashboard from "./team-optimization/TeamOptimizationDashboard";
import { TeamBrandingProvider } from "@/context/TeamBrandingContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

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
  const [copiedTeamId, setCopiedTeamId] = useState<string | null>(null);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(() => {
    try { return localStorage.getItem("lastActiveTeamId") || null; } catch { return null; }
  });
  const [membersOpen, setMembersOpen] = useState(false);
  const [safesportMode, setSafesportMode] = useState(true);
  const [adEmail, setAdEmail] = useState("");
  const [adSending, setAdSending] = useState(false);

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
            profile:profiles(id, full_name, email, username, role, is_coxswain, best_2k_seconds, best_2k_date, best_6k_seconds, best_6k_date, years_rowing, cox_years_coxing)
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
              profile:profiles(id, full_name, email, username, role, is_coxswain, best_2k_seconds, best_2k_date, best_6k_seconds, best_6k_date, years_rowing, cox_years_coxing)
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

  const { data: teamADs = [] } = useQuery({
    queryKey: ["team-athletic-directors", activeTeamId],
    queryFn: async () => {
      if (!activeTeamId) return [];
      const { data } = await supabase
        .from("team_athletic_directors" as any)
        .select("id, invited_email, status, joined_at, user_id")
        .eq("team_id", activeTeamId)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!activeTeamId && isCoach,
  });

  const removeAD = useMutation({
    mutationFn: async (adId: string) => {
      const { error } = await supabase.from("team_athletic_directors" as any).delete().eq("id", adId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Athletic Director removed" });
      queryClient.invalidateQueries({ queryKey: ["team-athletic-directors"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const allTeams = [
    ...(teams?.coached || []).map((t: any) => ({ ...t, _role: "coach" as const })),
    ...(teams?.member || []).map((t: any) => ({ ...t, _role: "member" as const })),
  ];

  useEffect(() => {
    if (allTeams.length === 0) return;
    const valid = allTeams.find((t) => t.id === activeTeamId);
    if (!valid) {
      setActiveTeamId(allTeams[0].id);
    }
  }, [teams]);

  const handleTeamChange = (teamId: string) => {
    setActiveTeamId(teamId);
    try { localStorage.setItem("lastActiveTeamId", teamId); } catch {}
  };

  const activeTeam = allTeams.find((t) => t.id === activeTeamId);

  return (
    <div className="space-y-6">
      {/* Coach Comparison Dashboard */}
      {isCoach && <CoachComparison />}

      {/* Header row: title + team selector dropdown */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Teams</h2>
        {allTeams.length > 0 && (
          <Select value={activeTeamId || ""} onValueChange={handleTeamChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select a team" />
            </SelectTrigger>
            <SelectContent>
              {allTeams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-4">
        {/* Create Team form — coaches only */}
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

        {/* Active team content */}
        {activeTeam && activeTeam._role === "coach" && (
          <Card>
            <CardContent className="pt-6 space-y-6">
              {/* Invite code */}
              {activeTeam.join_code && (
                <div className="border-2 border-primary/40 bg-primary/5 rounded-xl p-4">
                  <p className="text-sm font-semibold text-foreground mb-2">Team Join Code</p>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-mono font-bold tracking-widest text-foreground">
                      {activeTeam.join_code}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(activeTeam.join_code);
                        setCopiedTeamId(activeTeam.id);
                        setTimeout(() => setCopiedTeamId(null), 2000);
                      }}
                    >
                      {copiedTeamId === activeTeam.id
                        ? <Check className="h-4 w-4 text-green-500" />
                        : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Share this code with athletes to join your team.
                  </p>
                </div>
              )}

              {activeTeam.description && (
                <p className="text-sm text-muted-foreground">{activeTeam.description}</p>
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
                  onClick={() => addMember.mutate({ teamId: activeTeam.id, teamName: activeTeam.name, email: memberEmail })}
                  disabled={addMember.isPending}
                >
                  <UserPlus className="h-4 w-4" />
                </Button>
              </div>

              {/* Members list */}
              <Collapsible open={membersOpen} onOpenChange={setMembersOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full flex items-center justify-between px-0 hover:bg-transparent font-semibold text-sm">
                    Members ({activeTeam.team_members?.length ?? 0})
                    <ChevronDown className={`h-4 w-4 transition-transform ${membersOpen ? "rotate-180" : ""}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 mt-2">
                  {activeTeam.team_members?.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No members yet</p>
                  ) : (
                    <div className="grid gap-2">
                      {activeTeam.team_members?.map((member: any) => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between p-2 border rounded-lg text-sm"
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="font-medium">
                                  {member.profile?.full_name || member.profile?.username || "Unknown"}
                                </p>
                                {(member.profile?.role === "coxswain" || member.profile?.is_coxswain) && (
                                  <Badge className="text-[10px] px-1 py-0 h-4 bg-amber-500 text-white">COX</Badge>
                                )}
                                {member.profile?.role === "coach" && (
                                  <Badge className="text-[10px] px-1 py-0 h-4 bg-blue-600 text-white">COACH</Badge>
                                )}
                                {member.profile?.role === "athlete" && (
                                  <Badge className="text-[10px] px-1 py-0 h-4 bg-gray-200 text-gray-700">ATHLETE</Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-3 mt-0.5">
                                <p className="text-xs text-muted-foreground">{member.profile?.email}</p>
                                {member.profile?.best_2k_seconds && (
                                  <span className="text-xs font-mono text-primary font-medium">
                                    2K: {Math.floor(member.profile.best_2k_seconds / 60)}:{String(Math.round(member.profile.best_2k_seconds % 60)).padStart(2, "0")}
                                    {member.profile.best_2k_date && <span className="text-muted-foreground font-normal ml-1">({member.profile.best_2k_date})</span>}
                                  </span>
                                )}
                                {member.profile?.best_6k_seconds && (
                                  <span className="text-xs font-mono text-blue-500 font-medium">
                                    6K: {Math.floor(member.profile.best_6k_seconds / 60)}:{String(Math.round(member.profile.best_6k_seconds % 60)).padStart(2, "0")}
                                    {member.profile.best_6k_date && <span className="text-muted-foreground font-normal ml-1">({member.profile.best_6k_date})</span>}
                                  </span>
                                )}
                                {member.profile?.years_rowing != null && member.profile.role === "athlete" && (
                                  <span className="text-xs text-muted-foreground">{member.profile.years_rowing} seasons rowing</span>
                                )}
                                {member.profile?.cox_years_coxing != null && (member.profile.role === "coxswain" || member.profile.is_coxswain) && (
                                  <span className="text-xs text-muted-foreground">{member.profile.cox_years_coxing} seasons coxing</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8">
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
                </CollapsibleContent>
              </Collapsible>

              {/* SafeSport Mode toggle */}
              {isCoach && (
                <div className="flex items-center justify-between border rounded-xl px-4 py-3 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <div>
                      <Label htmlFor="safesport-toggle" className="text-sm font-semibold text-blue-800 dark:text-blue-200 cursor-pointer">
                        SafeSport Mode
                      </Label>
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        {safesportMode
                          ? "Enabled — all coach-athlete messages are visible to all coaches."
                          : "Disabled — private messaging allowed (not recommended for youth programs)."}
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="safesport-toggle"
                    checked={safesportMode}
                    onCheckedChange={setSafesportMode}
                  />
                </div>
              )}

              {/* Athletic Director section */}
              {isCoach && (
                <div className="border rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">Athletic Directors</span>
                    <Badge variant="outline" className="text-[10px]">Read-only oversight</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Invite an Athletic Director to have read-only program oversight — they can view roster, performance, attendance, and alerts, but not coaching decisions or private messages.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Email address"
                      type="email"
                      value={adEmail}
                      onChange={(e) => setAdEmail(e.target.value)}
                      className="flex-1 text-sm"
                    />
                    <Button
                      size="sm"
                      disabled={adSending || !adEmail.trim()}
                      onClick={async () => {
                        if (!adEmail.trim() || !activeTeam) return;
                        setAdSending(true);
                        try {
                          const { data: { session } } = await supabase.auth.getSession();
                          const res = await supabase.functions.invoke("invite-ad", {
                            body: { team_id: activeTeam.id, email: adEmail.trim() },
                          });
                          if (res.error) throw new Error(res.error.message);
                          toast({ title: "Invitation sent!", description: `Invite sent to ${adEmail.trim()}` });
                          setAdEmail("");
                          queryClient.invalidateQueries({ queryKey: ["team-athletic-directors"] });
                        } catch (e: any) {
                          toast({ title: "Error", description: e.message, variant: "destructive" });
                        } finally {
                          setAdSending(false);
                        }
                      }}
                    >
                      <Mail className="h-3.5 w-3.5 mr-1" />
                      Invite
                    </Button>
                  </div>
                  {(teamADs as any[]).length > 0 && (
                    <div className="space-y-1.5">
                      {(teamADs as any[]).map((ad: any) => (
                        <div key={ad.id} className="flex items-center justify-between text-xs bg-muted/40 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <GraduationCap className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">{ad.invited_email}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge
                              variant={ad.status === "accepted" ? "default" : "secondary"}
                              className="text-[10px] px-1.5 py-0"
                            >
                              {ad.status}
                            </Badge>
                            <button
                              onClick={() => removeAD.mutate(ad.id)}
                              className="text-destructive hover:text-destructive/80 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Team Optimization Dashboard */}
              <ErrorBoundary>
                <TeamBrandingProvider teamId={activeTeam.id}>
                  <TeamOptimizationDashboard
                    teamId={activeTeam.id}
                    teamName={activeTeam.name}
                    teamMembers={activeTeam.team_members || []}
                    isCoach={isCoach}
                    profile={profile}
                    safesportMode={safesportMode}
                  />
                </TeamBrandingProvider>
              </ErrorBoundary>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="w-full md:w-auto">
                    Delete Team
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Team</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete "{activeTeam.name}"? This will remove all members and cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => deleteTeam.mutate(activeTeam.id)}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        )}

        {activeTeam && activeTeam._role === "member" && (() => {
          const isCox = profile?.user_type === "coxswain" || profile?.is_coxswain === true;
          return (
            <ErrorBoundary>
              <TeamBrandingProvider teamId={activeTeam.id}>
                <TeamOptimizationDashboard
                  teamId={activeTeam.id}
                  teamName={activeTeam.name}
                  teamMembers={activeTeam.team_members || []}
                  isCoach={false}
                  isCox={isCox}
                  profile={profile}
                  safesportMode={true}
                />
              </TeamBrandingProvider>
            </ErrorBoundary>
          );
        })()}

        {allTeams.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {isCoach
                ? "Create your first team above!"
                : "Join a team to see today's workout and lineup. Ask your coach for the team join code."}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default TeamsSection;
