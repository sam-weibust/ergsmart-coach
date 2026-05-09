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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Users, Trophy, MessageSquare, Plus, Send, BarChart3, ChevronDown, ChevronUp,
  Wrench, DollarSign, ClipboardList, UserCheck, Settings, Flag, Shield,
} from "lucide-react";
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

  // Equipment form
  const [eqName, setEqName] = useState("");
  const [eqType, setEqType] = useState("shell");
  const [eqCondition, setEqCondition] = useState("3");
  const [eqNotes, setEqNotes] = useState("");

  // Membership tier form
  const [tierName, setTierName] = useState("");
  const [tierPrice, setTierPrice] = useState("");
  const [tierPeriod, setTierPeriod] = useState("annual");

  // Volunteer form
  const [volUserId, setVolUserId] = useState("");
  const [volHours, setVolHours] = useState("");
  const [volDate, setVolDate] = useState(new Date().toISOString().split("T")[0]);
  const [volNotes, setVolNotes] = useState("");

  // Org settings form
  const [orgWebsite, setOrgWebsite] = useState("");
  const [orgContact, setOrgContact] = useState("");
  const [orgLogoUrl, setOrgLogoUrl] = useState("");

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

  useEffect(() => {
    const org = orgs.find((o: any) => o.id === selectedOrgId);
    if (org) {
      setOrgWebsite(org.website || "");
      setOrgContact(org.contact_email || "");
      setOrgLogoUrl(org.logo_url || "");
    }
  }, [selectedOrgId, orgs]);

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

  const { data: leaderboard = [] } = useQuery({
    queryKey: ["org-leaderboard", selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return [];
      const teamIds = orgTeams.map((ot: any) => ot.team?.id).filter(Boolean);
      if (teamIds.length === 0) return [];
      const { data: memberData } = await supabase
        .from("team_members")
        .select("user_id")
        .in("team_id", teamIds);
      const userIds = (memberData || []).map((m: any) => m.user_id).filter(Boolean);
      if (userIds.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, username, best_2k_seconds")
        .in("id", userIds)
        .not("best_2k_seconds", "is", null)
        .order("best_2k_seconds", { ascending: true })
        .limit(20);
      return data || [];
    },
    enabled: !!selectedOrgId && orgTeams.length > 0,
  });

  const { data: equipment = [] } = useQuery({
    queryKey: ["org-equipment", selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return [];
      const { data } = await supabase
        .from("equipment" as any)
        .select("*")
        .eq("org_id", selectedOrgId)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!selectedOrgId,
  });

  const { data: membershipTiers = [] } = useQuery({
    queryKey: ["membership-tiers", selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return [];
      const { data } = await supabase
        .from("membership_tiers" as any)
        .select("*")
        .eq("org_id", selectedOrgId)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!selectedOrgId,
  });

  const { data: membershipPayments = [] } = useQuery({
    queryKey: ["membership-payments", selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return [];
      const { data } = await supabase
        .from("membership_payments" as any)
        .select("*, profile:profiles(full_name, username), tier:membership_tiers(name)")
        .eq("org_id", selectedOrgId)
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: !!selectedOrgId,
  });

  const { data: volunteerHours = [] } = useQuery({
    queryKey: ["volunteer-hours", selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return [];
      const { data } = await supabase
        .from("volunteer_hours" as any)
        .select("*, profile:profiles(full_name, username)")
        .eq("org_id", selectedOrgId)
        .order("date", { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: !!selectedOrgId,
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["org-teams", selectedOrgId] }); },
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

  const addEquipment = useMutation({
    mutationFn: async () => {
      if (!eqName.trim() || !selectedOrgId) return;
      const { error } = await supabase.from("equipment" as any).insert({
        org_id: selectedOrgId,
        name: eqName.trim(),
        type: eqType,
        condition: parseInt(eqCondition),
        notes: eqNotes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setEqName(""); setEqNotes("");
      queryClient.invalidateQueries({ queryKey: ["org-equipment", selectedOrgId] });
      toast({ title: "Equipment added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleEquipmentFlag = useMutation({
    mutationFn: async ({ id, is_flagged }: { id: string; is_flagged: boolean }) => {
      const { error } = await supabase.from("equipment" as any).update({ is_flagged }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["org-equipment", selectedOrgId] }); },
  });

  const addMembershipTier = useMutation({
    mutationFn: async () => {
      if (!tierName.trim() || !tierPrice || !selectedOrgId) return;
      const { error } = await supabase.from("membership_tiers" as any).insert({
        org_id: selectedOrgId,
        name: tierName.trim(),
        price: parseFloat(tierPrice),
        billing_period: tierPeriod,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTierName(""); setTierPrice("");
      queryClient.invalidateQueries({ queryKey: ["membership-tiers", selectedOrgId] });
      toast({ title: "Membership tier added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addVolunteerHours = useMutation({
    mutationFn: async () => {
      if (!volHours || !selectedOrgId) return;
      const user = await getSessionUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("volunteer_hours" as any).insert({
        org_id: selectedOrgId,
        user_id: volUserId || user.id,
        hours: parseFloat(volHours),
        date: volDate,
        notes: volNotes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setVolHours(""); setVolNotes("");
      queryClient.invalidateQueries({ queryKey: ["volunteer-hours", selectedOrgId] });
      toast({ title: "Volunteer hours logged" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveOrgSettings = useMutation({
    mutationFn: async () => {
      if (!selectedOrgId) return;
      const { error } = await supabase.from("organizations").update({
        website: orgWebsite.trim() || null,
        contact_email: orgContact.trim() || null,
        logo_url: orgLogoUrl.trim() || null,
      }).eq("id", selectedOrgId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations", profile?.id] });
      toast({ title: "Settings saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const formatSplit = (seconds: number) => {
    if (!seconds) return "--:--";
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const conditionLabel = (c: number) => ["", "Poor", "Fair", "Good", "Very Good", "Excellent"][c] || "?";
  const conditionColor = (c: number) => c <= 2 ? "text-red-500" : c === 3 ? "text-yellow-500" : "text-green-500";

  const totalRevenue = membershipPayments
    .filter((p: any) => p.status === "paid")
    .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

  const totalVolHours = volunteerHours.reduce((sum: number, v: any) => sum + Number(v.hours), 0);

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
            {org.logo_url && (
              <img src={org.logo_url} alt="" className="h-4 w-4 rounded inline-block mr-1.5 object-contain" />
            )}
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
          <TabsList className="h-9 flex-wrap gap-0.5">
            <TabsTrigger value="teams" className="text-xs gap-1">
              <Users className="h-3.5 w-3.5" />
              Teams ({orgTeams.length})
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="text-xs gap-1">
              <Trophy className="h-3.5 w-3.5" />
              Leaderboard
            </TabsTrigger>
            <TabsTrigger value="board" className="text-xs gap-1">
              <MessageSquare className="h-3.5 w-3.5" />
              Announcements
            </TabsTrigger>
            <TabsTrigger value="equipment" className="text-xs gap-1">
              <Wrench className="h-3.5 w-3.5" />
              Equipment
            </TabsTrigger>
            <TabsTrigger value="dues" className="text-xs gap-1">
              <DollarSign className="h-3.5 w-3.5" />
              Dues
            </TabsTrigger>
            <TabsTrigger value="volunteers" className="text-xs gap-1">
              <UserCheck className="h-3.5 w-3.5" />
              Volunteers
            </TabsTrigger>
            <TabsTrigger value="report" className="text-xs gap-1">
              <ClipboardList className="h-3.5 w-3.5" />
              Board Report
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="settings" className="text-xs gap-1">
                <Settings className="h-3.5 w-3.5" />
                Settings
              </TabsTrigger>
            )}
          </TabsList>

          {/* Teams tab */}
          <TabsContent value="teams" className="space-y-3 mt-3">
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

            {/* SafeSport indicator */}
            <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
              <Shield className="h-3.5 w-3.5 shrink-0" />
              <span><strong>SafeSport Compliant</strong> — all coach-athlete messaging across this organization is transparent and visible to all coaches.</span>
            </div>

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
                    Post to All Teams
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
                      <Badge className="text-[10px] h-4 px-1 bg-amber-500">ORG</Badge>
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

          {/* Equipment inventory */}
          <TabsContent value="equipment" className="mt-3 space-y-3">
            {isAdmin && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Add Equipment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={eqName} onChange={(e) => setEqName(e.target.value)} placeholder="Name (e.g., 8+ Varsity)" />
                    <Select value={eqType} onValueChange={setEqType}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="shell">Shell</SelectItem>
                        <SelectItem value="oar">Oar</SelectItem>
                        <SelectItem value="erg">Erg</SelectItem>
                        <SelectItem value="launch">Coaching Launch</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={eqCondition} onValueChange={setEqCondition}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Condition" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 — Poor</SelectItem>
                        <SelectItem value="2">2 — Fair</SelectItem>
                        <SelectItem value="3">3 — Good</SelectItem>
                        <SelectItem value="4">4 — Very Good</SelectItem>
                        <SelectItem value="5">5 — Excellent</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input value={eqNotes} onChange={(e) => setEqNotes(e.target.value)} placeholder="Notes (optional)" />
                  </div>
                  <Button size="sm" onClick={() => addEquipment.mutate()} disabled={addEquipment.isPending || !eqName.trim()}>
                    <Plus className="h-4 w-4 mr-1" /> Add Item
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Flagged items first */}
            {(equipment as any[]).filter((e: any) => e.is_flagged).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Flag className="h-3 w-3" /> Needs Repair
                </p>
                {(equipment as any[]).filter((e: any) => e.is_flagged).map((item: any) => (
                  <EquipmentRow key={item.id} item={item} isAdmin={isAdmin} onFlag={() => toggleEquipmentFlag.mutate({ id: item.id, is_flagged: !item.is_flagged })} conditionLabel={conditionLabel} conditionColor={conditionColor} />
                ))}
              </div>
            )}

            <div className="space-y-2">
              {(equipment as any[]).filter((e: any) => !e.is_flagged).length === 0 && (equipment as any[]).filter((e: any) => e.is_flagged).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No equipment added yet.</p>
              )}
              {(equipment as any[]).filter((e: any) => !e.is_flagged).map((item: any) => (
                <EquipmentRow key={item.id} item={item} isAdmin={isAdmin} onFlag={() => toggleEquipmentFlag.mutate({ id: item.id, is_flagged: !item.is_flagged })} conditionLabel={conditionLabel} conditionColor={conditionColor} />
              ))}
            </div>
          </TabsContent>

          {/* Dues / Membership */}
          <TabsContent value="dues" className="mt-3 space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="py-3 text-center">
                  <p className="text-2xl font-bold text-green-600">${totalRevenue.toFixed(0)}</p>
                  <p className="text-xs text-muted-foreground">Revenue Collected</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-3 text-center">
                  <p className="text-2xl font-bold">{(membershipPayments as any[]).filter((p: any) => p.status === "paid").length}</p>
                  <p className="text-xs text-muted-foreground">Paid</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-3 text-center">
                  <p className="text-2xl font-bold text-red-500">{(membershipPayments as any[]).filter((p: any) => p.status === "overdue").length}</p>
                  <p className="text-xs text-muted-foreground">Overdue</p>
                </CardContent>
              </Card>
            </div>

            {/* Tiers */}
            {isAdmin && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Add Membership Tier</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <Input value={tierName} onChange={(e) => setTierName(e.target.value)} placeholder="e.g., Junior Annual" />
                    <Input value={tierPrice} onChange={(e) => setTierPrice(e.target.value)} placeholder="Price ($)" type="number" min="0" />
                    <Select value={tierPeriod} onValueChange={setTierPeriod}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="annual">Annual</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="one_time">One-time</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button size="sm" onClick={() => addMembershipTier.mutate()} disabled={addMembershipTier.isPending || !tierName.trim() || !tierPrice}>
                    <Plus className="h-4 w-4 mr-1" /> Add Tier
                  </Button>
                </CardContent>
              </Card>
            )}

            {(membershipTiers as any[]).length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tiers</p>
                {(membershipTiers as any[]).map((tier: any) => (
                  <div key={tier.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
                    <span className="font-medium">{tier.name}</span>
                    <span className="text-muted-foreground">${tier.price}/{tier.billing_period}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Payments */}
            {(membershipPayments as any[]).length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payments</p>
                {(membershipPayments as any[]).map((pay: any) => (
                  <div key={pay.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">{pay.profile?.full_name || pay.profile?.username || "—"}</p>
                      <p className="text-xs text-muted-foreground">{pay.tier?.name || "—"} · Due {pay.due_date || "—"}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">${Number(pay.amount).toFixed(2)}</p>
                      <Badge className={`text-[10px] h-4 px-1 ${pay.status === "paid" ? "bg-green-500" : pay.status === "overdue" ? "bg-red-500" : "bg-yellow-500"}`}>
                        {pay.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(membershipPayments as any[]).length === 0 && (membershipTiers as any[]).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No membership tiers or payments yet.</p>
            )}
          </TabsContent>

          {/* Volunteers */}
          <TabsContent value="volunteers" className="mt-3 space-y-3">
            <Card>
              <CardContent className="py-3 text-center">
                <p className="text-2xl font-bold">{totalVolHours.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">Total Volunteer Hours This Season</p>
              </CardContent>
            </Card>

            {isAdmin && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Log Volunteer Hours</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={volHours} onChange={(e) => setVolHours(e.target.value)} placeholder="Hours" type="number" min="0" step="0.5" />
                    <Input value={volDate} onChange={(e) => setVolDate(e.target.value)} type="date" />
                  </div>
                  <Input value={volNotes} onChange={(e) => setVolNotes(e.target.value)} placeholder="Notes (optional)" />
                  <Button size="sm" onClick={() => addVolunteerHours.mutate()} disabled={addVolunteerHours.isPending || !volHours}>
                    <Plus className="h-4 w-4 mr-1" /> Log Hours
                  </Button>
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              {(volunteerHours as any[]).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No volunteer hours logged yet.</p>
              )}
              {(volunteerHours as any[]).map((v: any) => (
                <div key={v.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{v.profile?.full_name || v.profile?.username || "Volunteer"}</p>
                    {v.notes && <p className="text-xs text-muted-foreground">{v.notes}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{v.hours} hrs</p>
                    <p className="text-xs text-muted-foreground">{new Date(v.date).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Board Report */}
          <TabsContent value="report" className="mt-3 space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Season Board Report — {selectedOrg.name}
                </CardTitle>
                <CardDescription className="text-xs">Summary for board meetings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Total Teams", value: orgTeams.length },
                    { label: "Total Athletes", value: orgTeams.reduce((s: number, ot: any) => s + (ot.team?.team_members?.length || 0), 0) },
                    { label: "Total Coaches", value: orgTeams.reduce((s: number, ot: any) => s + (ot.team?.team_coaches?.length || 0), 0) + orgTeams.length },
                    { label: "Equipment Items", value: (equipment as any[]).length },
                    { label: "Revenue Collected", value: `$${totalRevenue.toFixed(0)}` },
                    { label: "Volunteer Hours", value: totalVolHours.toFixed(1) },
                    { label: "Dues Paid", value: (membershipPayments as any[]).filter((p: any) => p.status === "paid").length },
                    { label: "Dues Overdue", value: (membershipPayments as any[]).filter((p: any) => p.status === "overdue").length },
                  ].map(({ label, value }) => (
                    <div key={label} className="border rounded-lg p-3">
                      <p className="text-lg font-bold">{value}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Top Athletes by 2k</p>
                  {leaderboard.slice(0, 5).map((a: any, i: number) => (
                    <div key={a.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                      <span className={`w-5 font-bold text-xs ${i < 3 ? "text-amber-500" : "text-muted-foreground"}`}>{i + 1}</span>
                      <span className="flex-1">{a.full_name || a.username}</span>
                      <span className="font-mono font-semibold">{formatSplit(a.best_2k_seconds)}</span>
                    </div>
                  ))}
                </div>

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Equipment Needing Repair</p>
                  {(equipment as any[]).filter((e: any) => e.is_flagged).length === 0
                    ? <p className="text-sm text-green-600">All equipment in good condition.</p>
                    : (equipment as any[]).filter((e: any) => e.is_flagged).map((e: any) => (
                      <p key={e.id} className="text-sm text-red-500">⚠ {e.name} ({e.type})</p>
                    ))
                  }
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    const lines = [
                      `Board Report — ${selectedOrg.name}`,
                      `Date: ${new Date().toLocaleDateString()}`,
                      "",
                      `Teams: ${orgTeams.length}`,
                      `Athletes: ${orgTeams.reduce((s: number, ot: any) => s + (ot.team?.team_members?.length || 0), 0)}`,
                      `Coaches: ${orgTeams.reduce((s: number, ot: any) => s + (ot.team?.team_coaches?.length || 0), 0) + orgTeams.length}`,
                      `Revenue Collected: $${totalRevenue.toFixed(2)}`,
                      `Volunteer Hours: ${totalVolHours.toFixed(1)}`,
                      `Equipment Items: ${(equipment as any[]).length}`,
                      `Items Needing Repair: ${(equipment as any[]).filter((e: any) => e.is_flagged).length}`,
                    ];
                    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `board-report-${selectedOrg.name.replace(/\s+/g, "-")}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Export Report
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Org settings */}
          {isAdmin && (
            <TabsContent value="settings" className="mt-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Organization Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Organization Name</Label>
                    <Input value={selectedOrg.name} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Logo URL</Label>
                    <Input value={orgLogoUrl} onChange={(e) => setOrgLogoUrl(e.target.value)} placeholder="https://..." />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Website</Label>
                    <Input value={orgWebsite} onChange={(e) => setOrgWebsite(e.target.value)} placeholder="https://..." />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Contact Email</Label>
                    <Input value={orgContact} onChange={(e) => setOrgContact(e.target.value)} placeholder="director@club.org" type="email" />
                  </div>
                  <Button onClick={() => saveOrgSettings.mutate()} disabled={saveOrgSettings.isPending}>
                    Save Settings
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
};

// Equipment row sub-component
function EquipmentRow({ item, isAdmin, onFlag, conditionLabel, conditionColor }: {
  item: any;
  isAdmin: boolean;
  onFlag: () => void;
  conditionLabel: (c: number) => string;
  conditionColor: (c: number) => string;
}) {
  return (
    <div className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{item.name}</span>
          <Badge variant="outline" className="text-[10px] h-4 px-1">{item.type}</Badge>
          {item.is_flagged && <Flag className="h-3 w-3 text-red-500" />}
        </div>
        {item.notes && <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>}
      </div>
      <div className="text-right shrink-0">
        <p className={`text-xs font-semibold ${conditionColor(item.condition)}`}>
          {item.condition}/5 — {conditionLabel(item.condition)}
        </p>
        {isAdmin && (
          <button onClick={onFlag} className="text-[11px] text-muted-foreground hover:text-red-500 transition-colors">
            {item.is_flagged ? "Unflag" : "Flag for repair"}
          </button>
        )}
      </div>
    </div>
  );
}

export default OrganizationSection;
