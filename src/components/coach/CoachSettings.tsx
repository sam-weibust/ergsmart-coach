import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/getUser";
import { useTeamBranding } from "@/context/TeamBrandingContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
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
  Palette, Upload, Users, Settings, Bell, User, PlusCircle,
  Trash2, Copy, Check, RefreshCw, UserMinus, LogOut, ChevronDown,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Props {
  profile: any;
  coachTeam: any;
}

const CoachSettings = ({ profile, coachTeam }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { logoUrl, primaryColor } = useTeamBranding();

  // Section expansion state
  const [openSection, setOpenSection] = useState<string | null>("team-settings");

  // Team branding state
  const [newColor, setNewColor] = useState(primaryColor || "#0a1628");
  const [logoUploading, setLogoUploading] = useState(false);

  // Team settings state
  const [teamNameEdit, setTeamNameEdit] = useState(coachTeam?.name || "");
  const [teamLocation, setTeamLocation] = useState(coachTeam?.location || "");
  const [teamDivision, setTeamDivision] = useState(coachTeam?.division || "");
  const [copiedCode, setCopiedCode] = useState(false);

  // Coaching staff state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("coach");

  // Profile state
  const [fullName, setFullName] = useState((profile as any)?.full_name || "");
  const [savingProfile, setSavingProfile] = useState(false);

  // Create team state (no team yet)
  const [newTeamName, setNewTeamName] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);

  const isHeadCoach =
    (profile as any)?.user_type === "head_coach" ||
    coachTeam?.coach_id === profile?.id;

  // Load coaching staff
  const { data: coachStaff = [] } = useQuery({
    queryKey: ["team-coaches-staff", coachTeam?.id],
    queryFn: async () => {
      if (!coachTeam?.id) return [];
      const { data } = await supabase
        .from("team_coaches" as any)
        .select("id, user_id, role, joined_at, profile:profiles(id, full_name, email)")
        .eq("team_id", coachTeam.id);
      return data || [];
    },
    enabled: !!coachTeam?.id,
  });

  const toggle = (id: string) => setOpenSection((prev) => (prev === id ? null : id));

  const saveTeamSettings = useMutation({
    mutationFn: async () => {
      if (!coachTeam?.id) return;
      const { error } = await supabase
        .from("teams")
        .update({ name: teamNameEdit.trim(), location: teamLocation.trim() || null })
        .eq("id", coachTeam.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Team settings saved" });
      queryClient.invalidateQueries({ queryKey: ["coach-primary-team"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const regenerateCode = useMutation({
    mutationFn: async () => {
      if (!coachTeam?.id) return;
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
      const { error } = await supabase.from("teams").update({ join_code: code }).eq("id", coachTeam.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Join code regenerated" });
      queryClient.invalidateQueries({ queryKey: ["coach-primary-team"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const inviteCoach = useMutation({
    mutationFn: async () => {
      if (!inviteEmail.trim() || !coachTeam?.id) return;
      const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
      const token = Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase.from("coach_invites").insert({
        team_id: coachTeam.id,
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        invited_by: profile.id,
        token,
        expires_at: expires,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Invite sent" });
      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ["team-coaches-staff"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeCoach = useMutation({
    mutationFn: async (staffId: string) => {
      const { error } = await supabase.from("team_coaches" as any).delete().eq("id", staffId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Coach removed" });
      queryClient.invalidateQueries({ queryKey: ["team-coaches-staff"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const user = await getSessionUser();
      if (!user) return;
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim() || null })
        .eq("id", user.id);
      if (error) throw error;
      toast({ title: "Profile saved" });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  };

  const createTeam = async () => {
    if (!newTeamName.trim()) return;
    setCreatingTeam(true);
    try {
      const { error } = await supabase.from("teams").insert({
        name: newTeamName.trim(),
        coach_id: profile.id,
      });
      if (error) throw error;
      toast({ title: "Team created!" });
      setNewTeamName("");
      queryClient.invalidateQueries({ queryKey: ["coach-primary-team"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !coachTeam?.id) return;
    setLogoUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `team-logos/${coachTeam.id}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: updateError } = await supabase
        .from("teams")
        .update({ logo_url: publicUrl })
        .eq("id", coachTeam.id);
      if (updateError) throw updateError;
      toast({ title: "Logo updated" });
      queryClient.invalidateQueries({ queryKey: ["coach-primary-team"] });
      queryClient.invalidateQueries({ queryKey: ["team-branding"] });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setLogoUploading(false);
    }
  };

  const leaveTeam = async () => {
    if (!coachTeam?.id) return;
    try {
      await supabase.from("team_coaches" as any).delete().eq("team_id", coachTeam.id).eq("user_id", profile.id);
      toast({ title: "You left the team" });
      queryClient.invalidateQueries({ queryKey: ["coach-primary-team"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const deleteTeam = async () => {
    if (!coachTeam?.id) return;
    try {
      const { error } = await supabase.from("teams").delete().eq("id", coachTeam.id);
      if (error) throw error;
      toast({ title: "Team deleted" });
      queryClient.invalidateQueries({ queryKey: ["coach-primary-team"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const SectionHeader = ({ id, label, icon: Icon }: { id: string; label: string; icon: React.ElementType }) => (
    <button
      onClick={() => toggle(id)}
      className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/70 transition-colors rounded-xl"
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <ChevronDown
        className="h-4 w-4 text-muted-foreground transition-transform"
        style={{ transform: openSection === id ? "rotate(180deg)" : "rotate(0deg)" }}
      />
    </button>
  );

  return (
    <div className="space-y-3 pb-6">
      <h2 className="text-base font-bold text-foreground px-1">Settings</h2>

      {/* Team Branding */}
      {coachTeam && (
        <div>
          <SectionHeader id="branding" label="Team Branding" icon={Palette} />
          {openSection === "branding" && (
            <Card className="mt-1 rounded-t-none">
              <CardContent className="pt-4 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-xl overflow-hidden border border-border bg-muted flex items-center justify-center shrink-0">
                    {logoUrl
                      ? <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
                      : <span className="text-2xl font-bold text-muted-foreground">{coachTeam.name?.[0] || "T"}</span>}
                  </div>
                  <div className="flex-1 space-y-2">
                    <Label className="text-xs">Team Logo</Label>
                    <label className="cursor-pointer">
                      <Button variant="outline" size="sm" className="pointer-events-none" disabled={logoUploading}>
                        <Upload className="h-3.5 w-3.5 mr-1.5" />
                        {logoUploading ? "Uploading…" : "Upload Logo"}
                      </Button>
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    </label>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Primary Color</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      className="h-9 w-16 rounded-lg border border-border cursor-pointer p-0.5"
                    />
                    <span className="text-sm font-mono text-muted-foreground">{newColor}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        if (!coachTeam?.id) return;
                        const { error } = await supabase
                          .from("teams")
                          .update({ primary_color: newColor } as any)
                          .eq("id", coachTeam.id);
                        if (!error) {
                          toast({ title: "Color saved" });
                          queryClient.invalidateQueries({ queryKey: ["team-branding"] });
                        }
                      }}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Team Settings */}
      {coachTeam && (
        <div>
          <SectionHeader id="team-settings" label="Team Settings" icon={Settings} />
          {openSection === "team-settings" && (
            <Card className="mt-1 rounded-t-none">
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Team Name</Label>
                  <Input value={teamNameEdit} onChange={(e) => setTeamNameEdit(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Location</Label>
                  <Input
                    placeholder="City, State"
                    value={teamLocation}
                    onChange={(e) => setTeamLocation(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => saveTeamSettings.mutate()}
                  disabled={saveTeamSettings.isPending}
                >
                  Save Changes
                </Button>

                {coachTeam.join_code && (
                  <div className="border border-border rounded-xl p-4 space-y-2 bg-muted/30">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Join Code</p>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-mono font-bold tracking-widest text-foreground">
                        {coachTeam.join_code}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => {
                          navigator.clipboard.writeText(coachTeam.join_code);
                          setCopiedCode(true);
                          setTimeout(() => setCopiedCode(false), 2000);
                        }}
                      >
                        {copiedCode ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => regenerateCode.mutate()}
                        disabled={regenerateCode.isPending}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Share with athletes to join your team.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Coaching Staff */}
      {coachTeam && (
        <div>
          <SectionHeader id="staff" label="Coaching Staff" icon={Users} />
          {openSection === "staff" && (
            <Card className="mt-1 rounded-t-none">
              <CardContent className="pt-4 space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Email address"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={() => inviteCoach.mutate()}
                    disabled={inviteCoach.isPending || !inviteEmail.trim()}
                  >
                    Invite
                  </Button>
                </div>
                {(coachStaff as any[]).length > 0 && (
                  <div className="space-y-2">
                    {(coachStaff as any[]).map((s: any) => (
                      <div key={s.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                        <div>
                          <p className="text-sm font-medium">{s.profile?.full_name || s.profile?.email || "Coach"}</p>
                          <p className="text-xs text-muted-foreground">{s.profile?.email}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">{s.role || "coach"}</Badge>
                          {isHeadCoach && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-7 w-7">
                                  <UserMinus className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remove Coach</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Remove {s.profile?.full_name || "this coach"} from the staff?
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => removeCoach.mutate(s.id)}>Remove</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {(coachStaff as any[]).length === 0 && (
                  <p className="text-xs text-muted-foreground">No additional coaches yet.</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Notifications */}
      <div>
        <SectionHeader id="notifications" label="Notifications" icon={Bell} />
        {openSection === "notifications" && (
          <Card className="mt-1 rounded-t-none">
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">
                Push notification preferences coming soon.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* My Profile */}
      <div>
        <SectionHeader id="my-profile" label="My Profile" icon={User} />
        {openSection === "my-profile" && (
          <Card className="mt-1 rounded-t-none">
            <CardContent className="pt-4 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Full Name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input value={(profile as any)?.email || ""} disabled className="bg-muted/40" />
              </div>
              <Button size="sm" onClick={saveProfile} disabled={savingProfile}>
                {savingProfile ? "Saving…" : "Save Profile"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create New Team — only when no team */}
      {!coachTeam && (
        <div>
          <SectionHeader id="create-team" label="Create New Team" icon={PlusCircle} />
          {openSection === "create-team" && (
            <Card className="mt-1 rounded-t-none">
              <CardContent className="pt-4 space-y-3">
                <Input
                  placeholder="Team name"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                />
                <Button
                  size="sm"
                  className="w-full"
                  onClick={createTeam}
                  disabled={creatingTeam || !newTeamName.trim()}
                >
                  {creatingTeam ? "Creating…" : "Create Team"}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Danger Zone */}
      {coachTeam && (
        <div>
          <SectionHeader id="danger" label="Danger Zone" icon={Trash2} />
          {openSection === "danger" && (
            <Card className="mt-1 rounded-t-none border-destructive/30">
              <CardContent className="pt-4 space-y-3">
                {!isHeadCoach && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full border-destructive text-destructive hover:bg-destructive/10">
                        Leave Team
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Leave Team</AlertDialogTitle>
                        <AlertDialogDescription>
                          You will lose access to {coachTeam.name}. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={leaveTeam}>Leave</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {isHeadCoach && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" className="w-full">
                        Delete Team
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Team</AlertDialogTitle>
                        <AlertDialogDescription>
                          Permanently delete "{coachTeam.name}" and all its data? This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={deleteTeam}
                        >
                          Delete Forever
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Sign Out */}
      <div className="pt-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground hover:text-foreground"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  );
};

export default CoachSettings;
