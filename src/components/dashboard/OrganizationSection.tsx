import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Building2, Users, Trophy, MessageSquare, Plus, Send, BarChart3, ChevronDown, ChevronUp } from "lucide-react";
import { getSessionUser } from "@/lib/getUser";

interface Props {
  profile: any;
}

const OrganizationSection = ({ profile }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgDesc, setOrgDesc] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const { data: orgs = [] } = useQuery({
    queryKey: ["organizations", profile?.id],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return [];
      const { data } = await supabase
        .from("organizations")
        .select("*")
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!profile?.id,
  });

  useEffect(() => {
    if (orgs.length > 0 && !selectedOrgId) setSelectedOrgId(orgs[0].id);
  }, [orgs, selectedOrgId]);

  const { data: orgTeams = [] } = useQuery({
    queryKey: ["org-teams", selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return [];
      const { data } = await supabase
        .from("organization_teams")
        .select(`
          id,
          joined_at,
          team:teams(
            id, name, description, join_code,
            team_members(id, user_id),
            team_coaches(id, user_id)
          )
        `)
        .eq("organization_id", selectedOrgId);
      return data || [];
    },
    enabled: !!selectedOrgId,
  });

  const { data: orgAdmins = [] } = useQuery({
    queryKey: ["org-admins", selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return [];
      const { data } = await supabase
        .from("organization_admins")
        .select("*, profile:profiles(full_name, username, email)")
        .eq("organization_id", selectedOrgId);
      return data || [];
    },
    enabled: !!selectedOrgId,
  });

  const { data: orgMessages = [] } = useQuery({
    queryKey: ["org-messages", selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return [];
      const { data } = await supabase
        .from("org_messages")
        .select("*, profile:profiles(full_name, username)")
        .eq("organization_id", selectedOrgId)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!selectedOrgId,
  });

  // Cross-team athlete leaderboard
  const { data: leaderboard = [] } = useQuery({
    queryKey: ["org-leaderboard", selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return [];
      const teamIds = orgTeams.map((ot: any) => ot.team?.id).filter(Boolean);
      if (teamIds.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, username, best_2k_seconds")
        .in(
          "id",
          (await supabase.from("team_members").select("user_id").in("team_id", teamIds)).data?.map((m: any) => m.user_id) || []
        )
        .not("best_2k_seconds", "is", null)
        .order("best_2k_seconds", { ascending: true })
        .limit(20);
      return data || [];
    },
    enabled: !!selectedOrgId && orgTeams.length > 0,
  });

  const selectedOrg = orgs.find((o: any) => o.id === selectedOrgId);
  const isAdmin = selectedOrg?.created_by === profile?.id ||
    orgAdmins.some((a: any) => a.user_id === profile?.id && a.role === "admin");

  const createOrg = useMutation({
    mutationFn: async () => {
      if (!orgName.trim()) throw new Error("Organization name is required");
      const user = await getSessionUser();
      if (!user) throw new Error("Not authenticated");
      const { data: org, error } = await supabase
        .from("organizations")
        .insert({ name: orgName.trim(), description: orgDesc.trim() || null, created_by: user.id })
        .select()
        .single();
      if (error) throw error;
      const { error: adminError } = await supabase
        .from("organization_admins")
        .insert({ organization_id: org.id, user_id: user.id, role: "admin" });
      if (adminError) throw adminError;
      return org;
    },
    onSuccess: (org) => {
      toast({ title: "Organization created!" });
      setOrgName(""); setOrgDesc(""); setShowCreate(false);
      setSelectedOrgId(org.id);
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addTeamByCode = useMutation({
    mutationFn: async () => {
      if (!joinCode.trim() || !selectedOrgId) return;
      const { data: team } = await supabase
        .from("teams")
        .select("id")
        .eq("join_code", joinCode.trim())
        .maybeSingle();
      if (!team) throw new Error("Team not found with that join code");
      const { error } = await supabase
        .from("organization_teams")
        .insert({ organization_id: selectedOrgId, team_id: team.id });
      if (error) {
        if (error.code === "23505") throw new Error("Team is already in this organization");
        throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Team added!" });
      setJoinCode("");
      queryClient.invalidateQueries({ queryKey: ["org-teams", selectedOrgId] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeTeam = useMutation({
    mutationFn: async (orgTeamId: string) => {
      const { error } = await supabase.from("organization_teams").delete().eq("id", orgTeamId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-teams", selectedOrgId] });
    },
  });

  const postMessage = useMutation({
    mutationFn: async () => {
      if (!newMessage.trim() || !selectedOrgId) return;
      const user = await getSessionUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("org_messages")
        .insert({ organization_id: selectedOrgId, user_id: user.id, content: newMessage.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ["org-messages", selectedOrgId] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const formatSplit = (seconds: number) => {
    if (!seconds) return "--:--";
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  if (orgs.length === 0 && !showCreate) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold">No Organizations Yet</h3>
              <p className="text-muted-foreground text-sm mt-1">
                Create an organization to manage multiple teams under one umbrella.
              </p>
            </div>
            <Button onClick={() => setShowCreate(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Organization
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Org selector / create */}
      <div className="flex items-center gap-2 flex-wrap">
        {orgs.map((org: any) => (
          <button
            key={org.id}
            onClick={() => setSelectedOrgId(org.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              selectedOrgId === org.id
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border hover:bg-muted"
            }`}
          >
            {org.name}
          </button>
        ))}
        <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="h-3.5 w-3.5" />
          New Org
        </Button>
      </div>

      {/* Create org form */}
      {showCreate && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Create Organization</CardTitle>
            <CardDescription>Group multiple teams under one organization</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Organization Name</Label>
              <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="e.g., CRI Rowing" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description (optional)</Label>
              <Textarea value={orgDesc} onChange={(e) => setOrgDesc(e.target.value)} placeholder="Brief description..." rows={2} />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => createOrg.mutate()} disabled={createOrg.isPending}>Create</Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedOrg && (
        <Tabs defaultValue="teams">
          <TabsList className="h-9">
            <TabsTrigger value="teams" className="text-xs gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Teams ({orgTeams.length})
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="text-xs gap-1.5">
              <Trophy className="h-3.5 w-3.5" />
              Leaderboard
            </TabsTrigger>
            <TabsTrigger value="board" className="text-xs gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />
              Announcements
            </TabsTrigger>
          </TabsList>

          {/* Teams tab */}
          <TabsContent value="teams" className="space-y-3 mt-3">
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="py-3 text-center">
                  <p className="text-2xl font-bold">{orgTeams.length}</p>
                  <p className="text-xs text-muted-foreground">Teams</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-3 text-center">
                  <p className="text-2xl font-bold">
                    {orgTeams.reduce((sum: number, ot: any) => sum + (ot.team?.team_members?.length || 0), 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Athletes</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-3 text-center">
                  <p className="text-2xl font-bold">
                    {orgTeams.reduce((sum: number, ot: any) => sum + (ot.team?.team_coaches?.length || 0), 0) + orgTeams.length}
                  </p>
                  <p className="text-xs text-muted-foreground">Coaches</p>
                </CardContent>
              </Card>
            </div>

            {/* Teams list */}
            {orgTeams.map((ot: any) => (
              <Card key={ot.id}>
                <CardHeader className="pb-2 pt-3">
                  <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedTeam(expandedTeam === ot.id ? null : ot.id)}>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-sm">{ot.team?.name}</CardTitle>
                      <Badge variant="outline" className="text-xs">{ot.team?.team_members?.length || 0} athletes</Badge>
                      <Badge variant="outline" className="text-xs">{(ot.team?.team_coaches?.length || 0) + 1} coaches</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {isAdmin && (
                        <Button
                          variant="ghost" size="sm" className="h-7 text-xs text-destructive"
                          onClick={(e) => { e.stopPropagation(); removeTeam.mutate(ot.id); }}
                        >
                          Remove
                        </Button>
                      )}
                      {expandedTeam === ot.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>
                </CardHeader>
                {expandedTeam === ot.id && (
                  <CardContent className="pt-0 text-sm text-muted-foreground">
                    {ot.team?.description && <p className="mb-2">{ot.team.description}</p>}
                    <p className="text-xs">Join code: <span className="font-mono font-semibold text-foreground">{ot.team?.join_code || "—"}</span></p>
                    <p className="text-xs mt-0.5">Added {new Date(ot.joined_at).toLocaleDateString()}</p>
                  </CardContent>
                )}
              </Card>
            ))}

            {/* Add team by join code */}
            {isAdmin && (
              <Card>
                <CardContent className="py-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Add Team by Join Code</p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter team join code"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addTeamByCode.mutate()}
                      className="flex-1 font-mono"
                    />
                    <Button onClick={() => addTeamByCode.mutate()} disabled={addTeamByCode.isPending}>
                      Add
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Cross-team leaderboard */}
          <TabsContent value="leaderboard" className="mt-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Fastest Athletes Across {selectedOrg.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {leaderboard.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No erg scores recorded yet across teams.</p>
                ) : (
                  <div className="space-y-2">
                    {leaderboard.map((athlete: any, i: number) => (
                      <div key={athlete.id} className="flex items-center gap-3 p-2 border rounded-lg text-sm">
                        <span className={`w-6 text-center font-bold text-xs ${i < 3 ? "text-amber-500" : "text-muted-foreground"}`}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{athlete.full_name || athlete.username}</p>
                        </div>
                        <span className="font-mono text-sm font-semibold text-primary">
                          {formatSplit(athlete.best_2k_seconds)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Org announcements */}
          <TabsContent value="board" className="mt-3 space-y-3">
            {/* Post form */}
            <Card>
              <CardContent className="py-3 space-y-2">
                <Textarea
                  placeholder="Post an announcement to all teams..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  rows={3}
                  maxLength={1000}
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => postMessage.mutate()}
                    disabled={postMessage.isPending || !newMessage.trim()}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Post
                  </Button>
                </div>
              </CardContent>
            </Card>

            {orgMessages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No announcements yet.</p>
            ) : (
              orgMessages.map((msg: any) => (
                <Card key={msg.id}>
                  <CardContent className="py-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-semibold">
                        {msg.profile?.full_name || msg.profile?.username || "Unknown"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(msg.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default OrganizationSection;
